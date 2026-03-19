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
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: 500,
    letterSpacing: '0.5px',
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
          top: '24px',
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

      {/* Top-right: TX count */}
      <div
        style={{
          position: 'absolute',
          top: '24px',
          right: '28px',
          textAlign: 'right',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', justifyContent: 'flex-end' }}>
          <span style={valueStyle}>{txCount.toLocaleString('en-US')}</span>
          <span style={labelStyle}>Transactions</span>
        </div>
      </div>
    </div>
  );
}
