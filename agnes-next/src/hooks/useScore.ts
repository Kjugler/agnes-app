import { useCallback, useEffect, useRef, useState } from 'react';

type ScorePayload = {
  totalPoints?: number;
  rabbitTarget?: number | null;
};

export function useScore() {
  const [totalPoints, setTotalPoints] = useState(0);
  const [rabbitTarget, setRabbitTarget] = useState<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/score', { cache: 'no-store' });
      if (!res.ok) return;
      const data: ScorePayload = await res.json().catch(() => ({}));
      if (!isMounted.current) return;
      setTotalPoints(data.totalPoints ?? 0);
      setRabbitTarget(data.rabbitTarget ?? null);
    } catch {
      /* ignore errors */
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
  }, [load]);

  return { totalPoints, rabbitTarget, refresh: load };
}
