'use client';

import React, { useState, useEffect, useRef } from 'react';

const MODAL_DEBUG = process.env.NEXT_PUBLIC_TERMINAL_MOBILE_DEBUG === '1';

interface MobileInputModalProps {
  isOpen: boolean;
  prompt: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  inputType?: string;
  autoFocus?: boolean;
}

export default function MobileInputModal({
  isOpen,
  prompt,
  placeholder,
  onSubmit,
  inputType = 'text',
  autoFocus = true,
}: MobileInputModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && autoFocus && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        if (MODAL_DEBUG) {
          console.log('[TERMINAL_MOBILE]', 'secret-modal-open', {
            focused: document.activeElement === inputRef.current,
          });
        }
      }, 100);
    }
  }, [isOpen, autoFocus]);

  useEffect(() => {
    if (!isOpen) {
      setValue('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Above StressTestBanner (99999), Jody (9999), and mobile action bar (10000)
        zIndex: 200000,
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="bg-[#0a0a0a] border-2 border-green-500 rounded-lg p-6 max-w-md w-full mx-4"
        style={{
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-green-500 font-mono text-lg mb-4">{prompt}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-3 bg-black text-green-500 border border-green-500 rounded focus:outline-none focus:border-green-400 placeholder-green-500/50 font-mono text-base"
            required
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            style={{
              fontSize: '16px',
              WebkitAppearance: 'none',
            }}
          />

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-green-500 text-black py-3 px-4 rounded hover:bg-green-600 transition-colors font-mono text-base font-bold"
            >
              SUBMIT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
