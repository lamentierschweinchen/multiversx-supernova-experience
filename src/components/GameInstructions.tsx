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
          fontSize: '14px',
          fontWeight: 500,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.6)',
          fontFamily: 'var(--font-mono, monospace)',
          textAlign: 'center',
          textShadow:
            '0 2px 8px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.7)',
          margin: 0,
        }}
      >
        TAP ON THE PULSE
      </p>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 400,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.38)',
          fontFamily: 'var(--font-mono, monospace)',
          textAlign: 'center',
          textShadow:
            '0 2px 8px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.7)',
          marginTop: '8px',
        }}
      >
        EVERY TAP IS A TRANSACTION ON THE NETWORK
      </p>
    </div>
  );
}
