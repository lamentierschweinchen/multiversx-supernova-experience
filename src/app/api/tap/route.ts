import { NextResponse, NextRequest } from 'next/server';
import { ensureWalletPoolReady } from '@/lib/wallet-pool';
import { stats } from '@/lib/stats';
import { useMock, mockTap, mockSessionExists } from '@/lib/mock-data';
import type { TapResponse } from '@/lib/types';

// Simple in-memory rate limiter: sessionId -> timestamps of recent taps
const tapTimestamps: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 5; // 5 taps per second

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const timestamps = tapTimestamps.get(sessionId) ?? [];

  // Remove timestamps older than the window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

  if (recent.length >= RATE_LIMIT_MAX) {
    tapTimestamps.set(sessionId, recent);
    return false; // rate limited
  }

  recent.push(now);
  tapTimestamps.set(sessionId, recent);
  return true; // allowed
}

// Periodic cleanup of stale rate limit entries (every 30s)
let lastCleanup = Date.now();
function cleanupRateLimiter(): void {
  const now = Date.now();
  if (now - lastCleanup < 30_000) return;
  lastCleanup = now;

  for (const [key, timestamps] of tapTimestamps.entries()) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) {
      tapTimestamps.delete(key);
    } else {
      tapTimestamps.set(key, recent);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    cleanupRateLimiter();

    // Read session from cookie or header
    const sessionId =
      request.cookies.get('sn-session')?.value ??
      request.headers.get('x-session-id') ??
      null;

    if (!sessionId) {
      return NextResponse.json({ error: 'No active session. Call /api/start-round first.' }, { status: 401 });
    }

    // Rate limit check
    if (!checkRateLimit(sessionId)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Max 5 taps per second.' }, { status: 429 });
    }

    // --- Mock path ---
    if (useMock()) {
      if (!mockSessionExists(sessionId)) {
        return NextResponse.json({ error: 'Session not found. Call /api/start-round first.' }, { status: 401 });
      }

      stats.increment('totalTaps');
      const body: TapResponse = mockTap(sessionId);
      return NextResponse.json(body);
    }

    // --- Real BoN API path ---
    const pool = await ensureWalletPoolReady();

    // Verify session has a wallet
    const walletAddr = pool.getSessionWallet(sessionId);
    if (!walletAddr) {
      return NextResponse.json({ error: 'Session not found. Call /api/start-round first.' }, { status: 401 });
    }

    // Send the tap transaction
    const result = await pool.sendTap(sessionId);

    stats.increment('totalTaps');

    if (result) {
      const body: TapResponse = { txHash: result.txHash, sentAt: result.sentAt };
      return NextResponse.json(body);
    } else {
      // Transaction failed but we don't want to block the game
      const body: TapResponse = { txHash: null, sentAt: Date.now(), queued: true };
      return NextResponse.json(body);
    }
  } catch (err) {
    console.error('[/api/tap] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
