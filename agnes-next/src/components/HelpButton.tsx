'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import HelpModal from './HelpModal';

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    console.log('[HelpButton] Component mounted');
  }, []);

  React.useEffect(() => {
    console.log('[HelpButton] Modal open state:', open);
  }, [open]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[HelpButton] Click handler fired, opening modal');
    setOpen(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    console.log('[HelpButton] MouseDown event fired');
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    console.log('[HelpButton] MouseUp event fired');
    e.preventDefault();
    e.stopPropagation();
  };

  React.useEffect(() => {
    if (open) {
      console.log('[HelpButton] Modal should render now, mounted:', mounted, 'open:', open);
      console.log('[HelpButton] document.body exists:', typeof document !== 'undefined' && !!document.body);
    }
  }, [open, mounted]);

  return (
    <>
      {/* Tooltip - render via portal */}
      {mounted && hovered && typeof document !== 'undefined' && document.body && createPortal(
        <div
          style={{
            position: 'fixed',
            left: '1.5rem',
            bottom: '6rem',
            zIndex: 10003,
            whiteSpace: 'nowrap',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.75rem',
            fontSize: '0.75rem',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none'
          }}
        >
          Need help? Click to message our team.
        </div>,
        document.body
      )}

      {/* Button - render via portal to ensure it's on top */}
      {mounted && createPortal(
        <button
          type="button"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseEnter={() => {
            console.log('[HelpButton] MouseEnter fired');
            setHovered(true);
          }}
          onMouseLeave={() => {
            console.log('[HelpButton] MouseLeave fired');
            setHovered(false);
          }}
          className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-fuchsia-500 shadow-lg hover:shadow-xl hover:scale-105 transition-transform duration-150 cursor-pointer"
          style={{ 
            position: 'fixed',
            left: '1rem',
            bottom: '3.5rem',
            zIndex: 10002,
            pointerEvents: 'auto',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
          }}
        >
          Need help?
        </button>,
        document.body
      )}

      {/* Modal - render via portal */}
      {mounted && open && typeof document !== 'undefined' && document.body && createPortal(
        <HelpModal onClose={() => {
          console.log('[HelpButton] Closing modal');
          setOpen(false);
        }} />,
        document.body
      )}
    </>
  );
}
