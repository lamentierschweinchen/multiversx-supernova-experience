import { NextResponse, NextRequest } from 'next/server';
import { getBonApi } from '@/lib/bon-api';
import { useMock, generateMockLatestBlocks } from '@/lib/mock-data';

// Simple cache: store last response with timestamp
let cachedBlocks: { data: object[]; fetchedAt: number } | null = null;
const CACHE_TTL = 500; // 500ms cache

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const size = Math.min(Math.max(parseInt(url.searchParams.get('size') ?? '1', 10) || 1, 1), 50);

    // --- Mock path ---
    if (useMock()) {
      return NextResponse.json(generateMockLatestBlocks(size));
    }

    // --- Real BoN API path ---
    // Check cache
    const now = Date.now();
    if (cachedBlocks && now - cachedBlocks.fetchedAt < CACHE_TTL && cachedBlocks.data.length >= size) {
      return NextResponse.json(cachedBlocks.data.slice(0, size));
    }

    const bonApi = getBonApi();
    const blocks = await bonApi.getLatestBlocks(size);

    // Update cache
    cachedBlocks = { data: blocks, fetchedAt: now };

    return NextResponse.json(blocks);
  } catch (err) {
    console.error('[/api/blocks/latest] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch latest blocks.' }, { status: 500 });
  }
}
