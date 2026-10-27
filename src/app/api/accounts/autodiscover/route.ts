import { NextResponse } from 'next/server';
import { autodiscoverMailConfig } from '@/lib/autodiscover';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = body.email || '';

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const config = await autodiscoverMailConfig(email);
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to autodiscover mail server settings' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || '';

    if (!email) {
      return NextResponse.json({ error: 'Email query parameter is required' }, { status: 400 });
    }

    const config = await autodiscoverMailConfig(email);
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to autodiscover mail server settings' },
      { status: 500 }
    );
  }
}
