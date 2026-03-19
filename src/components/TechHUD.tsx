'use client';

import { useEffect, useState } from 'react';
import type { BlockData, ConstellationData } from '@/lib/types';

interface TechHUDProps {
  blockData: BlockData | null;
  constellationData: ConstellationData | null;
  visible: boolean;
}

function truncate(hex: string, chars: number = 4): string {
  if (hex.length <= chars * 2 + 3) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

function formatGas(gas: number): string {
  if (gas >= 1_000_000_000) return `${(gas / 1_000_000_000).toFixed(2)}B`;
  if (gas >= 1_000_000) return `${(gas / 1_000_000).toFixed(1)}M`;
  if (gas >= 1_000) return `${(gas / 1_000).toFixed(1)}K`;
  return gas.toString();
}

function getValidatorCountsByShard(blockData: BlockData): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of blockData.validators) {
    counts.set(v.shard, (counts.get(v.shard) ?? 0) + 1);
  }
  return counts;
}

function getCrossShardPaths(blockData: BlockData): number {
  let count = 0;
  for (const mb of blockData.miniBlocks) {
    if (mb.senderShard !== mb.receiverShard) {
      count++;
    }
  }
  return count;
}

// Shard colors
const SHARD_AMBER = '#e8a849';
const SHARD_TEAL = '#4ecdc4';
const SHARD_CORAL = '#e06c75';

// Shared text styles
const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '11px',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  color: 'rgba(255,255,255,0.7)',
  marginBottom: '6px',
};

const bodyTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '10px',
  lineHeight: 1.6,
  color: 'rgba(255,255,255,0.45)',
  letterSpacing: '0.3px',
  textTransform: 'none' as const,
};

const dataValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '10px',
  color: 'rgba(255,255,255,0.6)',
  letterSpacing: '0.3px',
  textTransform: 'none' as const,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '20px',
};

interface ShardDotProps {
  color: string;
}

function ShardDot({ color }: ShardDotProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 5px ${color}88`,
        marginRight: '6px',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}

export default function TechHUD({
  blockData,
  constellationData,
  visible,
}: TechHUDProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Reset when hidden
  useEffect(() => {
    if (!visible) {
      setOpen(false);
    }
  }, [visible]);

  // Trigger CSS transition by mounting first, then animating in
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(timer);
    } else {
      setMounted(false);
    }
  }, [open]);

  if (!visible || !blockData) return null;

  const shardCounts = getValidatorCountsByShard(blockData);
  const crossShardPaths = getCrossShardPaths(blockData);

  const shard0Count = shardCounts.get(0) ?? 0;
  const shard1Count = shardCounts.get(1) ?? 0;
  const shard2Count = shardCounts.get(2) ?? 0;

  const proposerDisplay =
    blockData.proposer && blockData.proposer.length >= 8
      ? truncate(blockData.proposer, 4)
      : blockData.proposer ?? '—';

  const gasFormatted = formatGas(blockData.gasConsumed);

  return (
    <>
      {/* Side panel */}
      <div
        className="tech-hud"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: '44px', // above save bar
          width: 'min(380px, 85vw)',
          zIndex: 25,
          transform: open && mounted ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
          background: 'rgba(5, 5, 16, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto',
          overflowX: 'hidden',
          // Hide scrollbar visually but keep scroll functionality
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
          pointerEvents: open ? 'auto' : 'none',
        }}
        // Prevent taps inside the panel from triggering the rhythm tap handler
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          aria-label="Close panel"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '16px',
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono, monospace)',
            transition: 'border-color 0.2s, color 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          ×
        </button>

        {/* Scrollable content */}
        <div style={{ padding: '24px', paddingRight: '48px', paddingBottom: '32px' }}>

          {/* Section 1 — Introduction */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>How your constellation was computed</div>
            <p style={bodyTextStyle}>
              Every 600 milliseconds, the MultiversX network produces a block. Each block is proposed by
              one validator and confirmed by dozens more across three parallel shards. Your taps during
              the rhythm game were sent as real transactions to this network.
            </p>
            <p style={{ ...bodyTextStyle, marginTop: '10px' }}>
              The constellation you see was generated deterministically from{' '}
              <span style={dataValueStyle}>Block #{blockData.nonce.toLocaleString('en-US')}</span>.
              Every visual element maps to real network data:
            </p>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '20px' }} />

          {/* Section 2 — Central star / proposer */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>The central star — block proposer</div>
            <div style={{ ...dataValueStyle, marginBottom: '6px' }}>
              BLS: {proposerDisplay}
            </div>
            <p style={bodyTextStyle}>
              The validator that proposed this block becomes your brightest star. Its position is derived
              by hashing the proposer&apos;s BLS public key with the block nonce — a different block
              would place it differently.
            </p>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '20px' }} />

          {/* Section 3 — Shard clusters */}
          <div style={sectionStyle}>
            {/* Shard 0 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center' }}>
                <ShardDot color={SHARD_AMBER} />
                Shard 0 — {shard0Count} validators
              </div>
              <p style={bodyTextStyle}>
                Each star represents a validator that participated in this block&apos;s consensus. Stars are
                colored by shard: amber for Shard 0, teal for Shard 1, coral for Shard 2. Each
                validator&apos;s position is seeded from their BLS key XORed with the block nonce, so the
                same validator appears in a different place every block.
              </p>
            </div>

            {/* Shard 1 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center' }}>
                <ShardDot color={SHARD_TEAL} />
                Shard 1 — {shard1Count} validators
              </div>
            </div>

            {/* Shard 2 */}
            <div>
              <div style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center' }}>
                <ShardDot color={SHARD_CORAL} />
                Shard 2 — {shard2Count} validators
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '20px' }} />

          {/* Section 4 — Cross-shard paths */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              Cross-shard paths — {crossShardPaths} links
            </div>
            <div style={{ ...dataValueStyle, marginBottom: '6px' }}>
              {blockData.txCount.toLocaleString('en-US')} transactions · {gasFormatted} gas
            </div>
            <p style={bodyTextStyle}>
              When a miniblock routes data between shards, it traces a line in the constellation.
              Solid lines are token transfers. Dashed lines are smart contract calls. The number of
              cross-shard paths directly determines the complexity of the constellation&apos;s structure.
            </p>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '20px' }} />

          {/* Section 5 — Uniqueness */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Why no two are alike</div>
            <p style={bodyTextStyle}>
              The combination of block nonce, proposer identity, validator set, and cross-shard routing
              creates a fingerprint that is statistically unique. Even consecutive blocks with the same
              validators produce different constellations because the nonce XOR shifts every position.
            </p>
          </div>

        </div>
      </div>

      {/* Toggle button — hidden when panel is open */}
      {!open && (
        <button
          className="tech-hud"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            right: '16px',
            bottom: '56px', // above save bar
            height: '26px',
            padding: '0 12px',
            borderRadius: '13px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(5, 5, 16, 0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '1px',
            textTransform: 'uppercase' as const,
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
            zIndex: 26,
            pointerEvents: 'auto',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          What am I looking at?
        </button>
      )}
    </>
  );
}
