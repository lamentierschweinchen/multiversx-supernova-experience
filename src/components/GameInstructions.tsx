'use client';

import { useEffect, useState } from 'react';

interface GameInstructionsProps {
  visible: boolean;
}

export default function GameInstructions({ visible }: GameInstructionsProps) {
  const [opacity, setOpacity] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Fade in after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1);
        });
      });
    } else {
      setOpacity(0);
    }
  }, [visible]);

  const handleTransitionEnd = () => {
    if (!visible && opacity === 0) {
      setMounted(false);
    }
  };

  if (!mounted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        paddingTop: '12vh',
        opacity,
        transition: 'opacity 0.5s ease',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <p
        style={{
          fontSize: 'clamp(0.875rem, 2vw, 1.125rem)',
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.55)',
          fontFamily: 'var(--font-mono, monospace)',
          textAlign: 'center',
        }}
      >
        Tap the Rhythm
      </p>
      <p
        style={{
          marginTop: '0.5rem',
          fontSize: 'clamp(0.6875rem, 1.4vw, 0.8125rem)',
          color: 'rgba(255, 255, 255, 0.3)',
          textAlign: 'center',
          fontWeight: 300,
          letterSpacing: '0.04em',
        }}
      >
        match the pulse — each tap sends a transaction
      </p>
    </div>
  );
}
