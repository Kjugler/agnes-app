'use client';

import { useState, FormEvent } from 'react';

type SocialHandleModalProps = {
  isOpen: boolean;
  platform: 'fb' | 'ig' | 'x' | 'tt' | 'truth';
  platformName: string;
  onSave: (handle: string) => Promise<void>;
  onCancel: () => void;
};

export default function SocialHandleModal({
  isOpen,
  platform,
  platformName,
  onSave,
  onCancel,
}: SocialHandleModalProps) {
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    
    setSaving(true);
    try {
      await onSave(handle.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderRadius: 18,
          padding: '2rem',
          maxWidth: 480,
          width: '90%',
          border: '1px solid rgba(148, 163, 184, 0.3)',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: 'white' }}>
          We need your {platformName} handle
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#cbd5e1', fontSize: '0.95rem' }}>
          We need your {platformName} handle so we can include it in your share.
        </p>
        
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.9rem' }}>
            @username
          </label>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@yourhandle"
            required
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.75)',
              color: 'white',
              fontSize: '0.95rem',
              marginBottom: '1.5rem',
            }}
            autoFocus
          />
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'transparent',
                color: '#cbd5e1',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !handle.trim()}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: 999,
                border: 'none',
                background: saving || !handle.trim() ? '#64748b' : '#38ef7d',
                color: 'black',
                cursor: saving || !handle.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 700,
              }}
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

