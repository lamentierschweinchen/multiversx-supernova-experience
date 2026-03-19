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
        justifyContent: 'flex-start',
        pointerEvents: 'none',
        paddingTop: '18vh',
        opacity,
        transition: 'opacity 0.5s ease',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <p
        style={{
          fontSize: '16px',
          fontWeight: 500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.8)',
          fontFamily: 'var(--font-mono, monospace)',
          textAlign: 'center',
          textShadow: '0 0 20px rgba(0, 229, 255, 0.5)',
          margin: 0,
        }}
      >
        FEEL THE PULSE
      </p>
      <p
        style={{
          marginTop: '0.6rem',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.55)',
          textAlign: 'center',
          fontWeight: 400,
          letterSpacing: '0.15em',
          fontFamily: 'var(--font-mono, monospace)',
          textShadow: '0 0 12px rgba(0, 229, 255, 0.3)',
        }}
      >
        tap when the star expands
      </p>
    </div>
  );
}
