import { useEffect, useState } from 'react';

type ScorePayload = {
  totalPoints?: number;
  rabbitTarget?: number | null;
};

export function useScore() {
  const [totalPoints, setTotalPoints] = useState(0);
  const [rabbitTarget, setRabbitTarget] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/me/score', { cache: 'no-store' });
        if (!res.ok) return;
        const data: ScorePayload = await res.json().catch(() => ({}));
        if (!mounted) return;
        setTotalPoints(data.totalPoints ?? 0);
        setRabbitTarget(data.rabbitTarget ?? null);
      } catch {
        /* ignore errors */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { totalPoints, rabbitTarget };
}
