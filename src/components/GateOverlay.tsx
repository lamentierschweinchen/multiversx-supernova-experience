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
      {/* Subtle top label */}
      <p
        style={{
          fontSize: 'clamp(0.625rem, 1.2vw, 0.75rem)',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          opacity: 0.4,
          marginBottom: '2rem',
          fontFamily: 'var(--font-geist-mono, monospace)',
        }}
      >
        MultiversX Battle of Nodes
      </p>

      {/* Main title */}
      <h1
        className="gradient-text"
        style={{
          fontSize: 'clamp(3rem, 12vw, 8rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        SUPERNOVA
      </h1>

      {/* Subtitle */}
      <p
        style={{
          marginTop: '1.5rem',
          fontSize: 'clamp(0.875rem, 2vw, 1.25rem)',
          opacity: 0.5,
          textAlign: 'center',
          maxWidth: '28rem',
          lineHeight: 1.5,
        }}
      >
        A blockchain that finalizes in 600 milliseconds.
      </p>

      {/* Secondary subtitle */}
      <p
        style={{
          marginTop: '0.5rem',
          fontSize: 'clamp(0.75rem, 1.5vw, 1rem)',
          opacity: 0.35,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Faster than you can blink.
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
            fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-geist-mono, monospace)',
          }}
        >
          Enter
        </p>
        <span
          style={{
            fontSize: '1.25rem',
            lineHeight: 1,
          }}
        >
          &#8595;
        </span>
      </div>
    </div>
  );
}
