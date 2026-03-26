'use client';

import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [text, setText] = useState('');
  const fullText = 'AGNES PROTOCOL';

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setText(fullText.substring(0, index));
      index++;

      if (index > fullText.length) {
        clearInterval(interval);
        setTimeout(() => {
          onComplete();
        }, 1000);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        className="mb-4 text-6xl font-mono font-bold tracking-wider"
        style={{
          marginBottom: '1rem',
          fontSize: '3.75rem',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
        }}
      >
        <span
          className="text-red-600"
          style={{ color: '#dc2626' }}
        >
          {text}
        </span>
        <span
          className="text-red-600 animate-blink ml-1"
          style={{ color: '#dc2626', marginLeft: '0.25rem' }}
        >
          |
        </span>
      </div>

      <div
        className="w-[200px] h-[2px] bg-gray-800 rounded relative overflow-hidden"
        style={{
          width: '200px',
          height: '2px',
          backgroundColor: '#1f2937',
          borderRadius: '4px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          className="w-[40%] h-full bg-red-500 shadow-[0_0_15px_#3b82f6] animate-loading-bar"
          style={{
            width: '40%',
            height: '100%',
            backgroundColor: '#ef4444',
            boxShadow: '0 0 15px #3b82f6',
          }}
        />
      </div>
    </div>
  );
}
