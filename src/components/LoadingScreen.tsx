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
        background: '#050510',
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
            fontSize: '32px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-mono, monospace)',
            color: 'rgba(255, 255, 255, 0.8)',
            textTransform: 'uppercase',
          }}
        >
          600MS
        </h1>
        <p
          style={{
            marginTop: '1.5rem',
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.4)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          Synchronizing...
        </p>
      </div>
    </div>
  );
}
