import { NextResponse, NextRequest } from 'next/server';
import { getBonApi } from '@/lib/bon-api';
import { ensureWalletPoolReady } from '@/lib/wallet-pool';
import { stats } from '@/lib/stats';
import { useMock, mockResolve, mockSessionExists } from '@/lib/mock-data';
import type { ResolveResponse } from '@/lib/types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { txHash, sessionId: bodySessionId } = body as { txHash?: string; sessionId?: string };

    // Session from cookie or body
    const sessionId =
      request.cookies.get('sn-session')?.value ??
      request.headers.get('x-session-id') ??
      bodySessionId ??
      null;

    if (!sessionId) {
      return NextResponse.json({ error: 'No active session.' }, { status: 401 });
    }

    if (!txHash || typeof txHash !== 'string') {
      return NextResponse.json({ error: 'txHash is required.' }, { status: 400 });
    }

    // --- Mock path ---
    if (useMock()) {
      if (!mockSessionExists(sessionId)) {
        return NextResponse.json({ error: 'Session not found.' }, { status: 401 });
      }

      // Simulate a brief network delay for realism
      await sleep(randMockDelay(200, 600));

      stats.increment('totalConstellations');
      const result: ResolveResponse = mockResolve(txHash);
      return NextResponse.json(result);
    }

    // --- Real BoN API path ---
    const pool = await ensureWalletPoolReady();
    const bonApi = getBonApi();

    // Validate that this session owns a wallet (basic validation)
    const walletAddr = pool.getSessionWallet(sessionId);
    if (!walletAddr) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 401 });
    }

    // Poll for transaction resolution: every 1s, up to 10s
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      const txResult = await bonApi.getTransaction(txHash);

      if (txResult && txResult.blockNonce > 0 && txResult.status !== 'pending') {
        stats.increment('totalConstellations');

        const result: ResolveResponse = {
          blockNonce: txResult.blockNonce,
          blockHash: txResult.blockHash,
        };
        return NextResponse.json(result);
      }

      if (i < maxAttempts - 1) {
        await sleep(1000);
      }
    }

    // Fallback: return the latest block nonce if resolution fails
    console.warn(`[/api/resolve] Tx ${txHash} did not resolve in time. Falling back to latest block.`);

    const latestBlocks = await bonApi.getLatestBlocks(1);
    if (latestBlocks.length > 0) {
      stats.increment('totalConstellations');

      const result: ResolveResponse = {
        blockNonce: latestBlocks[0].nonce,
        blockHash: latestBlocks[0].hash,
      };
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Could not resolve transaction or fetch latest block.' }, { status: 504 });
  } catch (err) {
    console.error('[/api/resolve] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Small random delay for mock realism (not deterministic, just UX). */
function randMockDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
