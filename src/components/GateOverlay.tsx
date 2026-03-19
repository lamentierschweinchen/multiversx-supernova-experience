'use client';

import { useEffect, useState } from 'react';

interface GateOverlayProps {
  visible: boolean;
  onEnter: () => void;
}

export default function GateOverlay({ visible, onEnter }: GateOverlayProps) {
  const [fading, setFading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setFading(false);
    } else if (mounted) {
      setFading(true);
    }
  }, [visible, mounted]);

  const handleClick = () => {
    if (!visible || fading) return;
    setFading(true);
    onEnter();
  };

  if (!mounted) return null;

  return (
    <div
      className={`gate-overlay ${visible && !fading ? 'interactive' : ''}`}
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}
      onClick={handleClick}
      onTouchStart={handleClick}
      onTransitionEnd={() => {
        if (fading && !visible) {
          setMounted(false);
        }
      }}
    >
      {/* Top label */}
      <p
        style={{
          fontSize: '10px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.5)',
          marginBottom: '1.5rem',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 400,
        }}
      >
        MultiversX
      </p>

      {/* Main title — monospace, large, glowing */}
      <h1
        style={{
          fontSize: 'clamp(2.25rem, 8vw, 3rem)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          lineHeight: 1,
          textAlign: 'center',
          userSelect: 'none',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.9)',
          textShadow:
            '0 0 40px rgba(255, 255, 255, 0.15), 0 0 80px rgba(255, 255, 255, 0.05)',
        }}
      >
        SUPERNOVA
      </h1>

      {/* Subtitle */}
      <p
        style={{
          marginTop: '1.5rem',
          fontSize: '12px',
          fontWeight: 400,
          color: 'rgba(255, 255, 255, 0.5)',
          textAlign: 'center',
          maxWidth: '28rem',
          lineHeight: 1.8,
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        The universe expands. Block by block.
        <br />
        Every 600 milliseconds.
      </p>

      {/* Enter prompt */}
      <div
        className="animate-pulse-soft"
        style={{
          position: 'absolute',
          bottom: 'clamp(3rem, 8vh, 6rem)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <p
          style={{
            fontSize: '10px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono, monospace)',
            color: 'rgba(255, 255, 255, 0.4)',
            fontWeight: 400,
          }}
        >
          Enter
        </p>
      </div>

      {/* Footnote */}
      <p
        style={{
          position: 'absolute',
          bottom: '1rem',
          fontSize: '9px',
          color: 'rgba(255, 255, 255, 0.18)',
          letterSpacing: '0.5px',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
        }}
      >
        Deployed on the Battle of Nodes shadow fork
      </p>
    </div>
  );
}
