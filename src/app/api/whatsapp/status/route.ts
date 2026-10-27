import { NextResponse } from 'next/server';
import { whatsAppManager } from '@/lib/whatsapp';
import { isDesktopMode } from '@/lib/db/isDesktop';
import { validateLocalSession } from '@/lib/db/localAuthEngine';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  if (isDesktopMode()) {
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('pa_session_token')?.value;
      if (token) {
        const sessionUser = validateLocalSession(token);
        if (sessionUser) return sessionUser.id;
      }
      const cookieUserId = cookieStore.get('pa_user_id')?.value;
      if (cookieUserId) return cookieUserId;
    } catch {
      // Cookies might be read from request headers directly
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const tokenMatch = cookieHeader.match(/pa_session_token=([^;]+)/);
    if (tokenMatch) {
      const sessionUser = validateLocalSession(tokenMatch[1].trim());
      if (sessionUser) return sessionUser.id;
    }
    const userIdMatch = cookieHeader.match(/pa_user_id=([^;]+)/);
    if (userIdMatch) return userIdMatch[1].trim();

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) return user.id;
    } catch {
      // ignore
    }

    return null;
  }

  // Web Mode
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const service = whatsAppManager.getServiceForUser(userId);

  if (searchParams.get('init') === 'true') {
    await service.ensureStarted();
  }

  const status = service.getStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await whatsAppManager.disconnectUser(userId);
  return NextResponse.json(result);
}
