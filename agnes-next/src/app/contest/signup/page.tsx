'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Associate, SignupPayload } from '@/types/contest';

export default function SignupPage() {
  const router = useRouter();
  const qp = useSearchParams();
  const fromParam = qp.get('from');

  const [formData, setFormData] = useState<SignupPayload>({
    firstName: '',
    lastName: '',
    email: '',
    x: '',
    instagram: '',
    tiktok: '',
  });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Associate | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!consent) {
      setError('Please check the consent box to continue.');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Get current points (priorTotal)
      let priorTotal = 0;
      try {
        const pointsRes = await fetch('/api/points/me', {
          method: 'GET',
          credentials: 'include',
        });
        if (pointsRes.ok) {
          const pointsData = await pointsRes.json();
          priorTotal = pointsData.total || 0;
        }
      } catch {
        // Fallback to localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('points_total');
          priorTotal = stored ? Number(stored) : 0;
        }
      }

      // Step 2: Sign up
      const signupRes = await fetch('/api/contest/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!signupRes.ok) {
        const err = await signupRes.json();
        throw new Error(err.error || 'Signup failed');
      }

      const { associate } = await signupRes.json();

      // Step 3: Save code and email to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('ap_code', associate.code);
        localStorage.setItem('first_name', associate.firstName);
        localStorage.setItem('email', associate.email);
      }

      // Step 4: Demo-award +250 points
      if (typeof window !== 'undefined') {
        const currentTotal = Number(localStorage.getItem('points_total') || '0');
        localStorage.setItem('points_total', String(currentTotal + 250));
      }

      setSuccess(associate);

      // Step 5: Decide redirect
      const redirectParams = new URLSearchParams();
      redirectParams.set('code', associate.code);
      redirectParams.set('ref', associate.code);

      let redirectPath = '/contest/ascension';
      if (priorTotal > 0 && fromParam) {
        // User had points before - redirect back to where they came from
        try {
          const decoded = decodeURIComponent(fromParam);
          redirectPath = decoded;
        } catch {
          redirectPath = '/contest/ascension';
        }
      } else if (priorTotal <= 0) {
        // User had 0 points - go to ascension
        redirectPath = '/contest/ascension';
      }

      // Append params
      const finalUrl = `${redirectPath}?${redirectParams.toString()}`;

      // Small delay to show success message
      setTimeout(() => {
        router.push(finalUrl);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {success ? (
        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>You're in!</h1>
          <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
            Your code: <strong>{success.code}</strong> (15% off)
          </p>
          <p>Redirecting you now...</p>
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>
            Enter the Contest
          </h1>
          <form
            onSubmit={handleSubmit}
            style={{
              maxWidth: '500px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <label
                htmlFor="firstName"
                style={{ display: 'block', marginBottom: '0.5rem' }}
              >
                First Name *
              </label>
              <input
                id="firstName"
                type="text"
                required
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  backgroundColor: '#111',
                  color: '#fff',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="lastName"
                style={{ display: 'block', marginBottom: '0.5rem' }}
              >
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  backgroundColor: '#111',
                  color: '#fff',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                style={{ display: 'block', marginBottom: '0.5rem' }}
              >
                Email *
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  backgroundColor: '#111',
                  color: '#fff',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="x"
                style={{ display: 'block', marginBottom: '0.5rem' }}
              >
                X (Twitter) Handle
              </label>
              <input
                id="x"
                type="text"
                placeholder="@username"
                value={formData.x}
                onChange={(e) =>
                  setFormData({ ...formData, x: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  backgroundColor: '#111',
                  color: '#fff',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="instagram"
                style={{ display: 'block', marginBottom: '0.5rem' }}
              >
                Instagram Handle
              </label>
              <input
                id="instagram"
                type="text"
                placeholder="@username"
                value={formData.instagram}
                onChange={(e) =>
                  setFormData({ ...formData, instagram: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  backgroundColor: '#111',
                  color: '#fff',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="tiktok"
                style={{ display: 'block', marginBottom: '0.5rem' }}
              >
                TikTok Handle
              </label>
              <input
                id="tiktok"
                type="text"
                placeholder="@username"
                value={formData.tiktok}
                onChange={(e) =>
                  setFormData({ ...formData, tiktok: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  backgroundColor: '#111',
                  color: '#fff',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
              <input
                id="consent"
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: '0.25rem' }}
              />
              <label htmlFor="consent" style={{ fontSize: '0.9rem' }}>
                I consent to participate in the contest and receive updates. *
              </label>
            </div>

            {error && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#cc0000',
                  borderRadius: '4px',
                  color: '#fff',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '1rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                backgroundColor: loading ? '#555' : '#00ff00',
                color: loading ? '#aaa' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
              }}
            >
              {loading ? 'Signing up...' : 'Enter Contest'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

