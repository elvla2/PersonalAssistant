import { NextResponse } from 'next/server';
import { registerLocalUser } from '@/lib/db/localAuthEngine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, displayName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const { user, token } = registerLocalUser({
      email,
      password,
      displayName,
    });

    const response = NextResponse.json({
      user,
      session: {
        access_token: token,
        token_type: 'bearer',
        user,
      },
      token,
      success: true,
    });

    // Session cookie (HTTP-only)
    response.cookies.set('pa_session_token', token, {
      httpOnly: true,
      secure: false, // Local loopback HTTP server
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // User ID cookie (accessible for fast client-side context)
    response.cookies.set('pa_user_id', user.id, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    // Desktop mode flag
    response.cookies.set('x-desktop-mode', 'true', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to sign up local user' },
      { status: 400 }
    );
  }
}
