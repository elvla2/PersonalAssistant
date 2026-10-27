import { NextResponse, type NextRequest } from 'next/server';
import { logoutLocalUser } from '@/lib/db/localAuthEngine';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('pa_session_token')?.value;
    if (token) {
      logoutLocalUser(token);
    }
  } catch (err) {
    console.warn('[Logout] Error during local session cleanup:', err);
  }

  try {
    const supabase = await createClient();
    if (typeof supabase.auth?.signOut === 'function') {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('[Logout] Error during Supabase signOut:', err);
  }

  const response = NextResponse.json({ success: true });

  // Clear local desktop session tokens and desktop mode cookie
  response.cookies.delete('pa_session_token');
  response.cookies.delete('pa_user_id');
  response.cookies.delete('x-desktop-mode');

  return response;
}
