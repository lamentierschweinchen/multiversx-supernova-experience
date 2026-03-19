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

// Shard colors from galaxy-of-nodes
const SHARD_AMBER = '#e8a849';
const SHARD_TEAL = '#4ecdc4';
const SHARD_CORAL = '#e06c75';
const SOFT_BLUE = '#6b8aaa';

interface HUDLabel {
  id: string;
  title: string;
  data: string;
  explain: string;
  color: string;
  dotColor: string;
  finalX: string;
  finalY: string;
  index: number;
}

export default function TechHUD({
  blockData,
  constellationData,
  visible,
}: TechHUDProps) {
  // expanded controls whether the fan-out labels are shown
  const [expanded, setExpanded] = useState(false);
  // fanout controls the animated expansion (separate so we can delay)
  const [fanout, setFanout] = useState(false);

  // Reset when hidden
  useEffect(() => {
    if (!visible) {
      setExpanded(false);
      setFanout(false);
    }
  }, [visible]);

  // When expanded changes, drive fanout with a micro-delay so CSS transition triggers
  useEffect(() => {
    if (expanded) {
      const timer = setTimeout(() => setFanout(true), 30);
      return () => clearTimeout(timer);
    } else {
      setFanout(false);
    }
  }, [expanded]);

  if (!visible || !blockData) return null;

  const shardCounts = getValidatorCountsByShard(blockData);
  const crossShardPaths = getCrossShardPaths(blockData);

  const shard0Count = shardCounts.get(0) ?? 0;
  const shard1Count = shardCounts.get(1) ?? 0;
  const shard2Count = shardCounts.get(2) ?? 0;

  // Block hash: use blockData.hash if available, else nonce as hex
  const hashStr = blockData.hash && blockData.hash.length >= 8
    ? blockData.hash
    : blockData.nonce.toString(16).padStart(8, '0');
  const hashDisplay = truncate(hashStr, 4);

  // Proposer BLS key truncated
  const proposerDisplay = blockData.proposer && blockData.proposer.length >= 8
    ? truncate(blockData.proposer, 4)
    : blockData.proposer ?? '—';

  const totalTxCount = blockData.txCount;
  const gasFormatted = formatGas(blockData.gasConsumed);

  const labels: HUDLabel[] = [
    {
      id: 'blockinfo',
      title: `BLOCK #${blockData.nonce.toLocaleString('en-US')}`,
      data: `hash: ${hashDisplay}`,
      explain: `this moment in the network's history seeded your unique constellation`,
      color: 'rgba(255, 255, 255, 0.85)',
      dotColor: 'rgba(255, 255, 255, 0.7)',
      finalX: '0px',
      finalY: '-38vh',
      index: 0,
    },
    {
      id: 'proposer',
      title: 'ORIGIN — BLOCK PROPOSER',
      data: `bls: ${proposerDisplay}`,
      explain: `the validator that led consensus for this block — your central star`,
      color: 'rgba(255, 255, 255, 0.85)',
      dotColor: 'rgba(255, 255, 255, 0.7)',
      finalX: 'clamp(-160px, -36vw, -80px)',
      finalY: '-5vh',
      index: 1,
    },
    {
      id: 'shard0',
      title: 'SECTOR 0 — NETWORK SHARD',
      data: `${shard0Count} validators in this partition`,
      explain: `the network splits into parallel lanes — each processes transactions independently`,
      color: SHARD_AMBER,
      dotColor: SHARD_AMBER,
      finalX: 'clamp(80px, 30vw, 160px)',
      finalY: '-22vh',
      index: 2,
    },
    {
      id: 'shard1',
      title: 'SECTOR 1 — NETWORK SHARD',
      data: `${shard1Count} validators in this partition`,
      explain: `stars are grouped and colored by which shard their validator operates in`,
      color: SHARD_TEAL,
      dotColor: SHARD_TEAL,
      finalX: 'clamp(80px, 36vw, 160px)',
      finalY: '2vh',
      index: 3,
    },
    {
      id: 'shard2',
      title: 'SECTOR 2 — NETWORK SHARD',
      data: `${shard2Count} validators in this partition`,
      explain: `each validator's position shifts every block — no two constellations are alike`,
      color: SHARD_CORAL,
      dotColor: SHARD_CORAL,
      finalX: 'clamp(80px, 30vw, 160px)',
      finalY: '24vh',
      index: 4,
    },
    {
      id: 'crossshard',
      title: 'CROSS-SECTOR LINKS',
      data: `${crossShardPaths} paths \u00B7 ${totalTxCount} transactions \u00B7 ${gasFormatted} fuel`,
      explain: `when data routes between shards, it traces the lines connecting your stars`,
      color: SOFT_BLUE,
      dotColor: SOFT_BLUE,
      finalX: '0px',
      finalY: '38vh',
      index: 5,
    },
  ];

  return (
    <div
      className="tech-hud"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Fan-out labels — only rendered when expanded */}
      {expanded && labels.map((label) => {
        const delay = label.index * 0.1;
        const explainDelay = delay + 0.3;
        return (
          <div
            key={label.id}
            className="hud-fanout-label"
            style={{
              position: 'absolute',
              transform: fanout
                ? `translate(${label.finalX}, ${label.finalY})`
                : 'translate(0px, 0px)',
              opacity: fanout ? 1 : 0,
              transition: `transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              willChange: 'transform, opacity',
              maxWidth: 'calc(50vw - 20px)',
            }}
          >
            {/* Title line — 11px, opacity 0.8 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '11px',
                letterSpacing: '1px',
                textTransform: 'uppercase' as const,
                color: label.color,
                opacity: 0.8,
                textShadow: `0 0 8px ${label.dotColor}40, 0 0 12px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.6)`,
              }}
            >
              {/* Colored dot pip */}
              <span
                style={{
                  display: 'inline-block',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: label.dotColor,
                  boxShadow: `0 0 6px ${label.dotColor}88`,
                  flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: 'nowrap' }}>{label.title}</span>
            </div>

            {/* Data line — 10px, opacity 0.6 */}
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10px',
                letterSpacing: '0.5px',
                color: label.color,
                opacity: 0.6,
                textShadow: `0 0 8px ${label.dotColor}22, 0 0 12px rgba(0,0,0,0.8)`,
                whiteSpace: 'nowrap',
                paddingLeft: '11px',
              }}
            >
              {label.data}
            </div>

            {/* Explain line — 9px, opacity 0.35, staggered +0.3s, wrapping allowed */}
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '9px',
                letterSpacing: '0.4px',
                color: label.color,
                maxWidth: '200px',
                textAlign: 'center',
                lineHeight: 1.4,
                paddingLeft: '11px',
                opacity: fanout ? 0.35 : 0,
                transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${explainDelay}s`,
                willChange: 'opacity',
                textShadow: '0 0 10px rgba(0,0,0,0.9)',
              }}
            >
              {label.explain}
            </div>
          </div>
        );
      })}

      {/* Toggle button — always visible when TechHUD is shown */}
      {/* Positioned bottom-right above save bar (bottom: 56px) */}
      <div
        style={{
          position: 'fixed',
          bottom: '56px',
          right: '16px',
          pointerEvents: 'auto',
          zIndex: 26,
          display: 'flex',
          gap: '6px',
        }}
      >
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              height: '26px',
              padding: '0 12px',
              borderRadius: '13px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(5, 5, 16, 0.7)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '1px',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              transition: 'border-color 0.2s, color 0.2s',
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
            Close
          </button>
        )}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              height: '26px',
              padding: '0 12px',
              borderRadius: '13px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(5, 5, 16, 0.7)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '1px',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              transition: 'border-color 0.2s, color 0.2s',
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
            Explain this
          </button>
        )}
      </div>
    </div>
  );
}
