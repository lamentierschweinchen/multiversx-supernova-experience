import { NextResponse, NextRequest } from 'next/server';
import { getBonApi } from '@/lib/bon-api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nonce: string }> },
): Promise<NextResponse> {
  try {
    const { nonce: nonceStr } = await params;
    const nonce = parseInt(nonceStr, 10);

    if (isNaN(nonce) || nonce < 0) {
      return NextResponse.json({ error: 'Invalid block nonce.' }, { status: 400 });
    }

    const bonApi = getBonApi();
    const block = await bonApi.getBlock(nonce);

    return NextResponse.json(block);
  } catch (err) {
    console.error('[/api/block/[nonce]] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch block.' }, { status: 500 });
  }
}
