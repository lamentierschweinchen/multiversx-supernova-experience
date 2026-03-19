'use client';

import { useState } from 'react';
import type { BlockData, ConstellationData } from '@/lib/types';

interface TechHUDProps {
  blockData: BlockData | null;
  constellationData: ConstellationData | null;
  visible: boolean;
}

function truncateHex(hex: string, chars: number = 10): string {
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

export default function TechHUD({
  blockData,
  constellationData,
  visible,
}: TechHUDProps) {
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;

  const shardCounts = blockData ? getValidatorCountsByShard(blockData) : new Map();
  const crossShardPaths = blockData ? getCrossShardPaths(blockData) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'clamp(1rem, 3vw, 1.5rem)',
        right: 'clamp(1rem, 3vw, 1.5rem)',
        zIndex: 25,
        pointerEvents: 'auto',
      }}
    >
      {!expanded ? (
        // Collapsed: small DNA button
        <button
          onClick={() => setExpanded(true)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(124, 58, 237, 0.4)',
            background: 'rgba(10, 10, 20, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: 'rgba(167, 139, 250, 0.8)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-geist-mono, monospace)',
            letterSpacing: '0.05em',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.7)';
            e.currentTarget.style.color = 'rgba(167, 139, 250, 1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.4)';
            e.currentTarget.style.color = 'rgba(167, 139, 250, 0.8)';
          }}
        >
          &#9670; DNA
        </button>
      ) : (
        // Expanded: dark translucent panel
        <div
          style={{
            width: 'clamp(16rem, 40vw, 22rem)',
            background: 'rgba(10, 10, 20, 0.88)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            borderRadius: '0.75rem',
            padding: 'clamp(0.75rem, 2vw, 1.25rem)',
            color: 'rgba(255, 255, 255, 0.75)',
            fontSize: '0.6875rem',
            lineHeight: 1.7,
          }}
        >
          {/* Header with close button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(167, 139, 250, 0.9)',
              }}
            >
              &#9670; Constellation DNA
            </span>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '0 0.25rem',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          {blockData ? (
            <div className="font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <Row label="Block Nonce" value={blockData.nonce.toLocaleString('en-US')} />
              <Row label="Block Hash" value={truncateHex(blockData.hash, 10)} />
              <Row label="Proposer BLS" value={truncateHex(blockData.proposer, 8)} />

              {/* Validator count per shard */}
              <div style={{ marginTop: '0.25rem' }}>
                <span style={{ opacity: 0.5 }}>Validators/Shard: </span>
                <span>
                  {Array.from(shardCounts.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([shard, count]) => {
                      const label = shard === 4294967295 ? 'Meta' : `Shard ${shard}`;
                      return `${label}: ${count}`;
                    })
                    .join(' \u00B7 ')}
                </span>
              </div>

              <Row label="Cross-Shard Paths" value={crossShardPaths.toString()} />
              <Row label="Gas Consumed" value={formatGas(blockData.gasConsumed)} />
              <Row label="Transactions" value={blockData.txCount.toLocaleString('en-US')} />

              {constellationData && (
                <Row
                  label="Constellation Seed"
                  value={constellationData.blockNonce.toString()}
                />
              )}

              <div
                style={{
                  marginTop: '0.5rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid rgba(124, 58, 237, 0.15)',
                  opacity: 0.4,
                  fontSize: '0.625rem',
                  fontStyle: 'italic',
                }}
              >
                This data uniquely determines the visual pattern
              </div>
            </div>
          ) : (
            <div className="font-mono" style={{ opacity: 0.4 }}>
              No block data available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Simple label: value row */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ opacity: 0.5 }}>{label}: </span>
      <span>{value}</span>
    </div>
  );
}
