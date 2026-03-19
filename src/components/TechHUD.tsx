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

interface Annotation {
  id: string;
  label: string;
  sublabel?: string;
  /** Position of the label (percentage of viewport) */
  labelX: number;
  labelY: number;
  /** Position the line points toward (percentage of viewport) */
  targetX: number;
  targetY: number;
  /** Line color */
  color: string;
  /** Text alignment */
  align: 'left' | 'right' | 'center';
}

export default function TechHUD({
  blockData,
  constellationData,
  visible,
}: TechHUDProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      // 1-second delay before showing annotations
      const timer = setTimeout(() => setShow(true), 1000);
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

  const annotations: Annotation[] = [
    {
      id: 'proposer',
      label: 'PROPOSER',
      sublabel: truncateHex(blockData.proposer, 8),
      labelX: 8,
      labelY: 12,
      targetX: 48,
      targetY: 45,
      color: 'rgba(255, 255, 255, 0.5)',
      align: 'left',
    },
    {
      id: 'shard0',
      label: `SHARD 0 \u00B7 ${shard0Count} VALIDATORS`,
      labelX: 88,
      labelY: 14,
      targetX: 62,
      targetY: 32,
      color: 'rgba(0, 229, 255, 0.5)',
      align: 'right',
    },
    {
      id: 'shard1',
      label: `SHARD 1 \u00B7 ${shard1Count} VALIDATORS`,
      labelX: 90,
      labelY: 48,
      targetX: 62,
      targetY: 52,
      color: 'rgba(35, 196, 131, 0.5)',
      align: 'right',
    },
    {
      id: 'shard2',
      label: `SHARD 2 \u00B7 ${shard2Count} VALIDATORS`,
      labelX: 86,
      labelY: 80,
      targetX: 58,
      targetY: 65,
      color: 'rgba(124, 58, 237, 0.5)',
      align: 'right',
    },
    {
      id: 'crossshard',
      label: `${crossShardPaths} CROSS-SHARD PATHS`,
      labelX: 10,
      labelY: 82,
      targetX: 48,
      targetY: 55,
      color: 'rgba(167, 139, 250, 0.4)',
      align: 'left',
    },
    {
      id: 'blockinfo',
      label: `BLOCK #${blockData.nonce.toLocaleString('en-US')} \u00B7 ${blockData.txCount} TXS \u00B7 ${formatGas(blockData.gasConsumed)} GAS`,
      labelX: 50,
      labelY: 92,
      targetX: 50,
      targetY: 50,
      color: 'rgba(255, 255, 255, 0.3)',
      align: 'center',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        pointerEvents: 'none',
        opacity: show ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      {/* SVG overlay for connector lines */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {annotations.map((a) => {
          // Don't draw a line for the bottom-center block info
          if (a.id === 'blockinfo') return null;
          return (
            <line
              key={a.id}
              x1={`${a.labelX}%`}
              y1={`${a.labelY}%`}
              x2={`${a.targetX}%`}
              y2={`${a.targetY}%`}
              stroke={a.color}
              strokeWidth="1"
              className="annotation-line-pulse"
            />
          );
        })}
      </svg>

      {/* Text labels */}
      {annotations.map((a) => (
        <div
          key={a.id}
          style={{
            position: 'absolute',
            left: `${a.labelX}%`,
            top: `${a.labelY}%`,
            transform:
              a.align === 'center'
                ? 'translate(-50%, -50%)'
                : a.align === 'right'
                  ? 'translate(-100%, -50%)'
                  : 'translate(0, -50%)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color: a.color.replace(/[\d.]+\)$/, '0.8)'),
            textShadow: `0 0 8px ${a.color}`,
            whiteSpace: 'nowrap',
            lineHeight: 1.5,
          }}
        >
          <div>{a.label}</div>
          {a.sublabel && (
            <div
              style={{
                fontSize: '9px',
                opacity: 0.6,
                letterSpacing: '0.06em',
                marginTop: '1px',
              }}
            >
              {a.sublabel}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
