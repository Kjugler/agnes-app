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

  // new: state for email submit UX
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');

  const introIntervalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const downloadIntervalRef = useRef(null);
  const phaseRef = useRef(phase);

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

  // intro run once when phase is 'intro'
  useEffect(() => {
    if (phase === 'intro') {
      runIntroAnimation();
    }
    return () => {
      if (introIntervalRef.current) clearInterval(introIntervalRef.current);
    };
  }, [phase]);

  // Auto-focus terminal input on mount
  useEffect(() => {
    // Find the terminal input element and focus it
    const focusTerminalInput = () => {
      // react-terminal-ui creates an input with class 'react-terminal-input'
      const input = document.querySelector('.react-terminal-input');
      if (input && input instanceof HTMLElement) {
        input.focus();
        return true;
      }
      return false;
    };

    // Try immediately, then retry with delays to ensure DOM is ready
    let attempts = 0;
    const maxAttempts = 5;
    const tryFocus = () => {
      if (focusTerminalInput() || attempts >= maxAttempts) {
        return;
      }
      attempts++;
      setTimeout(tryFocus, 200);
    };

    // Start focus attempts
    tryFocus();

    // Also refocus when clicking anywhere on the terminal container (except Jody widget)
    const handleContainerClick = (e) => {
      // Don't refocus if clicking on Jody widget (z-index 9999 elements)
      const jodyElement = e.target.closest('[style*="z-index: 9999"]');
      if (!jodyElement) {
        setTimeout(focusTerminalInput, 50);
      }
    };

    const container = terminalContainerRef.current;
    if (container) {
      container.addEventListener('click', handleContainerClick);
    }
    
    // Cleanup
    return () => {
      if (container) {
        container.removeEventListener('click', handleContainerClick);
      }
    };
  }, []);

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

  return (
    <>
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

      {(() => {
        console.log('[TerminalEmulator] Render - showEmailModal:', showEmailModal, 'phase:', phase);
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
      
      {/* Jody Assistant - First IBM Terminal - Hide when email modal is open */}
      {!showEmailModal && phase !== 'lightning' && <JodyAssistant variant="em1" autoShowDelayMs={4000} />}
      
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
