// deepquill/src/components/MobileInputModal.jsx
// Mobile-friendly input modal to replace terminal text input on mobile devices
// Prevents iOS Safari scroll hijacking issues

import React, { useState, useEffect } from 'react';

const MobileInputModal = ({ 
  isOpen, 
  prompt, 
  placeholder, 
  onSubmit, 
  inputType = 'text',
  autoFocus = true 
}) => {
  const [value, setValue] = useState('');
  const inputRef = React.useRef(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen && autoFocus && inputRef.current) {
      // Small delay to ensure modal is fully rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, autoFocus]);

  // Reset value when modal closes
  useEffect(() => {
    if (!isOpen) {
      setValue('');
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
      style={{
        // Prevent body scroll when modal is open
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onClick={(e) => {
        // Don't close on backdrop click - user must submit
        e.stopPropagation();
      }}
    >
      <div 
        className="bg-[#0a0a0a] border-2 border-green-500 rounded-lg p-6 max-w-md w-full mx-4"
        style={{
          // Ensure modal stays in viewport
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-green-500 font-mono text-lg mb-4">
          {prompt}
        </h3>
        
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
              // Prevent iOS zoom on focus
              fontSize: '16px',
              // Ensure input stays visible
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
};

export default MobileInputModal;
