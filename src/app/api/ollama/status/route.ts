import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({
        online: false,
        models: [],
        count: 0,
        error: `Ollama returned HTTP status ${res.status}`,
      });
    }

    const data = await res.json();
    const rawModels: Array<{ name: string }> = Array.isArray(data?.models) ? data.models : [];
    const modelNames = rawModels.map((m) => m.name);

    return NextResponse.json({
      online: true,
      models: modelNames,
      count: modelNames.length,
      hasGpu: true,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    return NextResponse.json({
      online: false,
      models: [],
      count: 0,
      error: 'Ollama service is not reachable on localhost:11434',
    });
  }
}
