import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TestAiRequestBody {
  model?: string;
  apiKey?: string;
  endpoint?: string;
}

async function parseErrorResponse(res: Response, modelClean: string): Promise<string> {
  let errDetail = '';
  try {
    const errJson = await res.json();
    errDetail =
      errJson?.error?.message ||
      (typeof errJson?.error === 'string' ? errJson.error : '') ||
      JSON.stringify(errJson);
  } catch {
    try {
      errDetail = await res.text();
    } catch {
      errDetail = '';
    }
  }

  if (res.status === 401) {
    return 'Invalid API Key (401 Unauthorized)';
  }
  if (
    res.status === 400 &&
    (errDetail.includes('API_KEY_INVALID') ||
      errDetail.toLowerCase().includes('api key not valid'))
  ) {
    return 'Invalid API Key (AIzaSy...)';
  }
  if (res.status === 404) {
    return `Model '${modelClean}' not found (404) or unavailable on this key.`;
  }
  if (res.status === 429) {
    return 'Rate limit or quota exceeded (429)';
  }
  if (errDetail) {
    return `Provider returned error (${res.status}): ${errDetail.slice(0, 200)}`;
  }
  return `Provider returned HTTP error ${res.status}`;
}

export async function POST(req: Request) {
  let body: TestAiRequestBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const rawModel = (body.model || '').trim();
  const rawApiKey = (body.apiKey || '').trim();
  const rawEndpoint = (body.endpoint || '').trim();

  if (!rawModel) {
    return NextResponse.json(
      { success: false, error: 'AI model is required for connection testing' },
      { status: 400 }
    );
  }

  const modelLower = rawModel.toLowerCase();
  const startTime = performance.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let provider: 'ollama' | 'groq' | 'deepseek' | 'gemini' = 'gemini';
  let baseUrl = '';

  try {
    if (
      modelLower.includes('ollama') ||
      modelLower.includes('localhost') ||
      modelLower.includes('beam')
    ) {
      provider = 'ollama';
      let modelClean =
        rawModel.replace(/^ollama\//i, '').replace(/^ollama:/i, '').trim() ||
        'llama3.2';
      if (modelClean === 'beam' || modelClean === 'beam:cloud') {
        modelClean = 'beam:cloud';
      }

      const isOllamaCloud =
        modelClean.includes('beam') ||
        modelClean.includes('oss') ||
        modelClean.includes('gemma') ||
        modelClean.includes('nemotron') ||
        (Boolean(rawApiKey) && rawApiKey !== 'ollama');

      baseUrl =
        rawEndpoint && rawEndpoint.trim().length > 0
          ? rawEndpoint.trim()
          : isOllamaCloud
          ? 'https://ollama.com'
          : 'http://127.0.0.1:11434';

      const v1Url = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';

      const res = await fetch(`${v1Url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(rawApiKey ? { Authorization: `Bearer ${rawApiKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          model: modelClean,
          messages: [
            {
              role: 'user',
              content: 'Ping test. Return JSON: {"status": "ok"}',
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          return NextResponse.json({
            success: false,
            error:
              'Invalid Ollama Cloud API Key. Verify your key at https://ollama.com/settings/keys',
          });
        }
        if (res.status === 404) {
          return NextResponse.json({
            success: false,
            error: `Model '${modelClean}' not found on ${baseUrl}.`,
          });
        }
        const errorMsg = await parseErrorResponse(res, modelClean);
        return NextResponse.json({ success: false, error: errorMsg });
      }

      const latencyMs = Math.round(performance.now() - startTime);
      return NextResponse.json({
        success: true,
        latencyMs,
        model: modelClean,
        message: `Connected to ${modelClean} (${latencyMs}ms)`,
      });
    }

    if (
      modelLower.includes('groq') ||
      modelLower.includes('llama') ||
      modelLower.includes('gpt-oss') ||
      modelLower.includes('qwen')
    ) {
      provider = 'groq';
      const effectiveKey = rawApiKey || process.env.GROQ_API_KEY || '';
      if (!effectiveKey) {
        return NextResponse.json({
          success: false,
          error: 'Groq API Key is required (starts with gsk_)',
        });
      }

      const modelClean =
        rawModel.replace(/^groq\//i, '').trim() || 'llama-3.3-70b-versatile';

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: modelClean,
          messages: [
            {
              role: 'user',
              content: 'Ping test. Return JSON: {"status": "ok"}',
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorMsg = await parseErrorResponse(res, modelClean);
        return NextResponse.json({ success: false, error: errorMsg });
      }

      const latencyMs = Math.round(performance.now() - startTime);
      return NextResponse.json({
        success: true,
        latencyMs,
        model: modelClean,
        message: `Connected to ${modelClean} (${latencyMs}ms)`,
      });
    }

    if (modelLower.includes('deepseek')) {
      provider = 'deepseek';
      const effectiveKey = rawApiKey || process.env.DEEPSEEK_API_KEY || '';
      if (!effectiveKey) {
        return NextResponse.json({
          success: false,
          error: 'DeepSeek API Key is required (starts with sk-)',
        });
      }

      const modelClean =
        rawModel.replace(/^deepseek\//i, '').trim() || 'deepseek-chat';

      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: 'Ping test. Return JSON: {"status": "ok"}',
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorMsg = await parseErrorResponse(res, modelClean);
        return NextResponse.json({ success: false, error: errorMsg });
      }

      const latencyMs = Math.round(performance.now() - startTime);
      return NextResponse.json({
        success: true,
        latencyMs,
        model: modelClean,
        message: `Connected to ${modelClean} (${latencyMs}ms)`,
      });
    }

    // Default: Gemini
    provider = 'gemini';
    const effectiveKey = rawApiKey || process.env.GEMINI_API_KEY || '';
    if (!effectiveKey) {
      return NextResponse.json({
        success: false,
        error: 'Gemini API Key is required (AIzaSy...)',
      });
    }

    const modelClean =
      rawModel.replace(/^gemini\//i, '').trim() || 'gemini-2.0-flash';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelClean}:generateContent?key=${effectiveKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping test. Return status ok' }] }],
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res, modelClean);
      return NextResponse.json({ success: false, error: errorMsg });
    }

    const latencyMs = Math.round(performance.now() - startTime);
    return NextResponse.json({
      success: true,
      latencyMs,
      model: modelClean,
      message: `Connected to ${modelClean} (${latencyMs}ms)`,
    });
  } catch (err: unknown) {
    const errorObj = err as { name?: string; message?: string };
    if (errorObj?.name === 'AbortError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Connection timed out after 6 seconds. Ensure endpoint is reachable.',
        },
        { status: 504 }
      );
    }

    const msg = errorObj?.message || '';
    if (
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed') ||
      msg.toLowerCase().includes('failed to fetch')
    ) {
      if (provider === 'ollama') {
        const isCloud = baseUrl.includes('ollama.com');
        return NextResponse.json(
          {
            success: false,
            error: isCloud
              ? `Could not connect to Ollama Cloud on ${baseUrl}. Check your internet connection.`
              : `Could not connect to Ollama on ${baseUrl || 'http://127.0.0.1:11434'}. Ensure Ollama is running.`,
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: msg || 'Failed to connect to AI provider' },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
