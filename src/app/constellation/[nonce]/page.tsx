'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { BlockData, ConstellationData } from '@/lib/types';
import { generateConstellation } from '@/three/systems/ConstellationGenerator';
import SavePanel from '@/components/SavePanel';

const Experience = dynamic(() => import('@/components/Experience'), {
  ssr: false,
  loading: () => null,
});

type ExperienceRef = {
  pulse: () => void;
  registerTap: (accuracy: number) => void;
  triggerWarp: () => void;
  showConstellation: (data: ConstellationData) => void;
  exportPNG: () => void;
};

export default function ConstellationPage() {
  const params = useParams();
  const nonce = typeof params.nonce === 'string' ? parseInt(params.nonce, 10) : 0;

  const [blockData, setBlockData] = useState<BlockData | null>(null);
  const [constellationData, setConstellationData] = useState<ConstellationData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const experienceRef = useRef<ExperienceRef | null>(null);
  const shownRef = useRef(false);

  // Fetch block data
  useEffect(() => {
    if (!nonce || isNaN(nonce)) {
      setError('Invalid block nonce');
      setLoading(false);
      return;
    }

    const fetchBlock = async () => {
      try {
        const response = await fetch(`/api/block/${nonce}`);
        if (!response.ok) {
          setError(`Block #${nonce} not found`);
          setLoading(false);
          return;
        }
        const data: BlockData = await response.json();
        setBlockData(data);

        const constellation = generateConstellation(data);
        setConstellationData(constellation);
        setLoading(false);
      } catch {
        setError('Failed to load block data');
        setLoading(false);
      }
    };

    fetchBlock();
  }, [nonce]);

  // Show constellation once experience is ready and data is loaded
  useEffect(() => {
    if (
      constellationData &&
      experienceRef.current &&
      !shownRef.current
    ) {
      shownRef.current = true;
      // Delay slightly so Three.js scene is initialized
      setTimeout(() => {
        experienceRef.current?.showConstellation(constellationData);
      }, 800);
    }
  }, [constellationData]);

  const handleExperienceReady = useCallback(
    (ref: ExperienceRef) => {
      experienceRef.current = ref;
      // If data already loaded, show constellation
      if (constellationData && !shownRef.current) {
        shownRef.current = true;
        setTimeout(() => {
          ref.showConstellation(constellationData);
        }, 800);
      }
    },
    [constellationData],
  );

  const handleExportPNG = useCallback(() => {
    experienceRef.current?.exportPNG();
  }, []);

  const handlePlayAgain = useCallback(() => {
    window.location.href = '/';
  }, []);

  if (error) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          fontFamily: 'var(--font-mono, monospace)',
          gap: '1.5rem',
        }}
      >
        <p style={{ opacity: 0.6, fontSize: '1.125rem' }}>{error}</p>
        <a
          href="/"
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(0, 229, 255, 0.5)',
            background: 'rgba(0, 229, 255, 0.1)',
            color: '#00e5ff',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Play the game
        </a>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* Three.js canvas */}
      <div className="canvas-container">
        <Experience onReady={handleExperienceReady} />
      </div>

      {/* Loading */}
      {loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
          }}
        >
          <p
            className="animate-pulse-loading"
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '1rem',
              opacity: 0.5,
              letterSpacing: '0.1em',
            }}
          >
            Loading constellation...
          </p>
        </div>
      )}

      {/* Block info header */}
      {!loading && blockData && (
        <div
          style={{
            position: 'fixed',
            top: 'clamp(1rem, 3vh, 1.5rem)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <h1
            className="gradient-text font-display"
            style={{
              fontSize: 'clamp(1.25rem, 3vw, 2rem)',
              fontWeight: 700,
              letterSpacing: '0.03em',
            }}
          >
            Block #{blockData.nonce.toLocaleString('en-US')}
          </h1>
          <p
            style={{
              marginTop: '0.25rem',
              fontSize: '0.75rem',
              opacity: 0.4,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {constellationData?.stars.length ?? 0} validators &middot;{' '}
            {blockData.txCount} txs
          </p>
        </div>
      )}

      {/* Save panel */}
      {blockData && constellationData && !loading && (
        <SavePanel
          blockData={blockData}
          constellationData={constellationData}
          onExportPNG={handleExportPNG}
          onPlayAgain={handlePlayAgain}
          visible={true}
        />
      )}

      {/* Play the game link */}
      {!loading && (
        <a
          href="/"
          style={{
            position: 'fixed',
            top: 'clamp(1rem, 3vh, 1.5rem)',
            right: 'clamp(1rem, 3vw, 1.5rem)',
            zIndex: 15,
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            color: 'rgba(255, 255, 255, 0.6)',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-mono, monospace)',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#00e5ff';
            e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          }}
        >
          Play the game &rarr;
        </a>
      )}
    </div>
  );
}
