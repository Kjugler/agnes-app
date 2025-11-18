"use client";

import { useEffect, useState } from "react";

type ScoreCaptionRotatorProps = {
  lines: string[];
  durationMs?: number; // optional override
};

export function ScoreCaptionRotator({
  lines,
  durationMs = 6500, // ~6.5 seconds per line
}: ScoreCaptionRotatorProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!lines || lines.length <= 1) return;

    const id = setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        return next >= lines.length ? 0 : next;
      });
    }, durationMs);

    return () => clearInterval(id);
  }, [lines, durationMs]);

  if (!lines || lines.length === 0) {
    return null;
  }

  const currentLine = lines[index];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      marginTop: '1rem',
      marginBottom: '1rem',
    }}>
      <p
        style={{
          maxWidth: '48rem',
          textAlign: 'center',
          color: '#000000',
          fontWeight: 800,
          fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
          background: 'rgba(255, 255, 255, 0.8)',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          lineHeight: 1.4,
        }}
      >
        {currentLine}
      </p>
    </div>
  );
}

