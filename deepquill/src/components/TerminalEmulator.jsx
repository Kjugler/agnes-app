// deepquill/src/api/TerminalEmulator.jsx
import React, { useState, useEffect, useRef } from 'react';
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui';
import EmailModal from './EmailModal';
import JodyAssistant from './JodyAssistant';
import './TerminalEmulator.css';
import { subscribeEmail } from '../api/subscribeEmail';

// Phase state machine: 'intro' | 'terminal1' | 'terminal2' | 'lightning'
const TerminalEmulator = () => {
  const [phase, setPhase] = useState('intro'); // 'intro' | 'terminal1' | 'terminal2' | 'lightning'
  const [lineData, setLineData] = useState([]);
  const [isIntroComplete, setIsIntroComplete] = useState(false);
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [isSecondAttempt, setIsSecondAttempt] = useState(false);
  const [entryVariant, setEntryVariant] = useState(null); // 'terminal' | 'protocol' | null

  // new: state for email submit UX
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');

  const introIntervalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const downloadIntervalRef = useRef(null);
  const phaseRef = useRef(phase);
  const inputRef = useRef(null); // Hard ref to the typing target
  const jodyRenderedRef = useRef(false); // Track when Jody is rendered

  const introMessages = [
    'VERIFYING SECURITY ID...',
    'Accessing Agnes Protocol Layer: REDACTED',
    'Clearance Status: UNKNOWN',
    'ERROR – Clearance code required.',
  ];

  const runIntroAnimation = () => {
    if (introIntervalRef.current) {
      clearInterval(introIntervalRef.current);
    }
    let currentIndex = 0;
    const intervalId = setInterval(() => {
      if (currentIndex < introMessages.length) {
        setLineData(prev => [
          ...prev,
          <TerminalOutput key={`intro-${currentIndex}-${Date.now()}`} className="text-green-500">
            {introMessages[currentIndex]}
          </TerminalOutput>,
        ]);
        currentIndex++;
      } else {
        clearInterval(intervalId);
        introIntervalRef.current = null;
        setIsIntroComplete(true);
        setLineData(prev => [
          ...prev,
          <TerminalOutput key={`hint1-${Date.now()}`} className="text-green-500">
            {'You must know the secret to get in.'}
          </TerminalOutput>,
        ]);
        setLineData(prev => [
          ...prev,
          <TerminalOutput key={`hint2-${Date.now()}`} className="text-green-500">
            {"Hint: It starts with '#where'"}
          </TerminalOutput>,
        ]);
      }
    }, 1000);
    introIntervalRef.current = intervalId;
  };

  // Keep phaseRef in sync with phase state
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Transition to terminal2 phase when access is granted
  useEffect(() => {
    if (isAccessGranted && phase === 'terminal1') {
      console.log('[TerminalEmulator] Access granted, transitioning to terminal2');
      setPhase('terminal2');
    }
  }, [isAccessGranted, phase]);

  // Start download animation when we enter terminal2 phase
  useEffect(() => {
    if (phase === 'terminal2' && !downloadIntervalRef.current && !isDownloading) {
      console.log('[TerminalEmulator] Starting download animation');
      setIsDownloading(true);
      setDownloadProgress(0);
      
      downloadIntervalRef.current = setInterval(() => {
        // Check ref instead of state to avoid stale closure issues
        if (phaseRef.current !== 'terminal2' && downloadIntervalRef.current) {
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;
          return;
        }
        
        setDownloadProgress(prev => {
          const next = prev + 1;
          if (next >= 100) {
            console.log('[TerminalEmulator] Download complete, showing email modal');
            if (downloadIntervalRef.current) {
              clearInterval(downloadIntervalRef.current);
              downloadIntervalRef.current = null;
            }
            setIsDownloading(false);
            setShowEmailModal(true);
            return 100;
          }
          return next;
        });
      }, 50);
    }
    
    // Cleanup: clear interval only when leaving terminal2 phase (check ref, not closure)
    return () => {
      if (phaseRef.current !== 'terminal2' && downloadIntervalRef.current) {
        console.log('[TerminalEmulator] Cleaning up download interval');
        clearInterval(downloadIntervalRef.current);
        downloadIntervalRef.current = null;
        setIsDownloading(false);
      }
    };
  }, [phase, isDownloading]);

  // Choose variant function (sticky via localStorage)
  const chooseVariant = () => {
    if (typeof window === 'undefined') return 'terminal';
    
    const stored = localStorage.getItem('dq_entry_variant');
    if (stored === 'terminal' || stored === 'protocol') {
      return stored;
    }
    
    // No variant exists - assign randomly 50/50
    const v = Math.random() < 0.5 ? 'terminal' : 'protocol';
    localStorage.setItem('dq_entry_variant', v);
    
    // Also set cookie for consistency
    const isNgrok = window.location.hostname.includes('ngrok-free.dev') || 
                    window.location.hostname.includes('ngrok.io');
    const needsSecureCookies = isNgrok || import.meta.env?.MODE === 'production';
    const sameSite = needsSecureCookies ? 'None' : 'Lax';
    const secure = needsSecureCookies ? '; Secure' : '';
    
    document.cookie = `dq_entry_variant=${v}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=${sameSite}${secure}`;
    
    return v;
  };

  // Choose variant early (on mount) - before intro completes
  useEffect(() => {
    const variant = chooseVariant();
    setEntryVariant(variant);
    console.log('[intro] variant chosen early:', variant);
  }, []);

  // Handle split redirect immediately after intro completes
  useEffect(() => {
    if (!isIntroComplete || phase !== 'intro' || !entryVariant) return;
    
    console.log('[intro] intro complete, variant:', entryVariant);
    
    // Determine agnes-next base URL (needed for both protocol redirect and debug logging)
    let NEXT_BASE = null;
    const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AGNES_BASE_URL : null;
    if (envUrl) {
      NEXT_BASE = envUrl;
    } else if (typeof window !== 'undefined') {
      if (window.location.hostname.includes('ngrok') || window.location.hostname.includes('ngrok-free.app')) {
        NEXT_BASE = `${window.location.protocol}//${window.location.host}`;
      } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        NEXT_BASE = 'http://localhost:3002';
      } else {
        NEXT_BASE = 'https://agnes-dev.ngrok-free.app';
      }
    } else {
      NEXT_BASE = 'http://localhost:3002';
    }
    
    // Log variant selection to server (for measurement)
    const debugApiUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
      ? 'http://localhost:5055/api/debug/variant'
      : '/api/debug/variant';
    
    fetch(debugApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variant: entryVariant,
        next: entryVariant === 'protocol' ? `${NEXT_BASE}/the-protocol-challenge` : 'terminal-flow',
        ts: Date.now(),
      }),
    }).catch(() => {
      // Silently fail - debug logging is non-critical
    });
    
    // If protocol variant, redirect to agnes-next protocol challenge page
    if (entryVariant === 'protocol') {
      // Preserve all query params
      const currentParams = new URLSearchParams(window.location.search);
      const trackingParams = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
      trackingParams.forEach(key => {
        const value = currentParams.get(key);
        if (value) {
          currentParams.set(key, value);
        }
      });
      
      const protocolUrl = `${NEXT_BASE}/the-protocol-challenge?${currentParams.toString()}`;
      console.log('[intro] redirect ->', protocolUrl);
      
      // Small delay to ensure overlay paints before navigation (makes transition smoother)
      setTimeout(() => {
        window.location.replace(protocolUrl);
      }, 50);
      return;
    }
    
    // Terminal variant: stay in TerminalEmulator (continue to Terminal 1)
    console.log('[intro] redirect -> terminal experience (staying in TerminalEmulator)');
    // No redirect needed - component will continue showing Terminal 1 hints
  }, [isIntroComplete, phase, entryVariant]);

  // intro run once when phase is 'intro'
  useEffect(() => {
    if (phase === 'intro') {
      runIntroAnimation();
    }
    return () => {
      if (introIntervalRef.current) clearInterval(introIntervalRef.current);
    };
  }, [phase]);

  // snapCursor helper function - deterministic cursor snapping
  const snapCursor = (reason) => {
    // Try inputRef first
    let input = inputRef.current;
    
    // Fallback: query selector
    if (!input) {
      input = document.querySelector('.react-terminal-input');
      if (input) {
        inputRef.current = input; // Cache for next time
      }
    }
    
    if (!input || !(input instanceof HTMLElement)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[terminal] snapCursor', { reason, success: false, error: 'input not found' });
      }
      return false;
    }
    
    try {
      // Focus the input
      input.focus();
      
      // Set cursor to end
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        const length = input.value ? input.value.length : 0;
        input.setSelectionRange(length, length);
      } else if (input.contentEditable === 'true') {
        // Handle contentEditable
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(input);
        range.collapse(false); // Collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[terminal] snapCursor', { reason, success: true });
      }
      return true;
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[terminal] snapCursor', { reason, success: false, error: e.message });
      }
      return false;
    }
  };

  // Focus loop after Jody renders
  useEffect(() => {
    if (!jodyRenderedRef.current) return;
    
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds at 100ms intervals
    const focusInterval = setInterval(() => {
      const success = snapCursor('jody-ready');
      attempts++;
      if (success || attempts >= maxAttempts) {
        clearInterval(focusInterval);
      }
    }, 100);
    
    return () => clearInterval(focusInterval);
  }, [jodyRenderedRef.current]);

  // Global interaction listeners (capture mode)
  useEffect(() => {
    // Throttle mousemove to 100ms
    let mousemoveTimeout = null;
    const handleMouseMove = (e) => {
      // Check if target is inside Jody widget
      if (e.target) {
        const jodyWidget = e.target.closest('[data-jody-widget]');
        if (jodyWidget) return; // Skip if inside Jody widget
      }
      
      if (mousemoveTimeout) return;
      mousemoveTimeout = setTimeout(() => {
        snapCursor('mousemove');
        mousemoveTimeout = null;
      }, 100);
    };

    const handleInteraction = (e) => {
      // Check if target is inside Jody widget
      if (e.target) {
        const jodyWidget = e.target.closest('[data-jody-widget]');
        if (jodyWidget) return; // Skip if inside Jody widget
      }
      
      const reason = e.type === 'keydown' ? 'keydown' :
                     e.type === 'mousedown' ? 'mousedown' :
                     e.type === 'touchstart' ? 'touchstart' : 'click';
      snapCursor(reason);
    };

    // Attach listeners with capture mode
    window.addEventListener('keydown', handleInteraction, { capture: true });
    window.addEventListener('mousedown', handleInteraction, { capture: true });
    window.addEventListener('touchstart', handleInteraction, { capture: true });
    window.addEventListener('mousemove', handleMouseMove, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleInteraction, { capture: true });
      window.removeEventListener('mousedown', handleInteraction, { capture: true });
      window.removeEventListener('touchstart', handleInteraction, { capture: true });
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      if (mousemoveTimeout) {
        clearTimeout(mousemoveTimeout);
      }
    };
  }, []);

  // Initial focus attempt on mount
  useEffect(() => {
    const tryFocus = () => {
      snapCursor('mount');
    };
    
    // Try immediately and after a short delay
    tryFocus();
    setTimeout(tryFocus, 100);
    setTimeout(tryFocus, 500);
  }, [phase]);

  // Note: EmailModal now handles redirect directly, so this callback is no longer needed
  // Keeping it as a no-op in case EmailModal still calls it
  const handleEmailSubmitted = () => {
    console.log('[TerminalEmulator] handleEmailSubmitted called (EmailModal should redirect directly)');
    // EmailModal redirects directly, so we don't need to do anything here
  };

  const handleInput = (input) => {
    // echo the command
    setLineData(prev => [
      ...prev,
      <TerminalOutput key={`cmd-${Date.now()}`} className="text-green-500">
        {`$ ${input}`}
      </TerminalOutput>,
    ]);

    const normalizedInput = input.toLowerCase().trim();
    
    // Always allow secret code entry, even if intro isn't complete
    // This prevents the loop where entering the code restarts the intro
    if (normalizedInput === 'where is jody vernon' || normalizedInput === '#whereisjodyvernon') {
      if (introIntervalRef.current) {
        clearInterval(introIntervalRef.current);
        introIntervalRef.current = null;
      }
      setLineData(prev => [
        ...prev,
        <TerminalOutput key={`access-granted-${Date.now()}`} className="text-green-500">
          {'Access Granted.'}
        </TerminalOutput>,
      ]);
      setLineData(prev => [
        ...prev,
        <TerminalOutput key={`authenticating-${Date.now()}`} className="text-green-500">
          {'authenticating...'}
        </TerminalOutput>,
      ]);
      setIsAccessGranted(true);
      setIsIntroComplete(true);
      setPhase('terminal1'); // Move to terminal1 phase after secret code
      console.log('[TerminalEmulator] Setting isAccessGranted to true, phase to terminal1');
      return; // Exit early after successful code entry to prevent further processing
    }
    
    // NOTE: Auto-advance is DISABLED by default
    // Terminal 1 must wait for user to enter the secret code
    // Only demo mode (?demo=1) would allow auto-advance, but that's not implemented
    // to prevent accidental auto-jumps
    
    // Only process other inputs if intro is complete or access is granted
    if (!isIntroComplete && !isAccessGranted) return;

    // Handle incorrect code attempts
    setAttemptCount(prev => prev + 1);

    if (attemptCount === 0) {
        setLineData(prev => [
          ...prev,
          <TerminalOutput key={`err1-${Date.now()}`} className="text-green-500">
            {"You weren't ready. But we'll give you one more shot."}
          </TerminalOutput>,
        ]);
        setLineData(prev => [
          ...prev,
          <TerminalOutput key={`err2-${Date.now()}`} className="text-green-500">
            {'You saw it. You heard it. Try again.'}
          </TerminalOutput>,
        ]);
        setIsSecondAttempt(true);
      } else {
        setLineData(prev => [
          ...prev,
          <TerminalOutput key={`err3-${Date.now()}`} className="text-green-500">
            {"Most never make it. You're welcome to try again tomorrow."}
          </TerminalOutput>,
        ]);
        setTimeout(() => {
          setLineData([]);
          setIsIntroComplete(false);
          setAttemptCount(0);
          setIsSecondAttempt(false);
          setIsAccessGranted(false);
          runIntroAnimation();
        }, 3000);
      }
  };

  // render progress line(s)
  useEffect(() => {
    if (isDownloading) {
      setLineData(prev => {
        const newData = [...prev];
        const lastLine = newData[newData.length - 1];
        const bar = `_[${downloadProgress}%] ${'█'.repeat(Math.floor(downloadProgress / 5))}${'░'.repeat(
          20 - Math.floor(downloadProgress / 5)
        )}`;
        if (lastLine && typeof lastLine.props.children === 'string' && lastLine.props.children.includes('_')) {
          newData[newData.length - 1] = (
            <TerminalOutput key={`progress-${downloadProgress}-${Date.now()}`} className="text-green-500">
              {bar}
            </TerminalOutput>
          );
        } else {
          newData.push(
            <TerminalOutput key={`progress-new-${downloadProgress}-${Date.now()}`} className="text-green-500">
              {bar}
            </TerminalOutput>
          );
        }
        return newData;
      });
    }
  }, [downloadProgress, isDownloading]);

  // Render lightning screen when phase is 'lightning'
  if (phase === 'lightning') {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'monospace'
      }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '2rem', color: '#00ff00' }}>
            THE AGNES PROTOCOL
          </h1>
          <div style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>
            <p style={{ color: '#ffff00', marginBottom: '1rem' }}>
              ⚡ FORGING THE BOOK ⚡
            </p>
            <div style={{ 
              border: '2px solid #00ff00', 
              padding: '2rem',
              borderRadius: '8px',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              <p style={{ marginBottom: '1rem' }}>
                The book is being forged...
              </p>
              <p style={{ color: '#00ff00' }}>
                Your access has been granted.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Protocol variant transition overlay (shown when intro completes and variant is protocol)
  if (isIntroComplete && entryVariant === 'protocol') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}
      >
        {/* Optional: Add "Routing..." text if desired */}
        {/* <div style={{ color: '#ff0000', fontFamily: 'monospace', fontSize: '1.5rem' }}>
          Routing...
        </div> */}
      </div>
    );
  }

  // Gate Terminal UI rendering - only show if variant is 'terminal'
  // If variant is 'protocol', never show Terminal UI (even during intro, to prevent flash)
  // If variant is null (not yet determined), show Terminal UI during intro
  const shouldShowTerminal = entryVariant === 'terminal' || (entryVariant === null && phase === 'intro');

  return (
    <>
      {shouldShowTerminal && (
        <div 
          ref={terminalContainerRef}
          className="terminal-container" 
          style={{ width: '100%', height: '100vh', display: phase === 'lightning' ? 'none' : 'block' }}
        >
          <Terminal
            name="THE CONTROL ROOM"
            colorMode={ColorMode.Dark}
            onInput={handleInput}
            prompt="$"
            height="100vh"
          >
            {lineData}
          </Terminal>
        </div>
      )}

      {(() => {
        console.log('[TerminalEmulator] Render - showEmailModal:', showEmailModal, 'phase:', phase, 'entryVariant:', entryVariant);
        return null;
      })()}
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => {
          console.log('[TerminalEmulator] EmailModal onClose called');
          setShowEmailModal(false);
        }}
        onEmailSubmitted={handleEmailSubmitted}
      />
      
      {/* Jody Assistant - First IBM Terminal - Hide when email modal is open or protocol variant */}
      {shouldShowTerminal && !showEmailModal && phase !== 'lightning' && (
        <JodyAssistant 
          variant="em1" 
          autoShowDelayMs={4000}
          onRender={() => {
            jodyRenderedRef.current = true;
          }}
        />
      )}
      
      {/* debug badge: shows which app and API base are in use */}
<div style={{
  position: 'fixed', right: 8, bottom: 8, zIndex: 99999,
  background: '#111', color: '#0f0', padding: '4px 6px',
  fontFamily: 'monospace', fontSize: 12, border: '1px solid #0f0', borderRadius: 6
}}>
  deepquill • API:
  {' '}
  {typeof window !== 'undefined' ? (window.__API_BASE__ || 'unset') : 'server'}
</div>
    </>
  );
};

export default TerminalEmulator;
