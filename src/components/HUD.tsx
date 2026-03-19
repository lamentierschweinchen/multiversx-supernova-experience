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

// Dark halo for text rendered over the canvas
const textShadow = '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)';
const strongTextShadow =
  '0 2px 12px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.7)';

export default function HUD({
  accuracy,
  tapCount: _tapCount,
  txCount,
  blockNumber,
  visible,
}: HUDProps) {
  const animatedAccuracy = useAnimatedNumber(accuracy);
  const animatedTxCount = useAnimatedNumber(txCount);
  const [opacity, setOpacity] = useState(0);

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

  return (
    <div
      className="hud"
      style={{
        inset: 0,
        opacity,
        transition: 'opacity 0.5s ease',
      }}
    >
      {/* Top-left: Block number + Accuracy */}
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
        <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
          <span style={labelStyle}>Accuracy</span>
          <span style={valueStyle}>{Math.round(animatedAccuracy)}%</span>
        </div>
      </div>

      {/* Bottom-center: TX count — the main score */}
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
    </div>
  );
}
