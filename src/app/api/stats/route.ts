import { NextResponse } from 'next/server';
import { stats } from '@/lib/stats';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(stats.getAll());
  } catch (err) {
    console.error('[/api/stats] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
