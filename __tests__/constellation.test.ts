// ============================================================
// Tests for the constellation generator.
// Run with: npx tsx __tests__/constellation.test.ts
// ============================================================

import { generateConstellation } from '../src/three/systems/ConstellationGenerator';
import { SHARD_COLORS } from '../src/lib/types';
import type { BlockData } from '../src/lib/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeBlockData(overrides: Partial<BlockData> = {}): BlockData {
  return {
    nonce: 12345,
    round: 12400,
    hash: 'aabbccddee00112233445566778899aabbccddee00112233445566778899aabb',
    proposer:
      'b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' +
      'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    timestamp: 1700000000,
    txCount: 42,
    gasConsumed: 12_000_000,
    miniBlocks: [
      {
        hash: 'mb01aabb',
        senderShard: 0,
        receiverShard: 1,
        txCount: 10,
        type: 'TxBlock',
      },
      {
        hash: 'mb02ccdd',
        senderShard: 1,
        receiverShard: 1,
        txCount: 5,
        type: 'TxBlock',
      },
      {
        hash: 'mb03eeff',
        senderShard: 2,
        receiverShard: 0,
        txCount: 3,
        type: 'SmartContractResultBlock',
      },
    ],
    validators: [
      {
        blsKey:
          '1111111111111111111111111111111111111111111111111111111111111111' +
          '1111111111111111111111111111111111111111111111111111111111111111',
        shard: 0,
      },
      {
        blsKey:
          '2222222222222222222222222222222222222222222222222222222222222222' +
          '2222222222222222222222222222222222222222222222222222222222222222',
        shard: 0,
      },
      {
        blsKey:
          '3333333333333333333333333333333333333333333333333333333333333333' +
          '3333333333333333333333333333333333333333333333333333333333333333',
        shard: 1,
      },
      {
        blsKey:
          '4444444444444444444444444444444444444444444444444444444444444444' +
          '4444444444444444444444444444444444444444444444444444444444444444',
        shard: 1,
      },
      {
        blsKey:
          '5555555555555555555555555555555555555555555555555555555555555555' +
          '5555555555555555555555555555555555555555555555555555555555555555',
        shard: 2,
      },
      {
        blsKey:
          '6666666666666666666666666666666666666666666666666666666666666666' +
          '6666666666666666666666666666666666666666666666666666666666666666',
        shard: 2,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Determinism
// ---------------------------------------------------------------------------
console.log('\nTest 1: Determinism');
{
  const block = makeBlockData();
  const a = generateConstellation(block);
  const b = generateConstellation(block);
  assert(deepEqual(a, b), 'Two calls with identical BlockData produce identical output');
}

// ---------------------------------------------------------------------------
// Test 2: Different blocks produce different constellations
// ---------------------------------------------------------------------------
console.log('\nTest 2: Different nonces produce different constellations');
{
  const a = generateConstellation(makeBlockData({ nonce: 100 }));
  const b = generateConstellation(makeBlockData({ nonce: 200 }));
  assert(!deepEqual(a, b), 'Different nonces yield different output');

  // Specifically check star positions differ
  const positionsMatch = a.stars.every(
    (s, i) => s.x === b.stars[i].x && s.y === b.stars[i].y,
  );
  assert(!positionsMatch, 'Star positions differ between nonces');
}

// ---------------------------------------------------------------------------
// Test 3: Shard colors are correct
// ---------------------------------------------------------------------------
console.log('\nTest 3: Shard colors');
{
  const result = generateConstellation(makeBlockData());
  const shard0Stars = result.stars.filter((s) => s.shard === 0);
  const shard1Stars = result.stars.filter((s) => s.shard === 1);
  const shard2Stars = result.stars.filter((s) => s.shard === 2);

  assert(
    shard0Stars.length > 0 && shard0Stars.every((s) => s.color === SHARD_COLORS[0]),
    `Shard 0 stars have cyan color (${SHARD_COLORS[0]})`,
  );
  assert(
    shard1Stars.length > 0 && shard1Stars.every((s) => s.color === SHARD_COLORS[1]),
    `Shard 1 stars have green color (${SHARD_COLORS[1]})`,
  );
  assert(
    shard2Stars.length > 0 && shard2Stars.every((s) => s.color === SHARD_COLORS[2]),
    `Shard 2 stars have purple color (${SHARD_COLORS[2]})`,
  );
}

// ---------------------------------------------------------------------------
// Test 4: Central star exists and is marked
// ---------------------------------------------------------------------------
console.log('\nTest 4: Central star');
{
  const result = generateConstellation(makeBlockData());
  const centrals = result.stars.filter((s) => s.isCentral);
  assert(centrals.length === 1, 'Exactly one star has isCentral: true');
  assert(result.centralStar.isCentral === true, 'centralStar field has isCentral: true');
  assert(result.centralStar.shard === -1, 'Central star shard is -1');
  assert(
    result.centralStar.blsKeyFragment === makeBlockData().proposer.slice(0, 8),
    'Central star blsKeyFragment matches proposer',
  );
}

// ---------------------------------------------------------------------------
// Test 5: Position ranges
// ---------------------------------------------------------------------------
console.log('\nTest 5: Position ranges');
{
  const result = generateConstellation(makeBlockData());
  const allInRange = result.stars.every(
    (s) => s.x >= -1.1 && s.x <= 1.1 && s.y >= -1.1 && s.y <= 1.1,
  );
  assert(allInRange, 'All star positions within [-1.1, 1.1]');

  // Central star should be near center (within ~0.35 after jitter)
  assert(
    Math.abs(result.centralStar.x) <= 0.35 &&
      Math.abs(result.centralStar.y) <= 0.35,
    'Central star is near center (within 0.35)',
  );
}

// ---------------------------------------------------------------------------
// Test 6: Cross-shard edges
// ---------------------------------------------------------------------------
console.log('\nTest 6: Cross-shard edges');
{
  // Default data has cross-shard miniblocks
  const result = generateConstellation(makeBlockData());
  assert(result.edges.length > 0, 'Cross-shard miniblocks produce edges');

  // Check the SmartContractResult miniblock produces a dashed edge
  const dashedEdges = result.edges.filter((e) => e.style === 'dashed');
  assert(dashedEdges.length >= 1, 'SmartContractResult miniblock produces dashed edge');

  // Same-shard only: no edges
  const sameShard = makeBlockData({
    miniBlocks: [
      { hash: 'mb01', senderShard: 0, receiverShard: 0, txCount: 5, type: 'TxBlock' },
      { hash: 'mb02', senderShard: 1, receiverShard: 1, txCount: 3, type: 'TxBlock' },
    ],
  });
  const resultSame = generateConstellation(sameShard);
  assert(resultSame.edges.length === 0, 'Same-shard-only miniblocks produce no edges');
}

// ---------------------------------------------------------------------------
// Test 7: Edge case — 0 validators
// ---------------------------------------------------------------------------
console.log('\nTest 7: Zero validators');
{
  const result = generateConstellation(
    makeBlockData({ validators: [], miniBlocks: [] }),
  );
  assert(result.stars.length === 1, 'Zero validators produces only central star');
  assert(result.stars[0].isCentral === true, 'The single star is the central star');
  assert(result.edges.length === 0, 'No edges with zero validators');
}

// ---------------------------------------------------------------------------
// Test 8: Edge case — 1 validator per shard
// ---------------------------------------------------------------------------
console.log('\nTest 8: One validator per shard');
{
  const result = generateConstellation(
    makeBlockData({
      validators: [
        {
          blsKey:
            'aaaa' + '0'.repeat(124),
          shard: 0,
        },
        {
          blsKey:
            'bbbb' + '0'.repeat(124),
          shard: 1,
        },
        {
          blsKey:
            'cccc' + '0'.repeat(124),
          shard: 2,
        },
      ],
    }),
  );
  // 3 validators + 1 central = 4 stars
  assert(result.stars.length === 4, '1 validator per shard produces 4 stars total');
  const centralCount = result.stars.filter((s) => s.isCentral).length;
  assert(centralCount === 1, 'Still exactly one central star');
}

// ---------------------------------------------------------------------------
// Test 9: Nebula parameters are reasonable
// ---------------------------------------------------------------------------
console.log('\nTest 9: Nebula parameters');
{
  const result = generateConstellation(makeBlockData());
  assert(
    result.nebula.radius >= 0.3 && result.nebula.radius <= 0.8,
    `Nebula radius in [0.3, 0.8]: got ${result.nebula.radius.toFixed(4)}`,
  );
  assert(
    result.nebula.intensity >= 0.2 && result.nebula.intensity <= 0.6,
    `Nebula intensity in [0.2, 0.6]: got ${result.nebula.intensity.toFixed(4)}`,
  );
  assert(
    result.nebula.hue >= 0 && result.nebula.hue < 360,
    `Nebula hue in [0, 360): got ${result.nebula.hue.toFixed(2)}`,
  );
}

// ---------------------------------------------------------------------------
// Test 10: Edge opacity ranges
// ---------------------------------------------------------------------------
console.log('\nTest 10: Edge opacity ranges');
{
  const result = generateConstellation(makeBlockData());
  for (const edge of result.edges) {
    assert(
      edge.opacity >= 0.15 && edge.opacity <= 0.3,
      `Edge opacity in [0.15, 0.3]: got ${edge.opacity.toFixed(4)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 11: Star size ranges
// ---------------------------------------------------------------------------
console.log('\nTest 11: Star size ranges');
{
  const result = generateConstellation(makeBlockData());
  for (const star of result.stars) {
    if (star.isCentral) {
      assert(
        star.size >= 0.8 && star.size <= 1.0,
        `Central star size in [0.8, 1.0]: got ${star.size.toFixed(4)}`,
      );
    } else {
      assert(
        star.size >= 0.2 && star.size < 0.5,
        `Validator star size in [0.2, 0.5): got ${star.size.toFixed(4)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
}
