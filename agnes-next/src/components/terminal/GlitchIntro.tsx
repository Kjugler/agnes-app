'use client';

import { useEffect, useState } from 'react';

const FULL_TEXT = 'THE AGNES PROTOCOL';

function getGlitchedText(text: string, frame: number): string {
  if (frame % 3 === 0) {
    const chars = text.split('');
    const indices = [5, 11, 16];
    const blockIndices = indices.slice(0, Math.floor(Math.random() * 2) + 2);
    blockIndices.forEach((idx) => {
      if (idx < chars.length) {
        chars[idx] = '▮';
      }
    });
    return chars.join('');
  }
  return text;
}

interface GlitchIntroProps {
  onComplete: () => void;
  skipIfSeen?: boolean;
  localStorageKey?: string;
  /** Stack above app chrome (e.g. stress banner). Default 9999. */
  zIndex?: number;
}

export default function GlitchIntro({
  onComplete,
  skipIfSeen = false,
  localStorageKey,
  zIndex = 9999,
}: GlitchIntroProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isInterference, setIsInterference] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [flashSync, setFlashSync] = useState(false);
  const [glitchFrame, setGlitchFrame] = useState(0);
  const [shouldSkip, setShouldSkip] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (skipIfSeen && localStorageKey) {
      const seen = localStorage.getItem(localStorageKey);
      if (seen === 'true') {
        setShouldSkip(true);
        setTimeout(() => onComplete(), 0);
        return;
      }
    }
  }, [skipIfSeen, localStorageKey, onComplete]);

  useEffect(() => {
    if (shouldSkip) return;

    if (visibleCount < FULL_TEXT.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, 60);
      return () => clearTimeout(timer);
    }

    if (visibleCount === FULL_TEXT.length && !isInterference && !isComplete) {
      const holdTimer = setTimeout(() => {
        setIsInterference(true);

        const flashTimer = setTimeout(() => {
          setFlashSync(true);
          setTimeout(() => setFlashSync(false), 80);
        }, 840);

        const frameInterval = setInterval(() => {
          setGlitchFrame((prev) => prev + 1);
        }, 200);

        const glitchTimer = setTimeout(() => {
          clearInterval(frameInterval);
          setIsInterference(false);
          setIsComplete(true);

          if (skipIfSeen && localStorageKey && typeof window !== 'undefined') {
            localStorage.setItem(localStorageKey, 'true');
          }

          setTimeout(() => {
            onComplete();
          }, 120);
        }, 1400);

        return () => {
          clearTimeout(flashTimer);
          clearTimeout(glitchTimer);
          clearInterval(frameInterval);
        };
      }, 400);

      return () => clearTimeout(holdTimer);
    }
  }, [visibleCount, isInterference, isComplete, shouldSkip, skipIfSeen, localStorageKey, onComplete]);

  if (shouldSkip) {
    return null;
  }

  const displayText = FULL_TEXT.slice(0, visibleCount);
  const glitchedText = isInterference
    ? getGlitchedText(displayText, glitchFrame)
    : displayText;
  const showCursor =
    visibleCount === FULL_TEXT.length && !isInterference && !isComplete;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        fontFamily: 'monospace',
        fontSize: 'clamp(2rem, 8vw, 6rem)',
        fontWeight: 700,
        color: '#ff0000',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        opacity: isComplete ? 0 : 1,
        transition: isComplete ? 'opacity 120ms ease-out' : 'none',
      }}
    >
      {flashSync && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#fff',
            opacity: 0.9,
            zIndex: 10000,
          }}
        />
      )}

      <div
        style={{
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {glitchedText}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: '0.1em',
              height: '1em',
              backgroundColor: '#ff0000',
              marginLeft: '0.1em',
              animation: 'blink 1s infinite',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
