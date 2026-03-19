'use client';

import { useEffect, useRef, useState } from 'react';

interface HUDProps {
  accuracy: number;
  tapCount: number;
  txCount: number;
  blockNumber: number;
  visible: boolean;
  /** 0–1, where 1 = round complete. Used to render the progress ring. */
  roundProgress?: number;
  /** Accuracy of the most recent individual tap (0–100), updated per tap. */
  lastTapAccuracy?: number;
}

function formatBlockNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Smoothly animated number display. Counts toward target over ~300ms.
 */
function useAnimatedNumber(target: number, duration: number = 300): number {
  const [display, setDisplay] = useState(target);
  const startRef = useRef(target);
  const startTimeRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    startRef.current = display;
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = startRef.current + (target - startRef.current) * eased;
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

/** Returns a quality word and color for a given accuracy value (0–100). */
function getQuality(acc: number): { word: string; color: string } {
  if (acc >= 95) return { word: 'PERFECT', color: '#ffd700' };
  if (acc >= 85) return { word: 'GREAT', color: '#00e5ff' };
  if (acc >= 60) return { word: 'GOOD', color: 'rgba(255,255,255,0.9)' };
  if (acc >= 40) return { word: 'OK', color: 'rgba(255,255,255,0.5)' };
  return { word: 'MISS', color: '#e06c75' };
}

// Dark halo for text rendered over the canvas
const textShadow = '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)';
const strongTextShadow =
  '0 2px 12px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.7)';

// SVG ring constants
const RING_SIZE = 80; // diameter px
const RING_STROKE = 2;
const RING_R = (RING_SIZE - RING_STROKE) / 2; // radius
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

export default function HUD({
  accuracy,
  tapCount: _tapCount,
  txCount,
  blockNumber,
  visible,
  roundProgress = 0,
  lastTapAccuracy,
}: HUDProps) {
  const animatedAccuracy = useAnimatedNumber(accuracy);
  const animatedTxCount = useAnimatedNumber(txCount);
  const [opacity, setOpacity] = useState(0);

  // --- Quality word state (top-left accuracy replacement) ---
  // We derive it from the rolling average accuracy for the persistent display.
  const avgQuality = getQuality(Math.round(animatedAccuracy));

  // --- Tap feedback flash (center screen) ---
  const [flashWord, setFlashWord] = useState<string | null>(null);
  const [flashColor, setFlashColor] = useState<string>('#fff');
  const [flashKey, setFlashKey] = useState(0); // bump to re-trigger animation
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lastTapAccuracy === undefined) return;
    const q = getQuality(lastTapAccuracy);
    setFlashWord(q.word);
    setFlashColor(q.color);
    setFlashKey((k) => k + 1);

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashWord(null), 700);
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [lastTapAccuracy]);

  // --- Ring flash at completion ---
  const [ringFlash, setRingFlash] = useState(false);
  const ringFlashRef = useRef(false);
  useEffect(() => {
    if (roundProgress >= 1 && !ringFlashRef.current) {
      ringFlashRef.current = true;
      setRingFlash(true);
      setTimeout(() => setRingFlash(false), 600);
    }
    if (roundProgress < 0.99) {
      ringFlashRef.current = false;
    }
  }, [roundProgress]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setOpacity(1), 100);
      return () => clearTimeout(timer);
    } else {
      setOpacity(0);
    }
  }, [visible]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    userSelect: 'none',
    textShadow,
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: 500,
    letterSpacing: '0.5px',
    textShadow,
  };

  // Progress ring arc: how much of the circumference to show
  const clampedProgress = Math.min(Math.max(roundProgress, 0), 1);
  const dashOffset = RING_CIRCUMFERENCE * (1 - clampedProgress);
  const ringFillColor = ringFlash
    ? 'rgba(0, 229, 255, 0.95)'
    : 'rgba(0, 229, 255, 0.5)';

  return (
    <div
      className="hud"
      style={{
        inset: 0,
        opacity,
        transition: 'opacity 0.5s ease',
      }}
    >
      {/* Keyframe styles */}
      <style>{`
        @keyframes hud-quality-pop {
          0%   { transform: scale(0.7); opacity: 0; }
          40%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes hud-flash-up {
          0%   { opacity: 1; transform: translate(-50%, 0); }
          60%  { opacity: 1; transform: translate(-50%, -12px); }
          100% { opacity: 0; transform: translate(-50%, -28px); }
        }
      `}</style>

      {/* Top-left: Block number + Quality word */}
      <div
        style={{
          position: 'absolute',
          top: 'max(24px, env(safe-area-inset-top, 24px))',
          left: '28px',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={labelStyle}>Block</span>
          <span style={valueStyle}>#{formatBlockNumber(blockNumber)}</span>
        </div>

        {/* Quality word row — replaces "ACCURACY 82%" */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
          <span
            key={accuracy}
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '13px',
              fontWeight: 600,
              color: avgQuality.color,
              letterSpacing: '0.5px',
              textShadow,
              animation: accuracy > 0 ? 'hud-quality-pop 0.25s ease-out forwards' : undefined,
              display: 'inline-block',
            }}
          >
            {accuracy > 0 ? avgQuality.word : '—'}
          </span>
          {/* Tiny numeric accuracy for data nerds */}
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '9px',
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.3px',
              textShadow,
            }}
          >
            {accuracy > 0 ? `${Math.round(animatedAccuracy)}%` : ''}
          </span>
        </div>
      </div>

      {/* Bottom-center: TX count with progress ring */}
      <div
        style={{
          position: 'absolute',
          bottom: 'clamp(60px, 10vh, 80px)',
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {/* Ring + number stacked */}
        <div style={{ position: 'relative', width: `${RING_SIZE}px`, height: `${RING_SIZE}px` }}>
          {/* SVG progress ring */}
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* Track */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={RING_STROKE}
            />
            {/* Fill arc — starts from top (rotate -90deg) */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              fill="none"
              stroke={ringFillColor}
              strokeWidth={RING_STROKE}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{
                transform: 'rotate(-90deg)',
                transformOrigin: `${RING_SIZE / 2}px ${RING_SIZE / 2}px`,
                transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s ease',
              }}
            />
          </svg>

          {/* Number centered inside ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '24px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.92)',
                letterSpacing: '1px',
                lineHeight: 1,
                textShadow: strongTextShadow,
              }}
            >
              {Math.round(animatedTxCount).toLocaleString('en-US')}
            </span>
          </div>
        </div>

        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.5)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginTop: '4px',
            textShadow,
          }}
        >
          TRANSACTIONS
        </span>
      </div>

      {/* Center-screen tap feedback flash */}
      {flashWord && (
        <div
          key={flashKey}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, 0)',
            pointerEvents: 'none',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '20px',
            fontWeight: 700,
            color: flashColor,
            letterSpacing: '2px',
            textShadow: strongTextShadow,
            animation: 'hud-flash-up 0.7s ease-out forwards',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          {flashWord}
        </div>
      )}
    </div>
  );
}
