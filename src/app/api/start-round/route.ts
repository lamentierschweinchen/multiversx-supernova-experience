import { NextResponse } from 'next/server';
import { ensureWalletPoolReady } from '@/lib/wallet-pool';
import { stats } from '@/lib/stats';
import { useMock, mockStartRound } from '@/lib/mock-data';

export async function POST(): Promise<NextResponse> {
  try {
    // --- Mock path ---
    if (useMock()) {
      const { sessionId } = mockStartRound();

      stats.increment('totalPlayers');

      const response = NextResponse.json({ sessionId });

      response.cookies.set('sn-session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 600,
        path: '/',
      });

      return response;
    }

    // --- Real BoN API path ---
    const sessionId = crypto.randomUUID();
    const pool = await ensureWalletPoolReady();

    const wallet = pool.acquireWallet(sessionId);
    if (!wallet) {
      return NextResponse.json(
        { error: 'Service temporarily at capacity. Please try again shortly.' },
        { status: 503 },
      );
    }

    stats.increment('totalPlayers');

    const response = NextResponse.json({ sessionId });

    // Set session cookie (httpOnly for security)
    response.cookies.set('sn-session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[/api/start-round] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
