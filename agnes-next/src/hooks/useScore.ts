import { useCallback, useEffect, useRef, useState } from 'react';

type ScorePayload = {
  points?: number;
  rabbitTarget?: number | null;
  rabbitSeq?: number | null;
  nextRankThreshold?: number | null;
};

export function useScore() {
  const [totalPoints, setTotalPoints] = useState(0);
  const [rabbitTarget, setRabbitTarget] = useState<number | null>(null);
  const [rabbitSeq, setRabbitSeq] = useState<number | null>(null);
  const [nextRankThreshold, setNextRankThreshold] = useState<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const apply = useCallback((data: ScorePayload) => {
    if (!isMounted.current) return;
    setTotalPoints(data.points ?? 0);
    setRabbitTarget(data.rabbitTarget ?? null);
    setRabbitSeq(data.rabbitSeq ?? null);
    setNextRankThreshold(data.nextRankThreshold ?? null);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/rabbit/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data: ScorePayload = await res.json().catch(() => ({}));
      apply(data);
    } catch {
      /* ignore errors */
    }
  }, [apply]);

  useEffect(() => {
    isMounted.current = true;
    load();
  }, [load]);

  return { totalPoints, rabbitTarget, rabbitSeq, nextRankThreshold, refresh: load, apply };
}
