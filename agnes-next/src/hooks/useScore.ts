import { useCallback, useEffect, useRef, useState } from 'react';

type ScorePayload = {
  points?: number;
  rabbitTarget?: number | null;
  rabbitSeq?: number | null;
  nextRankThreshold?: number | null;
};

export function useScore(email?: string | null) {
  const [totalPoints, setTotalPoints] = useState(0);
  const [rabbitTarget, setRabbitTarget] = useState<number | null>(null);
  const [rabbitSeq, setRabbitSeq] = useState<number | null>(null);
  const [nextRankThreshold, setNextRankThreshold] = useState<number | null>(null);
  const isMounted = useRef(true);
  const emailRef = useRef<string | null>(email ?? null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    emailRef.current = email ?? null;
  }, [email]);

  const apply = useCallback((data: ScorePayload) => {
    if (!isMounted.current) return;
    setTotalPoints(data.points ?? 0);
    setRabbitTarget(data.rabbitTarget ?? null);
    setRabbitSeq(data.rabbitSeq ?? null);
    setNextRankThreshold(data.nextRankThreshold ?? null);
  }, []);

  const load = useCallback(async (overrideEmail?: string | null) => {
    const targetEmail = overrideEmail ?? emailRef.current;
    if (!targetEmail) return;
    try {
      const res = await fetch('/api/rabbit/state', {
        cache: 'no-store',
        headers: {
          'X-User-Email': targetEmail,
        },
      });
      if (!res.ok) return;
      const data: ScorePayload = await res.json().catch(() => ({}));
      apply(data);
    } catch {
      /* ignore errors */
    }
  }, [apply]);

  useEffect(() => {
    isMounted.current = true;
    if (emailRef.current) {
      load(emailRef.current);
    }
  }, [load, email]);

  return {
    totalPoints,
    rabbitTarget,
    rabbitSeq,
    nextRankThreshold,
    refresh: () => load() ?? Promise.resolve(),
    apply,
  };
}
