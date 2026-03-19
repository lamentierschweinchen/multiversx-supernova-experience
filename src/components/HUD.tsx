'use client';

import { useEffect, useRef, useState } from 'react';

interface HUDProps {
  accuracy: number;
  tapCount: number;
  txCount: number;
  blockNumber: number;
  visible: boolean;
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

export default function HUD({
  accuracy,
  tapCount,
  txCount,
  blockNumber,
  visible,
}: HUDProps) {
  const animatedAccuracy = useAnimatedNumber(accuracy);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (visible) {
      // Slight delay for fade-in
      const timer = setTimeout(() => setOpacity(1), 100);
      return () => clearTimeout(timer);
    } else {
      setOpacity(0);
    }
  }, [visible]);

  return (
    <div
      className="hud"
      style={{
        inset: 0,
        opacity,
        transition: 'opacity 0.5s ease',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '13px',
      }}
    >
      {/* Top-left: Live block indicator */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(1rem, 3vh, 1.5rem)',
          left: 'clamp(1rem, 3vw, 1.5rem)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          opacity: 0.6,
        }}
      >
        <span
          className="animate-pulse-dot"
          style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#23c483',
          }}
        />
        <span>
          LIVE &middot; Block #{formatBlockNumber(blockNumber)}
        </span>
      </div>

      {/* Top-right: Accuracy */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(1rem, 3vh, 1.5rem)',
          right: 'clamp(1rem, 3vw, 1.5rem)',
          opacity: 0.6,
        }}
      >
        Accuracy: {Math.round(animatedAccuracy)}%
      </div>

      {/* Bottom-center: TX count */}
      <div
        style={{
          position: 'absolute',
          bottom: 'clamp(1rem, 3vh, 2rem)',
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: 0.5,
          fontSize: '12px',
        }}
      >
        <span>Transactions: {txCount}</span>
      </div>
    </div>
  );
}
