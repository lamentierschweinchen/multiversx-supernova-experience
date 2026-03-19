'use client';

import { useState } from 'react';
import type { BlockData, ConstellationData } from '@/lib/types';

interface SavePanelProps {
  blockData: BlockData;
  constellationData: ConstellationData;
  onExportPNG: () => void;
  onPlayAgain: () => void;
  visible: boolean;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

const buttonBase: React.CSSProperties = {
  height: '30px',
  padding: '0 14px',
  borderRadius: '15px',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  background: 'rgba(5, 5, 16, 0.5)',
  color: 'rgba(255, 255, 255, 0.6)',
  fontSize: '10px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'border-color 0.2s, color 0.2s',
  fontFamily: 'var(--font-mono, monospace)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase' as const,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  pointerEvents: 'auto' as const,
};

function handleButtonEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
}

function handleButtonLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
}

export default function SavePanel({
  blockData,
  constellationData,
  onExportPNG,
  onPlayAgain,
  visible,
}: SavePanelProps) {
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/constellation/${blockData.nonce}`
      : `/constellation/${blockData.nonce}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Personalization message above the bar */}
      <div
        className="save-panel"
        style={{
          bottom: '50px',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: 'rgba(255, 255, 255, 0.4)',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          Your constellation — shaped by your rhythm, unique to this moment.
        </p>
        <p
          style={{
            fontSize: '9px',
            color: 'rgba(255, 255, 255, 0.25)',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            marginTop: '4px',
          }}
        >
          Save it now. Mint it on-chain when Supernova goes live.
        </p>
      </div>

      <div
        className="save-panel animate-slide-up"
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 clamp(1rem, 3vw, 2rem)',
          height: '44px',
          background: 'rgba(5, 5, 16, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Left: block info */}
        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.6)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          Block #{formatNumber(blockData.nonce)} &middot;{' '}
          {constellationData.stars.length} stars &middot;{' '}
          {formatNumber(blockData.txCount)} txs
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: action buttons */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {/* Save */}
          <button
            onClick={onExportPNG}
            title="Save Image"
            style={buttonBase}
            onMouseEnter={handleButtonEnter}
            onMouseLeave={handleButtonLeave}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Save
          </button>

          {/* Share */}
          <button
            onClick={handleCopyLink}
            title="Copy Share Link"
            style={buttonBase}
            onMouseEnter={handleButtonEnter}
            onMouseLeave={handleButtonLeave}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copied ? 'Copied' : 'Share'}
          </button>

          {/* Play Again */}
          <button
            onClick={onPlayAgain}
            title="Play Again"
            style={buttonBase}
            onMouseEnter={handleButtonEnter}
            onMouseLeave={handleButtonLeave}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Again
          </button>
        </div>
      </div>
    </>
  );
}
