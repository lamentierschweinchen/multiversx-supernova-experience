'use client';

import { useEffect, useRef, useState } from 'react';

interface SaveGuideProps {
  /** Mount the component when the save state begins. The 4s internal delay
   *  lets the constellation explainer finish before the star starts moving. */
  visible: boolean;
  /** Fired once the star reaches the save bar. Use it to highlight the Save
   *  button. */
  onArrive?: () => void;
}

/**
 * SaveGuide
 *
 * A small glowing star dot that flies from viewport center, arcing slightly
 * right, and landing on the Save button (bottom-left of the save bar) after
 * the constellation explainer has had 4 seconds to finish.
 *
 * Lifecycle:
 *   0 s  — component mounts (visible = true), dot hidden
 *   4 s  — dot appears at viewport center, animation begins
 *   6.5 s— dot arrives at save bar (4s + 2.5s travel), onArrive fires, pulse flash plays
 *   7 s  — dot fades out completely
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

    // 4 s + 2500 ms travel = 6500 ms: star arrives at Save button
    const t2 = setTimeout(() => {
      setPhase('arrived');
      onArriveRef.current?.();
    }, 6500);

    // 6500 ms + 500 ms flash = 7000 ms: fade out
    const t3 = setTimeout(() => {
      setPhase('gone');
    }, 7000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [visible]);

  if (!visible || phase === 'hidden' || phase === 'gone') return null;

  /*
   * The save bar is fixed at the bottom of the screen. The Save button is the
   * first button on the right-hand group, which sits roughly at 70% from the
   * left edge of the viewport. We arc from center (50%) toward that point.
   *
   * The dot is anchored at left:50%, top:50% (viewport center) via CSS.
   * The keyframe animation translates it to its destination:
   *   - X: from 0 → ~+20vw (arcing right toward the Save button area)
   *   - Y: from 0 → ~+50vh + 22px (bottom of viewport, save bar height offset)
   *
   * The arc goes slightly right then curves to land on the Save button
   * (approximately right: clamp(1rem,3vw,2rem) + ~85px from right edge,
   * which works out to roughly right-of-center).
   */

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
          5% {
            opacity: 1;
          }
          /* Arc outward to the right */
          30% {
            transform: translate(calc(-50% + 8vw), calc(-50% + 20vh));
          }
          60% {
            transform: translate(calc(-50% + 16vw), calc(-50% + 38vh));
          }
          85% {
            transform: translate(calc(-50% + 20vw), calc(-50% + 47vh));
            opacity: 1;
          }
          100% {
            /* Land on the Save button area — right side of center, bottom bar */
            transform: translate(calc(-50% + 20vw), calc(-50% + 50vh + 22px));
            opacity: 0.95;
          }
        }

        @keyframes save-guide-arrived-pulse {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          35%  { transform: translate(-50%, -50%) scale(3);   opacity: 0.7; }
          100% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
        }

        @keyframes save-guide-trail {
          0%   { opacity: 0.6; }
          100% { opacity: 0; }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          /*
           * Anchor at viewport center. The keyframe animation translates the
           * dot down and to the right so it lands on the Save button.
           */
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          pointerEvents: 'none',
          zIndex: 60,
        }}
      >
        {/* The star dot itself — 12px, brighter glow */}
        <div
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: [
              '0 0 6px 3px rgba(255, 255, 255, 0.95)',
              '0 0 14px 6px rgba(80, 230, 255, 0.85)',
              '0 0 28px 12px rgba(40, 190, 255, 0.5)',
            ].join(', '),
            animation:
              phase === 'flying'
                ? 'save-guide-fly 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                : phase === 'arrived'
                  ? 'save-guide-arrived-pulse 0.5s ease-out forwards'
                  : undefined,
          }}
        />

        {/* Trailing copies — more visible comet-tail effect */}
        {phase === 'flying' && (
          <>
            {[
              { delay: '0.07s', opacity: 0.65, scale: 0.72 },
              { delay: '0.15s', opacity: 0.45, scale: 0.52 },
              { delay: '0.25s', opacity: 0.28, scale: 0.38 },
            ].map(({ delay, opacity, scale }, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: `${12 * scale}px`,
                  height: `${12 * scale}px`,
                  borderRadius: '50%',
                  background: '#ffffff',
                  boxShadow: `0 0 ${8 * scale}px ${4 * scale}px rgba(80, 230, 255, ${opacity})`,
                  opacity,
                  animation: `save-guide-fly 2.5s cubic-bezier(0.4, 0, 0.2, 1) ${delay} forwards`,
                }}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
