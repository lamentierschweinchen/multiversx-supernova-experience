'use client';

import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  visible: boolean;
}

export default function LoadingScreen({ visible }: LoadingScreenProps) {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!visible) {
      setOpacity(0);
    }
  }, [visible]);

  if (!visible && opacity === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        opacity,
        transition: 'opacity 0.8s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onTransitionEnd={() => {
        if (!visible) setOpacity(0);
      }}
    >
      <div className="animate-pulse-loading" style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(3rem, 10vw, 6rem)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-mono, monospace)',
          }}
          className="gradient-text"
        >
          600ms
        </h1>
        <p
          style={{
            marginTop: '1.5rem',
            fontSize: 'clamp(0.875rem, 2vw, 1.125rem)',
            opacity: 0.4,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Entering the Supernova...
        </p>
      </div>
    </div>
  );
}
