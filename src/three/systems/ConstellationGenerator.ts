// ============================================================
// Deterministic constellation generator.
// Converts BlockData into ConstellationData — pure data transform,
// no rendering. Same BlockData always produces identical output.
// ============================================================

import type {
  BlockData,
  ConstellationData,
  StarData,
  EdgeData,
  NebulaParams,
} from '../../lib/types';
import { SHARD_COLORS } from '../../lib/types';
import { Xorshift32, hashToSeed, seedToPosition, seedToHue } from '../utils/hash';

// Shard cluster offsets — spread shards into distinct quadrants.
// Moderate offsets so clusters overlap at edges but remain visually distinct.
const SHARD_OFFSETS: Record<number, { dx: number; dy: number }> = {
  0: { dx: -0.3, dy: 0.3 },  // top-left
  1: { dx: 0.3, dy: 0.0 },   // right
  2: { dx: -0.3, dy: -0.3 }, // bottom-left
};

/** Clamp a value into [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Linear map from [inMin, inMax] to [outMin, outMax], clamped. */
function mapRange(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const t = (v - inMin) / (inMax - inMin);
  return clamp(outMin + t * (outMax - outMin), outMin, outMax);
}

/**
 * Look up a shard color with +/-30 degree hue variation.
 * Uses the validator seed for deterministic per-validator color.
 * Falls back to white (#ffffff) for unknown shards.
 */
function shardColor(shard: number, seed: number = 0.5): string {
  const baseHex = SHARD_COLORS[shard] ?? '#ffffff';
  if (shard === 4294967295 || shard === -1) return baseHex;

  // Parse base color and apply +/-30 degree hue variation (±0.083 in 0-1 range)
  const r = parseInt(baseHex.slice(1, 3), 16) / 255;
  const g = parseInt(baseHex.slice(3, 5), 16) / 255;
  const b = parseInt(baseHex.slice(5, 7), 16) / 255;

  // RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // Apply hue variation: +/-30 degrees = +/-0.083
  const hueVariation = (seed - 0.5) * 0.167;
  h = ((h + hueVariation) % 1 + 1) % 1;

  // Slight saturation variation
  s = Math.max(0.3, Math.min(1.0, s + (seed - 0.5) * 0.2));

  // HSL to hex
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p2 = 2 * l - q2;
  const rr = Math.round(hue2rgb(p2, q2, h + 1 / 3) * 255);
  const gg = Math.round(hue2rgb(p2, q2, h) * 255);
  const bb = Math.round(hue2rgb(p2, q2, h - 1 / 3) * 255);

  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/**
 * Generate a complete constellation from block data.
 * Deterministic: identical BlockData always yields identical ConstellationData.
 */
export function generateConstellation(blockData: BlockData): ConstellationData {
  const stars: StarData[] = [];
  const edges: EdgeData[] = [];

  // Master jitter RNG seeded from the block nonce — ensures different
  // constellations even when the validator set is identical across blocks.
  const nonceRng = new Xorshift32(blockData.nonce === 0 ? 1 : blockData.nonce);

  // ------------------------------------------------------------------
  // 1. Central star (block proposer)
  // ------------------------------------------------------------------
  const proposerSeed = hashToSeed(blockData.proposer);
  const proposerPos = seedToPosition(proposerSeed, 0);
  // Pull toward center: scale into [-0.3, 0.3]
  const proposerHue = seedToHue(proposerSeed);
  const proposerSizeRng = new Xorshift32(proposerSeed);
  proposerSizeRng.next(); // burn one value to decorrelate from position
  const proposerSize = 0.8 + proposerSizeRng.nextFloat() * 0.2; // [0.8, 1.0)

  const centralStar: StarData = {
    x: proposerPos.x * 0.3,
    y: proposerPos.y * 0.3,
    size: proposerSize,
    color: '#ffffff', // proposer is white/neutral
    hue: proposerHue,
    shard: -1,
    isCentral: true,
    blsKeyFragment: blockData.proposer.slice(0, 8),
  };
  stars.push(centralStar);

  // ------------------------------------------------------------------
  // 2. Validator stars
  // ------------------------------------------------------------------
  // Collect stars per shard for centroid computation later.
  const shardStars: Map<number, StarData[]> = new Map();

  for (const validator of blockData.validators) {
    const vSeed = hashToSeed(validator.blsKey);
    const basePos = seedToPosition(vSeed, 0);

    // Shard-based cluster offset
    const offset = SHARD_OFFSETS[validator.shard] ?? { dx: 0, dy: 0 };

    // Block-nonce jitter: Xorshift32 seeded with (nonce XOR validatorSeed)
    const jitterSeed = (blockData.nonce ^ vSeed) >>> 0 || 1;
    const jitterRng = new Xorshift32(jitterSeed);
    const jx = jitterRng.nextRange(-0.05, 0.05);
    const jy = jitterRng.nextRange(-0.05, 0.05);

    // Final position: base position scaled to fit + shard offset + jitter
    const x = clamp(basePos.x * 0.6 + offset.dx + jx, -1.1, 1.1);
    const y = clamp(basePos.y * 0.6 + offset.dy + jy, -1.1, 1.1);

    // Size from hash — varied in [0.2, 0.5)
    const sizeRng = new Xorshift32(vSeed);
    sizeRng.next();
    const size = 0.2 + sizeRng.nextFloat() * 0.3;

    const hue = seedToHue(vSeed);

    const star: StarData = {
      x,
      y,
      size,
      color: shardColor(validator.shard, (vSeed >>> 0) / 4294967296),
      hue,
      shard: validator.shard,
      isCentral: false,
      blsKeyFragment: validator.blsKey.slice(0, 8),
    };

    stars.push(star);

    if (!shardStars.has(validator.shard)) {
      shardStars.set(validator.shard, []);
    }
    shardStars.get(validator.shard)!.push(star);
  }

  // ------------------------------------------------------------------
  // 3. Cross-shard edges
  // ------------------------------------------------------------------
  // Precompute shard centroids.
  const shardCentroids: Map<number, { cx: number; cy: number }> = new Map();
  for (const [shard, sStars] of shardStars) {
    let sx = 0;
    let sy = 0;
    for (const s of sStars) {
      sx += s.x;
      sy += s.y;
    }
    shardCentroids.set(shard, {
      cx: sx / sStars.length,
      cy: sy / sStars.length,
    });
  }

  for (const mb of blockData.miniBlocks) {
    if (mb.senderShard === mb.receiverShard) continue;

    const from = shardCentroids.get(mb.senderShard);
    const to = shardCentroids.get(mb.receiverShard);
    if (!from || !to) continue;

    const style: 'solid' | 'dashed' =
      mb.type.includes('SmartContractResult') ? 'dashed' : 'solid';

    // Opacity in [0.15, 0.3], varied by miniblock tx count
    const opacity = clamp(0.15 + (mb.txCount / 100) * 0.15, 0.15, 0.3);

    edges.push({
      fromX: from.cx,
      fromY: from.cy,
      toX: to.cx,
      toY: to.cy,
      style,
      opacity,
    });
  }

  // ------------------------------------------------------------------
  // 4. Nebula parameters
  // ------------------------------------------------------------------
  let nebCx = 0;
  let nebCy = 0;
  for (const s of stars) {
    nebCx += s.x;
    nebCy += s.y;
  }
  if (stars.length > 0) {
    nebCx /= stars.length;
    nebCy /= stars.length;
  }

  // Normalize gasConsumed into [0.3, 0.8]. Use a reasonable upper bound
  // (50M gas is a heavy block on MultiversX).
  const gasMax = 50_000_000;
  const nebulaRadius = mapRange(blockData.gasConsumed, 0, gasMax, 0.3, 0.8);

  // Normalize txCount into [0.2, 0.6]. 200 txs is a busy block.
  const txMax = 200;
  const nebulaIntensity = mapRange(blockData.txCount, 0, txMax, 0.2, 0.6);

  const nebula: NebulaParams = {
    centerX: nebCx,
    centerY: nebCy,
    radius: nebulaRadius,
    intensity: nebulaIntensity,
    hue: proposerHue,
  };

  // ------------------------------------------------------------------
  // 5. Final block-nonce jitter pass
  // ------------------------------------------------------------------
  // Apply a small extra positional jitter to every star (including central)
  // so blocks with identical validator sets but different nonces differ.
  for (const star of stars) {
    const jx = nonceRng.nextRange(-0.02, 0.02);
    const jy = nonceRng.nextRange(-0.02, 0.02);
    star.x = clamp(star.x + jx, -1.1, 1.1);
    star.y = clamp(star.y + jy, -1.1, 1.1);
  }

  return {
    blockNonce: blockData.nonce,
    stars,
    edges,
    nebula,
    centralStar: stars[0], // first star is always the proposer
  };
}
