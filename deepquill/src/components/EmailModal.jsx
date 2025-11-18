// deepquill/src/components/EmailModal.jsx
import React, { useState } from 'react';
import { subscribeEmail } from '../api/subscribeEmail';

const EmailModal = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const result = await subscribeEmail(email);

      if (result?.message) {
        setMessage(`✅ ${result.message}`);
        setEmail('');

        // --- fire tracking event to Next (agnes-next) ---
        const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_NEXT_PUBLIC_SITE_URL : null;
        const NEXT_BASE = envUrl || 'https://agnes-dev.ngrok-free.app';
        
        // Debug: log what URL we're using (with alert for visibility)
        console.log('[deepquill] NEXT_BASE env var:', envUrl);
        console.log('[deepquill] NEXT_BASE final value:', NEXT_BASE);
        console.log('[deepquill] import.meta.env:', import.meta.env);
        console.log('[deepquill] All VITE_ vars:', Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_')));
        
        // Temporary alert to verify the URL being used
        if (NEXT_BASE.includes('simona-nonindictable')) {
          alert('ERROR: Still using old domain! NEXT_BASE=' + NEXT_BASE);
        }

        try {
          fetch(`${NEXT_BASE}/api/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'CONTEST_ENTERED',
              email,
              source: 'contest',
              ref: new URLSearchParams(location.search).get('ref') || undefined,
              meta: { path: '/lightening' },
            }),
          }).catch(() => {});
        } catch {}
        // ------------------------------------------------

        // redirect to the Next app
        const NEXT_PATH = '/lightening';
        const ref = new URLSearchParams(location.search).get('ref');
        const query = new URLSearchParams();
        if (email) query.set('mockEmail', email);
        if (ref) query.set('ref', ref);
        const queryString = query.toString();
        setTimeout(() => {
          const url = `${NEXT_BASE}${NEXT_PATH}${queryString ? `?${queryString}` : ''}`;
          console.log('[deepquill] redirecting to', url);
          window.location.href = url;
        }, 1200);
      } else {
        setMessage(`❌ ${result?.error || 'Something went wrong. Please try again.'}`);
      }
    } catch (error) {
      setMessage('❌ Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  console.log('[EmailModal] Render - isOpen:', isOpen);
  
  if (!isOpen) {
    console.log('[EmailModal] Not rendering - isOpen is false');
    return null;
  }

  console.log('[EmailModal] Rendering modal');
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-green-500 text-2xl font-mono mb-4">Access Granted</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-green-500 font-mono mb-2">
              Request access to the redacted chapter
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-2 bg-black text-green-500 border border-green-500 rounded focus:outline-none focus:border-green-400 placeholder-green-500/50 font-mono"
              required
            />
          </div>

          {message && (
            <p
              className={`text-sm font-mono ${
                message.startsWith('✅') ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-green-500 text-black py-3 px-4 rounded hover:bg-green-600 transition-colors font-mono text-lg font-bold disabled:opacity-50"
          >
            {isSubmitting ? 'REQUESTING...' : 'REQUEST ACCESS'}
          </button>
        </form>

        {/* Access Report Block */}
        <div className="mt-8 p-4 border border-green-500/30 rounded bg-black/50">
          <h3 className="text-green-500 font-mono text-lg mb-4">ACCESS REPORT</h3>
          <div className="space-y-2 text-green-500/80 font-mono">
            <p>Protocol Visitors: 413,128</p>
            <p>Redacted Chapter Requests: 171,927</p>
            <p>Clearance Rate: 41.6%</p>
          </div>
          <p className="mt-4 text-green-500/60 font-mono italic">
            "Only the discerning make it through."
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-6 text-green-500 hover:text-green-400 text-sm font-mono"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default EmailModal;

