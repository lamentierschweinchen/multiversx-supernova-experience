/**
 * AudioManager — singleton that manages intro and pulse music tracks
 * with crossfading, volume ducking, and fade helpers.
 *
 * Must be initialized from a user gesture (click/tap) to satisfy
 * browser autoplay policies.
 *
 * Tracks:
 *   /audio/intro.mp3  — plays during the gate/intro scene
 *   /audio/pulse.mp3  — plays during rhythm game, loops continuously through reveal/save
 */

class AudioManager {
  private introAudio: HTMLAudioElement | null = null;
  private pulseAudio: HTMLAudioElement | null = null;
  private initialized = false;
  private fadeFrames: Map<HTMLAudioElement, number> = new Map();

  /**
   * Must be called from a user gesture (click/tap) to satisfy browser autoplay policy.
   * Safe to call multiple times — only initializes once.
   */
  init() {
    if (this.initialized) return;

    this.introAudio = new Audio('/audio/intro.mp3');
    this.pulseAudio = new Audio('/audio/pulse.mp3');
    this.pulseAudio.loop = true;

    this.introAudio.preload = 'auto';
    this.pulseAudio.preload = 'auto';

    this.initialized = true;
  }

  /** Play intro music (gate scene). Fades in to 60% over 2s. */
  playIntro() {
    if (!this.introAudio) return;
    this.introAudio.currentTime = 0;
    this.introAudio.volume = 0;
    this.introAudio.play().catch(() => {});
    this.fadeIn(this.introAudio, 0.6, 2000);
  }

  /** Crossfade from intro to pulse music over the given duration. */
  crossfadeToPulse(durationMs = 3000) {
    if (this.introAudio) {
      this.fadeOut(this.introAudio, durationMs);
    }
    if (this.pulseAudio) {
      this.pulseAudio.currentTime = 0;
      this.pulseAudio.volume = 0;
      this.pulseAudio.play().catch(() => {});
      this.fadeIn(this.pulseAudio, 0.7, durationMs);
    }
  }

  /** Duck pulse music to 40% for the constellation reveal moment. */
  duckForReveal() {
    if (this.pulseAudio) {
      this.fadeIn(this.pulseAudio, 0.4, 1500);
    }
  }

  /** Restore pulse music to 70% after reveal. */
  restoreAfterReveal() {
    if (this.pulseAudio) {
      this.fadeIn(this.pulseAudio, 0.7, 1000);
    }
  }

  /** Stop all audio and reset playback positions. */
  stopAll() {
    // Cancel any in-progress fades
    this.fadeFrames.forEach((frameId) => cancelAnimationFrame(frameId));
    this.fadeFrames.clear();

    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio.currentTime = 0;
      this.introAudio.volume = 0;
    }
    if (this.pulseAudio) {
      this.pulseAudio.pause();
      this.pulseAudio.currentTime = 0;
      this.pulseAudio.volume = 0;
    }
  }

  /** Reset for play-again. Stops everything. */
  reset() {
    this.stopAll();
  }

  // ---------------------------------------------------------------------------
  // Fade helpers using requestAnimationFrame for smooth volume transitions
  // ---------------------------------------------------------------------------

  private fadeIn(
    audio: HTMLAudioElement,
    targetVolume: number,
    durationMs: number,
  ) {
    // Cancel any existing fade on this element
    const existingFrame = this.fadeFrames.get(audio);
    if (existingFrame) cancelAnimationFrame(existingFrame);

    const startTime = performance.now();
    const startVolume = audio.volume;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-in curve for smooth ramp
      const eased = progress * progress;
      audio.volume = Math.min(
        1,
        Math.max(0, startVolume + (targetVolume - startVolume) * eased),
      );
      if (progress < 1) {
        this.fadeFrames.set(audio, requestAnimationFrame(tick));
      } else {
        this.fadeFrames.delete(audio);
      }
    };

    this.fadeFrames.set(audio, requestAnimationFrame(tick));
  }

  private fadeOut(audio: HTMLAudioElement, durationMs: number) {
    // Cancel any existing fade on this element
    const existingFrame = this.fadeFrames.get(audio);
    if (existingFrame) cancelAnimationFrame(existingFrame);

    const startTime = performance.now();
    const startVolume = audio.volume;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = progress * progress;
      audio.volume = Math.max(0, startVolume * (1 - eased));
      if (progress < 1) {
        this.fadeFrames.set(audio, requestAnimationFrame(tick));
      } else {
        audio.pause();
        audio.currentTime = 0;
        this.fadeFrames.delete(audio);
      }
    };

    this.fadeFrames.set(audio, requestAnimationFrame(tick));
  }
}

/** Singleton instance — import this, do not instantiate AudioManager directly. */
export const audioManager = new AudioManager();
