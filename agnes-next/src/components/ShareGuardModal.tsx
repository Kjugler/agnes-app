'use client';

import { useState } from 'react';
import { updateHandles } from '@/lib/profile';

type Platform = 'facebook' | 'x' | 'instagram' | 'tiktok' | 'truth';

const platformLabels: Record<Platform, string> = {
  facebook: 'Facebook',
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  truth: 'Truth Social',
};

const platformKeys: Record<Platform, 'x' | 'instagram' | 'tiktok' | 'truth'> = {
  facebook: 'x', // Facebook doesn't use handles the same way, but we'll use x for consistency
  x: 'x',
  instagram: 'instagram',
  tiktok: 'tiktok',
  truth: 'truth',
};

interface ShareGuardModalProps {
  platform: Platform;
  onDone: () => void;
  onCancel: () => void;
}

export default function ShareGuardModal({
  platform,
  onDone,
  onCancel,
}: ShareGuardModalProps) {
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!handle.trim()) {
      setError('Please enter a handle');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Remove @ if present
      const cleanHandle = handle.trim().replace(/^@/, '');
      const platformKey = platformKeys[platform];

      // Update handles
      await updateHandles({
        [platformKey]: cleanHandle,
      });

      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to save handle');
      setLoading(false);
    }
  };

  const platformLabel = platformLabels[platform];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#000',
          }}
        >
          Add your {platformLabel} handle
        </h2>

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="handle-input"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              color: '#666',
            }}
          >
            @username
          </label>
          <input
            id="handle-input"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@username"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) handleSave();
              if (e.key === 'Escape') onCancel();
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              borderRadius: '6px',
              border: '1px solid #ddd',
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#fee',
              color: '#c00',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              borderRadius: '6px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
              color: '#333',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: loading ? '#999' : '#000',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

