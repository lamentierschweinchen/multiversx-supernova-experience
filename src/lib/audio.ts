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
   *
   * CRITICAL: Both tracks are played (at volume 0) here so the browser marks them
   * as user-initiated. Without this, calling .play() inside a setTimeout (crossfade)
   * will be blocked. The pulse track is immediately paused after the unlocking play()
   * call — it will be resumed later during crossfadeToPulse().
   */
  init() {
    if (this.initialized) return;

    this.introAudio = new Audio('/audio/intro.mp3');
    this.pulseAudio = new Audio('/audio/pulse.mp3');
    this.pulseAudio.loop = true;

    this.introAudio.preload = 'auto';
    this.pulseAudio.preload = 'auto';

    // Start both at volume 0 — the pulse track won't be heard yet
    this.introAudio.volume = 0;
    this.pulseAudio.volume = 0;

    // Play both immediately while still inside the user gesture call stack.
    // This "unlocks" both elements: future .play() calls (even inside setTimeout)
    // will succeed because the browser already considers them user-initiated.
    this.introAudio.play().catch((e) => console.warn('Intro unlock failed:', e));

    // For pulse: play to unlock, then pause AFTER the play promise resolves
    // (calling pause() synchronously before play() resolves causes AbortError)
    const pulseRef = this.pulseAudio;
    this.pulseAudio.play().then(() => {
      pulseRef.pause();
      pulseRef.currentTime = 0;
    }).catch(() => {
      // Autoplay was blocked entirely — that's OK, crossfadeToPulse will retry
    });

    this.initialized = true;
  }

  /** Play intro music (gate scene). Fades in to 60% over 2s. */
  playIntro() {
    if (!this.introAudio) return;
    this.introAudio.currentTime = 0;
    this.introAudio.volume = 0;
    // Already unlocked from init() — this will succeed even without a fresh gesture
    this.introAudio.play().catch((e) => console.warn('Intro play failed:', e));
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
      // Already unlocked from init() — succeeds inside setTimeout
      this.pulseAudio.play().catch((e) => console.warn('Pulse play failed:', e));
      this.fadeIn(this.pulseAudio, 0.7, durationMs);
    }
  }

  /**
   * Reset the pulse track's playhead to 0 so the next downbeat in the audio
   * aligns with the visual pulse fired by BlockSync. Call this at the exact
   * moment BlockSync begins firing beats (i.e. when rhythm state starts).
   */
  syncPulseToBeat() {
    if (this.pulseAudio) {
      this.pulseAudio.currentTime = 0;
    }
  }

  /**
   * Returns a 0–1 value representing how far through the current beat we are,
   * based on the pulse track's playback position. 0 = downbeat, 1 = just
   * before the next downbeat. Beat period is 600 ms (100 BPM).
   */
  getBeatPhase(): number {
    if (!this.pulseAudio) return 0;
    const beatDuration = 0.6; // seconds — 100 BPM
    return (this.pulseAudio.currentTime % beatDuration) / beatDuration;
  }

  /**
   * Returns milliseconds elapsed since the last musical downbeat, derived
   * from the pulse track's audio clock. This is the authoritative timing
   * source during rhythm — it never drifts from the music.
   *
   * Beat period: 600 ms (100 BPM).
   * Returns 0 if the pulse track is not available or not playing.
   */
  getTimeSinceLastMusicalBeat(): number {
    if (!this.pulseAudio || this.pulseAudio.paused) return 0;
    const beatDurationSec = 0.6; // 100 BPM
    const posInBeat = this.pulseAudio.currentTime % beatDurationSec;
    return posInBeat * 1000; // convert seconds → ms
  }

  /**
   * Returns the musical beat interval in ms. Always 600 ms (100 BPM) for the
   * pulse track. Exposed so callers don't need to hard-code the BPM value.
   */
  getMusicalBeatInterval(): number {
    return 600;
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
