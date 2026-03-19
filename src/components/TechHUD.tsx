'use client';

import { useEffect, useState } from 'react';
import type { BlockData, ConstellationData } from '@/lib/types';

interface TechHUDProps {
  blockData: BlockData | null;
  constellationData: ConstellationData | null;
  visible: boolean;
}

function truncateHex(hex: string, chars: number = 8): string {
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

interface HUDLabel {
  id: string;
  text: string;
  subtext?: string;
  color: string;
  dotColor: string;
  /** Final position offset from center as vw/vh percentages */
  finalX: string;
  finalY: string;
  /** Index for stagger delay */
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
      // 1.5-second delay before fan-out animation begins
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

  const labels: HUDLabel[] = [
    {
      id: 'blockinfo',
      text: `BLOCK #${blockData.nonce.toLocaleString('en-US')} \u00B7 ${blockData.txCount} TXS \u00B7 ${formatGas(blockData.gasConsumed)} FUEL`,
      color: 'rgba(255, 255, 255, 0.85)',
      dotColor: 'rgba(255, 255, 255, 0.7)',
      finalX: '0px',
      finalY: '-38vh',
      index: 0,
    },
    {
      id: 'proposer',
      text: 'ORIGIN',
      subtext: truncateHex(blockData.proposer, 8),
      color: 'rgba(255, 240, 220, 0.8)',
      dotColor: 'rgba(255, 240, 220, 0.7)',
      finalX: '-36vw',
      finalY: '-5vh',
      index: 1,
    },
    {
      id: 'shard0',
      text: `SECTOR 0 \u00B7 ${shard0Count}`,
      color: 'rgba(0, 229, 255, 0.85)',
      dotColor: '#00e5ff',
      finalX: '30vw',
      finalY: '-22vh',
      index: 2,
    },
    {
      id: 'shard1',
      text: `SECTOR 1 \u00B7 ${shard1Count}`,
      color: 'rgba(35, 196, 131, 0.85)',
      dotColor: '#23c483',
      finalX: '36vw',
      finalY: '2vh',
      index: 3,
    },
    {
      id: 'shard2',
      text: `SECTOR 2 \u00B7 ${shard2Count}`,
      color: 'rgba(124, 58, 237, 0.85)',
      dotColor: '#7c3aed',
      finalX: '30vw',
      finalY: '24vh',
      index: 4,
    },
    {
      id: 'crossshard',
      text: `CROSS-SECTOR LINKS: ${crossShardPaths}`,
      color: 'rgba(130, 160, 230, 0.75)',
      dotColor: 'rgba(130, 160, 230, 0.7)',
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
        return (
          <div
            key={label.id}
            className="hud-fanout-label"
            style={{
              position: 'absolute',
              // Start at center, animate to final position
              transform: show
                ? `translate(${label.finalX}, ${label.finalY})`
                : 'translate(0px, 0px)',
              opacity: show ? 1 : 0,
              transition: `transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              willChange: 'transform, opacity',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: label.color,
                textShadow: `0 0 10px ${label.dotColor}44, 0 0 20px ${label.dotColor}22`,
                whiteSpace: 'nowrap',
              }}
            >
              {/* Colored dot/pip */}
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
              <span>{label.text}</span>
            </div>
            {label.subtext && (
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '9px',
                  opacity: 0.55,
                  letterSpacing: '0.06em',
                  color: label.color,
                  textShadow: `0 0 8px ${label.dotColor}22`,
                  paddingLeft: '11px',
                }}
              >
                {label.subtext}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
