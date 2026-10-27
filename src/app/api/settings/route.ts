import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fallback defaults if row doesn't exist yet
  const settings = data || {
    id: user.id,
    llm_model: 'ollama/llama3.2',
    gemini_api_key: null,
    display_name: user.user_metadata?.display_name || '',
    user_aliases: [],
    primary_email: user.email,
    digest_hour: 8,
    digest_minute: 0,
    auto_purge_enabled: true,
  };

  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      display_name,
      user_aliases,
      primary_email,
      gemini_api_key,
      llm_model,
      digest_hour,
      digest_minute,
      auto_purge_enabled,
    } = body;

    const upsertData: any = {
      id: user.id,
      updated_at: new Date().toISOString(),
    };

    if (display_name !== undefined) upsertData.display_name = display_name.trim();
    if (user_aliases !== undefined) upsertData.user_aliases = Array.isArray(user_aliases) ? user_aliases : [];
    if (primary_email !== undefined) upsertData.primary_email = primary_email.trim();
    if (gemini_api_key !== undefined) upsertData.gemini_api_key = gemini_api_key ? gemini_api_key.trim() : null;
    if (llm_model !== undefined) upsertData.llm_model = llm_model;
    if (digest_hour !== undefined) upsertData.digest_hour = Number(digest_hour);
    if (digest_minute !== undefined) upsertData.digest_minute = Number(digest_minute);
    if (auto_purge_enabled !== undefined) upsertData.auto_purge_enabled = Boolean(auto_purge_enabled);

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(upsertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
