// ============================================================
// Deterministic PRNG and hash utilities for constellation generation.
// All functions are purely deterministic — no Math.random(), no Date.now(),
// no floating-point-dependent trig. Same input always yields same output.
// ============================================================

/**
 * Xorshift32 PRNG — fast, deterministic, with good distribution.
 * Period: 2^32 - 1. State must never be 0.
 */
export class Xorshift32 {
  private state: number;

  constructor(seed: number) {
    // Ensure state is a nonzero uint32
    this.state = (seed | 0) === 0 ? 1 : seed | 0;
  }

  /** Returns the next pseudo-random uint32 (1 to 2^32-1). */
  next(): number {
    let s = this.state;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.state = s;
    return s >>> 0; // coerce to unsigned
  }

  /** Returns a float in [0, 1). */
  nextFloat(): number {
    return this.next() / 4294967296; // 2^32
  }

  /** Returns a float in [min, max). */
  nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }
}

/**
 * DJB2 hash — converts a hex string (e.g. BLS key) to a uint32 seed.
 * Simple, fast, deterministic across all platforms.
 */
export function hashToSeed(hex: string): number {
  let hash = 5381;
  for (let i = 0; i < hex.length; i++) {
    // hash * 33 + charCode, kept as 32-bit integer
    hash = ((hash << 5) + hash + hex.charCodeAt(i)) | 0;
  }
  // Coerce to unsigned 32-bit; ensure nonzero for xorshift
  const u = hash >>> 0;
  return u === 0 ? 1 : u;
}

/**
 * Deterministic (x, y) position in [-1, 1] from a seed and a jitter seed.
 * Uses xorshift PRNG seeded with (seed XOR jitterSeed).
 */
export function seedToPosition(
  seed: number,
  jitterSeed: number,
): { x: number; y: number } {
  const combined = (seed ^ jitterSeed) >>> 0 || 1;
  const rng = new Xorshift32(combined);
  const x = rng.nextRange(-1, 1);
  const y = rng.nextRange(-1, 1);
  return { x, y };
}

/**
 * Deterministic hue in [0, 360) from a seed.
 */
export function seedToHue(seed: number): number {
  const rng = new Xorshift32(seed);
  return rng.nextFloat() * 360;
}
