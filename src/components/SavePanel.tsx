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

function truncateAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function getUniqueShards(blockData: BlockData): number {
  const shards = new Set<number>();
  for (const v of blockData.validators) {
    shards.add(v.shard);
  }
  return shards.size;
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

  const uniqueShards = getUniqueShards(blockData);
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
      // Fallback for older browsers
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
    <div
      className="save-panel"
      style={{
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
      }}
    >
      <div
        className="animate-slide-up"
        style={{
          width: '100%',
          maxWidth: '32rem',
          background: 'rgba(10, 10, 20, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
          borderRadius: '1rem',
          padding: 'clamp(1.25rem, 3vw, 2rem)',
          fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
        }}
      >
        {/* Constellation name */}
        <h2
          style={{
            fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
            fontWeight: 700,
            marginBottom: '0.25rem',
          }}
        >
          <span className="gradient-text">
            Block #{formatNumber(blockData.nonce)}
          </span>
          <span style={{ opacity: 0.4, fontSize: '0.875em', marginLeft: '0.5rem' }}>
            &middot; {uniqueShards} shard{uniqueShards !== 1 ? 's' : ''}
          </span>
        </h2>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
            flexWrap: 'wrap',
            marginTop: '0.75rem',
            fontSize: 'clamp(0.75rem, 1.5vw, 0.8125rem)',
            opacity: 0.6,
            fontFamily: 'var(--font-geist-mono, monospace)',
          }}
        >
          <span>{constellationData.stars.length} validators</span>
          <span>{uniqueShards} shards</span>
          <span>{formatNumber(blockData.txCount)} txs</span>
        </div>

        {/* Proposer */}
        <div
          style={{
            marginTop: '0.75rem',
            fontSize: '0.75rem',
            opacity: 0.35,
            fontFamily: 'var(--font-geist-mono, monospace)',
            wordBreak: 'break-all',
          }}
        >
          Proposer: {truncateAddress(blockData.proposer, 12)}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
            marginTop: '1.25rem',
          }}
        >
          {/* Save Image */}
          <button
            onClick={onExportPNG}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(0, 229, 255, 0.5)',
              background: 'rgba(0, 229, 255, 0.1)',
              color: '#00e5ff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 229, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 229, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.5)';
            }}
          >
            Save Image
          </button>

          {/* Share Link */}
          <button
            onClick={handleCopyLink}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(124, 58, 237, 0.5)',
              background: 'rgba(124, 58, 237, 0.1)',
              color: '#a78bfa',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.5)';
            }}
          >
            {copied ? 'Copied!' : 'Share Link'}
          </button>

          {/* Wallet teaser */}
          <button
            disabled
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: 'rgba(255, 255, 255, 0.3)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            Connect Wallet to Reserve Mint
            <span
              style={{
                display: 'block',
                fontSize: '0.6875rem',
                opacity: 0.5,
                marginTop: '0.25rem',
                fontWeight: 400,
              }}
            >
              Available when Supernova launches on mainnet
            </span>
          </button>

          {/* Play Again */}
          <button
            onClick={onPlayAgain}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
              fontFamily: 'inherit',
              marginTop: '0.25rem',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
