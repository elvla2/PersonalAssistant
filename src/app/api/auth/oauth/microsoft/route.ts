import { NextResponse } from 'next/server';
import { startMicrosoftDeviceFlow, pollMicrosoftDeviceToken } from '@/lib/oauth2';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, device_code } = body;

    if (action === 'start') {
      const flowData = await startMicrosoftDeviceFlow();
      return NextResponse.json(flowData);
    }

    if (action === 'poll') {
      if (!device_code) {
        return NextResponse.json(
          { error: 'Missing device_code for poll action' },
          { status: 400 }
        );
      }
      const pollResult = await pollMicrosoftDeviceToken(device_code);
      return NextResponse.json(pollResult);
    }

    return NextResponse.json(
      { error: 'Invalid action. Supported actions: start, poll' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Microsoft OAuth2 operation failed' },
      { status: 500 }
    );
  }
}
