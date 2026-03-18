// ============================================================
// BlockSync — Phase-locked oscillator for rhythm timing.
// Fetches real block data from the BoN API to calibrate beat
// interval, then runs a local oscillator with soft drift correction.
// ============================================================

import { BON_CONFIG } from '../../lib/types';

interface BlockInfo {
  nonce: number;
  timestamp: number; // seconds
}

export class BlockSync {
  private interval: number = BON_CONFIG.targetBlockTime; // ms, calibrated from real blocks
  private lastBeatTime: number = 0;
  private onBeatCallback: (() => void) | null = null;
  private running: boolean = false;
  private animFrameId: number = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private latestBlockNonce: number = 0;
  private connected: boolean = false;

  /**
   * Fetch recent blocks, calibrate interval, start oscillator.
   */
  async initialize(): Promise<void> {
    try {
      const blocks = await this.fetchRecentBlocks(10);

      if (blocks.length >= 2) {
        // Compute average interval between consecutive blocks
        let totalMs = 0;
        let count = 0;
        // Blocks come newest-first, so sort by nonce ascending
        blocks.sort((a, b) => a.nonce - b.nonce);

        for (let i = 1; i < blocks.length; i++) {
          const deltaMs = (blocks[i].timestamp - blocks[i - 1].timestamp) * 1000;
          if (deltaMs > 0 && deltaMs < 5000) {
            // Ignore outliers
            totalMs += deltaMs;
            count++;
          }
        }

        if (count > 0) {
          this.interval = totalMs / count;
          // Clamp to reasonable range [400ms, 1200ms]
          this.interval = Math.max(400, Math.min(1200, this.interval));
        }

        this.latestBlockNonce = Math.max(...blocks.map((b) => b.nonce));
        this.connected = true;
      }
    } catch {
      // API unreachable — use default 600ms interval
      this.connected = false;
    }

    this.start();
  }

  /**
   * Register a callback fired on each beat.
   */
  setOnBeat(callback: () => void): void {
    this.onBeatCallback = callback;
  }

  /**
   * Start the oscillator and background polling.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastBeatTime = performance.now();

    const tick = (now: number) => {
      if (!this.running) return;
      this.tick(now);
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);

    // Poll every 500ms for drift correction
    this.pollTimer = setInterval(() => {
      this.pollBlocks();
    }, 500);
  }

  /**
   * Stop oscillator and polling.
   */
  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get latest known block nonce.
   */
  getCurrentBlock(): number {
    return this.latestBlockNonce;
  }

  /**
   * Whether the API is reachable.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get current calibrated interval in ms.
   */
  getInterval(): number {
    return this.interval;
  }

  // -----------------------------------------------------------
  // Internal
  // -----------------------------------------------------------

  private tick(now: number): void {
    const elapsed = now - this.lastBeatTime;

    if (elapsed >= this.interval) {
      // Fire beat — don't let beats stack up if frame was delayed
      // Reset to now (not lastBeatTime + interval) to avoid catch-up bursts
      this.lastBeatTime = now;

      if (this.onBeatCallback) {
        try {
          this.onBeatCallback();
        } catch {
          // Swallow callback errors
        }
      }
    }
  }

  private async pollBlocks(): Promise<void> {
    if (!this.running) return;

    try {
      const response = await fetch('/api/blocks/latest?size=2');
      if (!response.ok) {
        this.connected = false;
        return;
      }

      const blocks: BlockInfo[] = await response.json();
      this.connected = true;

      if (blocks.length >= 1) {
        const newestNonce = Math.max(...blocks.map((b) => b.nonce));
        if (newestNonce > this.latestBlockNonce) {
          this.latestBlockNonce = newestNonce;
        }
      }

      if (blocks.length >= 2) {
        // Compute actual interval and apply soft correction
        blocks.sort((a, b) => a.nonce - b.nonce);
        const actualMs =
          (blocks[blocks.length - 1].timestamp - blocks[blocks.length - 2].timestamp) *
          1000;

        if (actualMs > 0 && actualMs < 5000) {
          // Drift: difference between our predicted interval and actual
          const drift = actualMs - this.interval;
          // Apply 15% of drift as correction — smooth convergence
          this.interval += drift * 0.15;
          // Clamp to reasonable range
          this.interval = Math.max(400, Math.min(1200, this.interval));
        }
      }
    } catch {
      // Network error — keep oscillating with current interval
      this.connected = false;
    }
  }

  private async fetchRecentBlocks(size: number): Promise<BlockInfo[]> {
    const response = await fetch(`/api/blocks/latest?size=${size}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch blocks: ${response.status}`);
    }
    return response.json();
  }
}
