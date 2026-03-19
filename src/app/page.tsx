'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  GameState,
  GameSession,
  BlockData,
  ConstellationData,
  TapResponse,
  ResolveResponse,
} from '@/lib/types';
import { BON_CONFIG } from '@/lib/types';
import { generateConstellation } from '@/three/systems/ConstellationGenerator';
import { BlockSync } from '@/three/systems/BlockSync';
import GateOverlay from '@/components/GateOverlay';
import HUD from '@/components/HUD';
import SavePanel from '@/components/SavePanel';
import TechHUD from '@/components/TechHUD';
import LoadingScreen from '@/components/LoadingScreen';
import GameInstructions from '@/components/GameInstructions';
import { audioManager } from '@/lib/audio';

// Three.js Experience component — must be loaded client-side only
const Experience = dynamic(() => import('@/components/Experience'), {
  ssr: false,
  loading: () => null,
});

// Throttle helper: returns true if enough time has passed since last allowed call
function createThrottle(ratePerSecond: number) {
  const minInterval = 1000 / ratePerSecond;
  let lastTime = 0;
  return (): boolean => {
    const now = performance.now();
    if (now - lastTime >= minInterval) {
      lastTime = now;
      return true;
    }
    return false;
  };
}

export default function HomePage() {
  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const [gameState, setGameState] = useState<GameState>('loading');
  const [session, setSession] = useState<GameSession | null>(null);
  const [accuracy, setAccuracy] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [constellationData, setConstellationData] = useState<ConstellationData | null>(
    null,
  );
  const [blockData, setBlockData] = useState<BlockData | null>(null);
  const [experienceReady, setExperienceReady] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // Refs for mutable state accessible in callbacks
  const blockSyncRef = useRef<BlockSync | null>(null);
  const experienceRef = useRef<{
    pulse: () => void;
    registerTap: (accuracy: number) => void;
    triggerWarp: () => void;
    showConstellation: (data: ConstellationData) => void;
    exportPNG: () => void;
  } | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const sessionRef = useRef<GameSession | null>(null);
  const tapThrottleRef = useRef(createThrottle(BON_CONFIG.rateLimit));
  const roundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accuracySamples = useRef<number[]>([]);
  // Timestamp when rhythm mode started — used for 1s grace period
  const rhythmStartedAtRef = useRef<number>(0);

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // ---------------------------------------------------------------
  // Show instructions briefly when rhythm starts
  // ---------------------------------------------------------------
  useEffect(() => {
    if (gameState === 'rhythm') {
      setShowInstructions(true);
      const timer = setTimeout(() => setShowInstructions(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowInstructions(false);
    }
  }, [gameState]);

  // ---------------------------------------------------------------
  // Initialize BlockSync + transition from loading to gate
  // ---------------------------------------------------------------
  useEffect(() => {
    const blockSync = new BlockSync();
    blockSyncRef.current = blockSync;

    const init = async () => {
      await blockSync.initialize();
      setCurrentBlock(blockSync.getCurrentBlock());

      // Set up beat callback
      blockSync.setOnBeat(() => {
        setCurrentBlock(blockSync.getCurrentBlock());

        // During rhythm state, pulse the experience
        if (gameStateRef.current === 'rhythm' && experienceRef.current) {
          experienceRef.current.pulse();
        }
      });
    };

    init();

    return () => {
      blockSync.stop();
      audioManager.stopAll();
    };
  }, []);

  // Transition from loading to gate once experience is ready
  useEffect(() => {
    if (experienceReady && gameState === 'loading') {
      // Small delay so the loading screen fade looks smooth
      const timer = setTimeout(() => setGameState('gate'), 300);
      return () => clearTimeout(timer);
    }
  }, [experienceReady, gameState]);

  // ---------------------------------------------------------------
  // Experience ready callback
  // ---------------------------------------------------------------
  const handleExperienceReady = useCallback(
    (ref: typeof experienceRef.current) => {
      experienceRef.current = ref;
      setExperienceReady(true);
    },
    [],
  );

  // ---------------------------------------------------------------
  // Gate enter → start round
  // ---------------------------------------------------------------
  const handleEnter = useCallback(async () => {
    // Init audio on user gesture (unlocks browser autoplay) and start intro music
    audioManager.init();
    audioManager.playIntro();

    setGameState('warp');

    // Crossfade from intro to pulse music over the warp duration
    audioManager.crossfadeToPulse(3500);

    // Trigger warp animation
    if (experienceRef.current) {
      experienceRef.current.triggerWarp();
    }

    try {
      // Start API session
      const response = await fetch('/api/start-round', { method: 'POST' });
      if (response.ok) {
        const sessionData = await response.json();
        setSession({
          sessionId: sessionData.sessionId,
          txHashes: [],
          tapCount: 0,
          accuracy: 0,
          startedAt: Date.now(),
        });
      } else {
        // If API fails, create a local session
        setSession({
          sessionId: `local-${Date.now()}`,
          txHashes: [],
          tapCount: 0,
          accuracy: 0,
          startedAt: Date.now(),
        });
      }
    } catch {
      // Offline mode
      setSession({
        sessionId: `local-${Date.now()}`,
        txHashes: [],
        tapCount: 0,
        accuracy: 0,
        startedAt: Date.now(),
      });
    }

    // After warp duration, start rhythm
    setTimeout(() => {
      setGameState('rhythm');
      setTapCount(0);
      setTxCount(0);
      setAccuracy(0);
      accuracySamples.current = [];
      // Record when rhythm started for the 1s grace period
      rhythmStartedAtRef.current = performance.now();

      // Set round timer — starts NOW after warp completes, full 30s
      roundTimerRef.current = setTimeout(() => {
        endRound();
      }, BON_CONFIG.roundDuration);
    }, 3000); // 3s warp animation
  }, []);

  // ---------------------------------------------------------------
  // Tap handler (rhythm phase)
  // ---------------------------------------------------------------
  const handleTap = useCallback(async () => {
    // Strict rhythm-only check
    if (gameStateRef.current !== 'rhythm') return;

    // Grace period: ignore taps for the first 1 second after entering rhythm
    // This prevents the gate-enter click from being interpreted as a tap
    if (performance.now() - rhythmStartedAtRef.current < 1000) return;

    if (!tapThrottleRef.current()) return;

    const currentTapCount = (sessionRef.current?.tapCount ?? 0) + 1;
    if (currentTapCount > BON_CONFIG.maxTaps) {
      endRound();
      return;
    }

    // Calculate tap accuracy based on proximity to beat
    const blockSync = blockSyncRef.current;
    let tapAccuracy = 50; // default if no sync data
    if (blockSync) {
      const interval = blockSync.getInterval();
      const now = performance.now();
      // How close are we to the nearest beat boundary?
      const phase = now % interval;
      const distFromBeat = Math.min(phase, interval - phase);
      // Accuracy: 100% at beat, 0% at mid-interval
      tapAccuracy = Math.round(100 * (1 - distFromBeat / (interval / 2)));
      tapAccuracy = Math.max(0, Math.min(100, tapAccuracy));
    }

    // Update local state
    accuracySamples.current.push(tapAccuracy);
    const avgAccuracy =
      accuracySamples.current.reduce((a, b) => a + b, 0) /
      accuracySamples.current.length;

    setTapCount(currentTapCount);
    setAccuracy(Math.round(avgAccuracy));

    // Register visual feedback
    if (experienceRef.current) {
      experienceRef.current.registerTap(tapAccuracy);
    }

    // Update session
    setSession((prev) =>
      prev
        ? {
            ...prev,
            tapCount: currentTapCount,
            accuracy: Math.round(avgAccuracy),
          }
        : prev,
    );

    // Send tap to API (fire and forget, don't block the UI)
    try {
      const response = await fetch('/api/tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionRef.current?.sessionId,
          accuracy: tapAccuracy,
        }),
      });
      if (response.ok) {
        const data: TapResponse = await response.json();
        if (data.txHash) {
          setTxCount((prev) => prev + 1);
          setSession((prev) =>
            prev
              ? { ...prev, txHashes: [...prev.txHashes, data.txHash!] }
              : prev,
          );
        }
      }
    } catch {
      // API error — just skip this tap's transaction
    }
  }, []);

  // ---------------------------------------------------------------
  // End round → resolve
  // ---------------------------------------------------------------
  const endRound = useCallback(async () => {
    if (gameStateRef.current !== 'rhythm') return;

    // Clear round timer
    if (roundTimerRef.current) {
      clearTimeout(roundTimerRef.current);
      roundTimerRef.current = null;
    }

    setGameState('resolving');

    const currentSession = sessionRef.current;
    const lastTxHash =
      currentSession?.txHashes[currentSession.txHashes.length - 1] ?? '';

    let blockNonce = blockSyncRef.current?.getCurrentBlock() ?? 0;

    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession?.sessionId,
          txHash: lastTxHash,
        }),
      });

      if (response.ok) {
        const data: ResolveResponse = await response.json();
        blockNonce = data.blockNonce;
      }
    } catch {
      // Use current block from BlockSync as fallback
    }

    // Fetch block data for constellation generation
    try {
      const blockResponse = await fetch(`/api/block/${blockNonce}`);
      if (blockResponse.ok) {
        const fetchedBlockData: BlockData = await blockResponse.json();
        setBlockData(fetchedBlockData);

        // Generate constellation
        const constellation = generateConstellation(fetchedBlockData);
        setConstellationData(constellation);

        // Reveal — duck music for the dramatic moment
        audioManager.duckForReveal();
        setGameState('reveal');

        if (experienceRef.current) {
          experienceRef.current.showConstellation(constellation);
        }

        // After reveal animation, show save panel and restore music volume
        setTimeout(() => {
          audioManager.restoreAfterReveal();
          setGameState('save');
        }, 4000); // 4s reveal animation
      } else {
        // Fallback: generate with minimal block data
        handleResolveFallback(blockNonce);
      }
    } catch {
      handleResolveFallback(blockNonce);
    }
  }, []);

  const handleResolveFallback = useCallback((blockNonce: number) => {
    const fallbackBlock: BlockData = {
      nonce: blockNonce || Math.floor(Date.now() / 600),
      round: 0,
      hash: Date.now().toString(16).padStart(64, '0'),
      proposer: 'a'.repeat(96),
      timestamp: Math.floor(Date.now() / 1000),
      txCount: 0,
      gasConsumed: 0,
      miniBlocks: [],
      validators: [
        { blsKey: 'b'.repeat(96), shard: 0 },
        { blsKey: 'c'.repeat(96), shard: 1 },
        { blsKey: 'd'.repeat(96), shard: 2 },
      ],
    };

    setBlockData(fallbackBlock);
    const constellation = generateConstellation(fallbackBlock);
    setConstellationData(constellation);

    audioManager.duckForReveal();
    setGameState('reveal');

    if (experienceRef.current) {
      experienceRef.current.showConstellation(constellation);
    }

    setTimeout(() => {
      audioManager.restoreAfterReveal();
      setGameState('save');
    }, 4000);
  }, []);

  // ---------------------------------------------------------------
  // Export and Play Again
  // ---------------------------------------------------------------
  const handleExportPNG = useCallback(() => {
    if (experienceRef.current) {
      experienceRef.current.exportPNG();
    }
  }, []);

  const handlePlayAgain = useCallback(() => {
    audioManager.reset();
    audioManager.playIntro();
    setGameState('gate');
    setSession(null);
    setAccuracy(0);
    setTapCount(0);
    setTxCount(0);
    setConstellationData(null);
    setBlockData(null);
    accuracySamples.current = [];
    rhythmStartedAtRef.current = 0;
  }, []);

  // ---------------------------------------------------------------
  // Global tap/click handler during rhythm phase
  // ---------------------------------------------------------------
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // Don't capture taps on UI panels
      const target = e.target as HTMLElement;
      if (target.closest('.save-panel')) return;
      if (target.closest('.gate-overlay')) return;
      if (target.closest('.tech-hud')) return;

      if (gameStateRef.current === 'rhythm') {
        handleTap();
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [handleTap]);

  // Keyboard support (spacebar tap)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && gameStateRef.current === 'rhythm') {
        e.preventDefault();
        handleTap();
      }
      if (
        (e.code === 'Enter' || e.code === 'Space') &&
        gameStateRef.current === 'gate'
      ) {
        e.preventDefault();
        handleEnter();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTap, handleEnter]);

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* Three.js canvas — always rendered behind everything */}
      <div className="canvas-container">
        <Experience onReady={handleExperienceReady} />
      </div>

      {/* Loading screen */}
      <LoadingScreen visible={gameState === 'loading'} />

      {/* Gate overlay */}
      <GateOverlay
        visible={gameState === 'gate'}
        onEnter={handleEnter}
      />

      {/* HUD — visible during rhythm, resolving, reveal */}
      <HUD
        accuracy={accuracy}
        tapCount={tapCount}
        txCount={txCount}
        blockNumber={currentBlock}
        visible={
          gameState === 'rhythm' ||
          gameState === 'resolving' ||
          gameState === 'reveal'
        }
      />

      {/* Game instructions — brief overlay at rhythm start */}
      <GameInstructions visible={showInstructions} />

      {/* Save panel — visible after constellation reveal */}
      {blockData && constellationData && (
        <SavePanel
          blockData={blockData}
          constellationData={constellationData}
          onExportPNG={handleExportPNG}
          onPlayAgain={handlePlayAgain}
          visible={gameState === 'save'}
        />
      )}

      {/* Tech HUD — constellation DNA annotations, visible during save state */}
      <TechHUD
        blockData={blockData}
        constellationData={constellationData}
        visible={gameState === 'save'}
      />

      {/* Resolving indicator */}
      {gameState === 'resolving' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <p
            className="animate-pulse-soft"
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              opacity: 0.6,
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Mapping your constellation...
          </p>
        </div>
      )}
    </div>
  );
}
