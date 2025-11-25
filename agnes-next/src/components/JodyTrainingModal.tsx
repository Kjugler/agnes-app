'use client';

import React, { useEffect, useState } from 'react';

interface JodyTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc: string;
  title: string;
  steps: Array<{ text: React.ReactNode }>;
  importantNote?: React.ReactNode;
  afterPostNote?: React.ReactNode;
}

export function JodyTrainingModal({
  isOpen,
  onClose,
  videoSrc,
  title,
  steps,
  importantNote,
  afterPostNote,
}: JodyTrainingModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          backgroundColor: '#0b0515',
          borderRadius: 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              fontSize: 20,
              cursor: 'pointer',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s',
            }}
            aria-label="Close tutorial"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: isMobile 
              ? '1fr' 
              : 'minmax(0, 2fr) minmax(0, 1.4fr)',
            gap: 18,
            overflow: 'hidden',
          }}
        >
          {/* Video */}
          <div
            style={{
              backgroundColor: '#000',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <video
              src={videoSrc}
              controls
              style={{
                width: '100%',
                display: 'block',
                maxHeight: '70vh',
              }}
            />
          </div>

          {/* Steps */}
          <div
            style={{
              color: '#f5f5ff',
              fontSize: 13,
              lineHeight: 1.5,
              overflowY: 'auto',
              maxHeight: '70vh',
              paddingRight: 8,
            }}
          >
            <p style={{ marginTop: 0, marginBottom: 8 }}>
              Follow along with me in the video, or use this quick checklist:
            </p>
            <ol style={{ paddingLeft: 16, margin: 0 }}>
              {steps.map((step, index) => (
                <li key={index} style={{ marginBottom: 8 }}>
                  {step.text}
                </li>
              ))}
            </ol>

            {importantNote && (
              <div
                style={{
                  marginTop: 16,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,59,224,0.12)',
                  border: '1px solid rgba(255,59,224,0.6)',
                }}
              >
                {importantNote}
              </div>
            )}

            {afterPostNote && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: 'rgba(0,255,180,0.08)',
                  border: '1px solid rgba(0,255,180,0.45)',
                }}
              >
                {afterPostNote}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

