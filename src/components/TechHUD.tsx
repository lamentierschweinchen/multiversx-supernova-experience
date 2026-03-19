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
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [visible]);

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
      explain: 'the moment in time that seeded this constellation',
      color: 'rgba(255, 255, 255, 0.85)',
      dotColor: 'rgba(255, 255, 255, 0.7)',
      finalX: '0px',
      finalY: '-38vh',
      index: 0,
    },
    {
      id: 'proposer',
      title: 'ORIGIN',
      data: `bls: ${proposerDisplay}`,
      explain: 'the validator that led consensus — your central star',
      color: 'rgba(255, 255, 255, 0.85)',
      dotColor: 'rgba(255, 255, 255, 0.7)',
      finalX: '-36vw',
      finalY: '-5vh',
      index: 1,
    },
    {
      id: 'shard0',
      title: 'SECTOR 0',
      data: `${shard0Count} validators`,
      explain: "each star's position is unique to this block",
      color: SHARD_AMBER,
      dotColor: SHARD_AMBER,
      finalX: '30vw',
      finalY: '-22vh',
      index: 2,
    },
    {
      id: 'shard1',
      title: 'SECTOR 1',
      data: `${shard1Count} validators`,
      explain: 'grouped by network shard, colored by sector',
      color: SHARD_TEAL,
      dotColor: SHARD_TEAL,
      finalX: '36vw',
      finalY: '2vh',
      index: 3,
    },
    {
      id: 'shard2',
      title: 'SECTOR 2',
      data: `${shard2Count} validators`,
      explain: 'the same validator shifts position every block',
      color: SHARD_CORAL,
      dotColor: SHARD_CORAL,
      finalX: '30vw',
      finalY: '24vh',
      index: 4,
    },
    {
      id: 'crossshard',
      title: 'CROSS-SECTOR LINKS',
      data: `${crossShardPaths} paths \u00B7 ${totalTxCount} txs \u00B7 ${gasFormatted} fuel`,
      explain: "data routing between shards — the constellation's connecting lines",
      color: SOFT_BLUE,
      dotColor: SOFT_BLUE,
      finalX: '0px',
      finalY: '38vh',
      index: 5,
    },
  ];

  return (
    <div
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
      {labels.map((label) => {
        const delay = label.index * 0.1;
        const explainDelay = delay + 0.3;
        return (
          <div
            key={label.id}
            className="hud-fanout-label"
            style={{
              position: 'absolute',
              transform: show
                ? `translate(${label.finalX}, ${label.finalY})`
                : 'translate(0px, 0px)',
              opacity: show ? 1 : 0,
              transition: `transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              willChange: 'transform, opacity',
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
                textShadow: `0 0 8px ${label.dotColor}40`,
                whiteSpace: 'nowrap',
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
              <span>{label.title}</span>
            </div>

            {/* Data line — 10px, opacity 0.6 */}
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10px',
                letterSpacing: '0.5px',
                color: label.color,
                opacity: 0.6,
                textShadow: `0 0 8px ${label.dotColor}22`,
                whiteSpace: 'nowrap',
                paddingLeft: '11px',
              }}
            >
              {label.data}
            </div>

            {/* Explain line — 9px, opacity 0.35, staggered +0.3s */}
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
                opacity: show ? 0.35 : 0,
                transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${explainDelay}s`,
                willChange: 'opacity',
              }}
            >
              {label.explain}
            </div>
          </div>
        );
      })}
    </div>
  );
}
