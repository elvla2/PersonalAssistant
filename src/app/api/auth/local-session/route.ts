import { NextResponse, type NextRequest } from 'next/server';
import { validateLocalSession } from '@/lib/db/localAuthEngine';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('pa_session_token')?.value;
    if (!token) {
      return NextResponse.json({ user: null, session: null });
    }

    const user = validateLocalSession(token);
    if (!user) {
      const response = NextResponse.json({ user: null, session: null });
      response.cookies.delete('pa_session_token');
      response.cookies.delete('pa_user_id');
      return response;
    }

    return NextResponse.json({
      user,
      session: {
        access_token: token,
        token_type: 'bearer',
        user,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to validate local session' },
      { status: 500 }
    );
  }
}
