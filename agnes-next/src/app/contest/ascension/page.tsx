'use client';

import { useRouter } from 'next/navigation';
import '@/styles/ascension.css';
import '@/styles/fit-guard.css';

export default function AscensionPage() {
  const router = useRouter();

  const goScore = () => router.push('/contest/score');
  const goBadge = () => router.push('/contest/badges');

  return (
    <div className="ascension-wrap" data-has-test-banner>
      <div className="welcome-overlay" aria-hidden="true" />
      <div className="doors">
        <button type="button" className="red-door" onClick={goScore}>
          <span className="door-label">SEE MY<br />SCORE</span>
        </button>

        <button type="button" className="red-door" onClick={goBadge}>
          <span className="door-label">EXPLORE<br />BADGES</span>
        </button>
      </div>
    </div>
  );
}