// ============================================================
// Mock data layer for the Supernova experience.
// Activated by default; set USE_MOCK=false to use real BoN API.
// ============================================================

import type {
  BlockData,
  MiniBlockData,
  ValidatorData,
  TapResponse,
  ResolveResponse,
  GameSession,
} from './types';

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — same seed always produces the same output
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a deterministic integer in [min, max] (inclusive). */
function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Generate a deterministic hex string of `length` hex chars. */
function randHex(rng: () => number, length: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(rng() * 16)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stable validator pool — generated once, reused across all mock blocks
// ---------------------------------------------------------------------------

const VALIDATOR_POOL_SIZE = 63; // 21 per shard
let _validatorPool: ValidatorData[] | null = null;

function getValidatorPool(): ValidatorData[] {
  if (_validatorPool) return _validatorPool;

  const rng = mulberry32(0xcafe_babe);
  const pool: ValidatorData[] = [];

  for (let shard = 0; shard < 3; shard++) {
    for (let i = 0; i < 21; i++) {
      pool.push({
        blsKey: randHex(rng, 192), // 96-byte BLS key = 192 hex chars
        shard,
      });
    }
  }

  _validatorPool = pool;
  return pool;
}

// ---------------------------------------------------------------------------
// Base timestamp — all mock blocks are relative to this anchor
// ---------------------------------------------------------------------------

const BASE_NONCE = 29_000_000;
// Anchor: 2026-03-19 12:00:00 UTC in seconds
const BASE_TIMESTAMP = Math.floor(new Date('2026-03-19T12:00:00Z').getTime() / 1000);

// ---------------------------------------------------------------------------
// generateMockBlock
// ---------------------------------------------------------------------------

export function generateMockBlock(nonce: number): BlockData {
  const rng = mulberry32(nonce);

  // Deterministic hash and proposer
  const hash = randHex(rng, 64);
  const pool = getValidatorPool();
  const proposerIdx = randInt(rng, 0, pool.length - 1);
  const proposer = pool[proposerIdx].blsKey;

  // Timestamp: base + offset based on nonce distance from BASE_NONCE
  // Each block is ~600ms apart, stored in seconds with sub-second precision
  const nonceDelta = nonce - BASE_NONCE;
  // Add a small deterministic jitter per block (0-100ms expressed in seconds)
  const jitterMs = randInt(rng, 0, 100);
  const timestamp = BASE_TIMESTAMP + Math.floor(nonceDelta * 0.6) + jitterMs / 1000;

  // Validators: pick 15-40 from the pool without replacement
  const validatorCount = randInt(rng, 15, 40);
  const shuffled = [...pool];
  // Fisher-Yates partial shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const validators = shuffled.slice(0, validatorCount);

  // Transaction count
  const txCount = randInt(rng, 50, 500);

  // Gas consumed
  const gasConsumed = randInt(rng, 5_000_000, 50_000_000);

  // Miniblocks: 3-8
  const mbCount = randInt(rng, 3, 8);
  const miniBlocks: MiniBlockData[] = [];
  let txRemaining = txCount;

  for (let i = 0; i < mbCount; i++) {
    const senderShard = randInt(rng, 0, 2);
    // ~30% chance of cross-shard
    const isCrossShard = rng() < 0.3;
    let receiverShard = senderShard;
    if (isCrossShard) {
      receiverShard = (senderShard + randInt(rng, 1, 2)) % 3;
    }

    // Distribute txs: last miniblock gets the remainder
    const mbTxCount =
      i === mbCount - 1
        ? Math.max(txRemaining, 1)
        : Math.max(1, randInt(rng, 1, Math.ceil(txRemaining / (mbCount - i))));
    txRemaining = Math.max(0, txRemaining - mbTxCount);

    miniBlocks.push({
      hash: randHex(rng, 64),
      senderShard,
      receiverShard,
      txCount: mbTxCount,
      type: isCrossShard ? 'SmartContractResultBlock' : 'TxBlock',
    });
  }

  return {
    nonce,
    round: nonce, // round matches nonce in mock
    hash,
    proposer,
    timestamp: Math.floor(timestamp), // integer seconds
    txCount,
    gasConsumed,
    miniBlocks,
    validators,
  };
}

// ---------------------------------------------------------------------------
// generateMockLatestBlocks
// ---------------------------------------------------------------------------

/** Current "head" nonce: based on elapsed time since anchor. */
function currentMockHeadNonce(): number {
  const nowSec = Date.now() / 1000;
  const elapsed = nowSec - BASE_TIMESTAMP;
  // ~600ms per block = ~1.667 blocks per second
  return BASE_NONCE + Math.max(0, Math.floor(elapsed / 0.6));
}

export function generateMockLatestBlocks(size: number): BlockData[] {
  const head = currentMockHeadNonce();
  const blocks: BlockData[] = [];

  for (let i = 0; i < size; i++) {
    blocks.push(generateMockBlock(head - i));
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Mock session manager
// ---------------------------------------------------------------------------

interface MockSessionEntry {
  sessionId: string;
  walletAddress: string;
  nonce: number;
  txHashes: string[];
  createdAt: number;
}

const mockSessions = new Map<string, MockSessionEntry>();

// Session cleanup interval — evict sessions older than 15 minutes
const SESSION_TTL = 15 * 60 * 1000;
let _lastSessionCleanup = Date.now();

function cleanupSessions(): void {
  const now = Date.now();
  if (now - _lastSessionCleanup < 30_000) return;
  _lastSessionCleanup = now;

  for (const [id, entry] of mockSessions.entries()) {
    if (now - entry.createdAt > SESSION_TTL) {
      mockSessions.delete(id);
    }
  }
}

/** Create a mock session. Returns the sessionId. */
export function mockStartRound(): { sessionId: string } {
  cleanupSessions();

  const sessionId = crypto.randomUUID();
  const rng = mulberry32(Date.now() ^ (Math.random() * 0xffff_ffff));

  const walletAddress =
    'erd1' + randHex(rng, 58); // roughly bech32 length

  mockSessions.set(sessionId, {
    sessionId,
    walletAddress,
    nonce: 0,
    txHashes: [],
    createdAt: Date.now(),
  });

  return { sessionId };
}

/** Check if a mock session exists. */
export function mockSessionExists(sessionId: string): boolean {
  return mockSessions.has(sessionId);
}

// ---------------------------------------------------------------------------
// Mock tap handler
// ---------------------------------------------------------------------------

export function mockTap(sessionId: string): TapResponse {
  const session = mockSessions.get(sessionId);
  if (!session) {
    return { txHash: null, sentAt: Date.now(), queued: true };
  }

  session.nonce++;

  // Deterministic but unique tx hash based on session + nonce
  const rng = mulberry32(hashCode(sessionId) ^ (session.nonce * 2654435761));
  const txHash = randHex(rng, 64);

  session.txHashes.push(txHash);

  return { txHash, sentAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Mock resolve handler
// ---------------------------------------------------------------------------

export function mockResolve(_txHash: string): ResolveResponse {
  // Pick the current head block as the resolution target
  const headNonce = currentMockHeadNonce();
  const block = generateMockBlock(headNonce);

  return {
    blockNonce: block.nonce,
    blockHash: block.hash,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple string hash (djb2). */
function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/** Returns true when mock data should be used. Default is true (mock on). */
export function useMock(): boolean {
  return process.env.USE_MOCK !== 'false';
}
