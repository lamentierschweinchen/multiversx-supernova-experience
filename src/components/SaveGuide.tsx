'use client';

import { useEffect, useRef, useState } from 'react';

interface SaveGuideProps {
  /** Mount the component when the save state begins. The 4s internal delay
   *  lets the constellation explainer finish before the star starts moving. */
  visible: boolean;
  /** Fired once the star reaches the save bar. Use it to add a transient
   *  glow class to the bar's container. */
  onArrive?: () => void;
}

/**
 * SaveGuide
 *
 * A small glowing star dot that flies from viewport center down to the save
 * bar after the constellation explainer has had 4 seconds to finish.
 *
 * Lifecycle:
 *   0 s  — component mounts (visible = true), dot hidden
 *   4 s  — dot appears at viewport center, animation begins
 *   5.5 s— dot arrives at save bar, onArrive fires, pulse flash plays
 *   6 s  — dot fades out completely
 */
export default function SaveGuide({ visible, onArrive }: SaveGuideProps) {
  const [phase, setPhase] = useState<'hidden' | 'flying' | 'arrived' | 'gone'>('hidden');
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    if (!visible) {
      setPhase('hidden');
      return;
    }

    // 4 s: wait for explainer text to finish, then start the animation
    const t1 = setTimeout(() => {
      setPhase('flying');
    }, 4000);

    // 4 s + 1500 ms travel = 5500 ms: star arrives
    const t2 = setTimeout(() => {
      setPhase('arrived');
      onArriveRef.current?.();
    }, 5500);

    // 5500 ms + 500 ms flash = 6000 ms: fade out
    const t3 = setTimeout(() => {
      setPhase('gone');
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [visible]);

  if (!visible || phase === 'hidden' || phase === 'gone') return null;

  return (
    <>
      {/*
        Inject the keyframes once. We use a <style> tag here because Next.js
        App Router doesn't support CSS Modules with keyframes in JSX inline
        styles, and adding to globals.css would require a separate edit.
      */}
      <style>{`
        @keyframes save-guide-fly {
          0% {
            transform: translate(-50%, -50%);
            opacity: 0;
          }
          8% {
            opacity: 1;
          }
          /* Gentle sine-wave wobble on X while moving down */
          25% {
            transform: translate(calc(-50% + 18px), calc(-50% + 25vh));
          }
          50% {
            transform: translate(calc(-50% - 14px), calc(-50% + 50vh));
          }
          75% {
            transform: translate(calc(-50% + 8px), calc(-50% + 75vh));
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, calc(-50% + 50vh + 22px));
            opacity: 0.9;
          }
        }

        @keyframes save-guide-arrived-pulse {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          40%  { transform: translate(-50%, -50%) scale(2.8); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
        }

        @keyframes save-guide-trail {
          0%   { opacity: 0.35; }
          100% { opacity: 0; }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          /*
           * Anchor at viewport center horizontally, top half vertically.
           * The keyframe animation translates downward from here to the
           * bottom-center where the save bar lives (approx 50vh + ~22px).
           */
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          pointerEvents: 'none',
          zIndex: 60,
        }}
      >
        {/* The star dot itself */}
        <div
          style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: [
              '0 0 4px 2px rgba(255, 255, 255, 0.9)',
              '0 0 10px 4px rgba(120, 240, 255, 0.7)',
              '0 0 20px 8px rgba(80, 200, 255, 0.4)',
            ].join(', '),
            animation:
              phase === 'flying'
                ? 'save-guide-fly 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                : phase === 'arrived'
                  ? 'save-guide-arrived-pulse 0.5s ease-out forwards'
                  : undefined,
          }}
        />

        {/* Trailing copies — offset in time to create a comet-tail effect */}
        {phase === 'flying' && (
          <>
            {[
              { delay: '0.06s', opacity: 0.5, scale: 0.7 },
              { delay: '0.12s', opacity: 0.3, scale: 0.5 },
              { delay: '0.20s', opacity: 0.15, scale: 0.35 },
            ].map(({ delay, opacity, scale }, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: `${8 * scale}px`,
                  height: `${8 * scale}px`,
                  borderRadius: '50%',
                  background: '#ffffff',
                  boxShadow: `0 0 ${6 * scale}px ${3 * scale}px rgba(120, 240, 255, ${opacity})`,
                  opacity,
                  animation: `save-guide-fly 1.5s cubic-bezier(0.4, 0, 0.2, 1) ${delay} forwards`,
                }}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
