'use client';

import React, { useState, useEffect, useRef } from 'react';
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui';
import EmailModal from './EmailModal';
import JodyAssistantTerminal from './JodyAssistantTerminal';
import MobileInputModal from './MobileInputModal';
import { subscribeEmail } from '@/lib/terminal/subscribeEmail';
import './TerminalEmulator.css';

// react-terminal-ui's `TerminalOutput` type doesn't include `className`, but we rely on it
// for existing styling. Use a local typed wrapper to accept/forward `className` safely.
type TerminalOutputWithClassNameProps = {
  className?: string;
  children?: React.ReactNode;
};

const TerminalOutputWithClassName = TerminalOutput as unknown as React.ComponentType<TerminalOutputWithClassNameProps>;

type Phase = 'intro' | 'terminal1' | 'terminal2' | 'lightning';

export default function TerminalEmulator() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [lineData, setLineData] = useState<React.ReactNode[]>([]);
  const [isIntroComplete, setIsIntroComplete] = useState(false);
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [isSecondAttempt, setIsSecondAttempt] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSecretModal, setShowMobileSecretModal] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);

  const introIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const downloadIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('mobile-terminal');
        document.body.classList.remove('simple-mode');
      }
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const forceMobile = urlParams.get('mobile') === '1';
      const viewportWidth = window.innerWidth;
      const isSmallViewport = viewportWidth <= 520;
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isMobileDevice = forceMobile || isCoarsePointer || isSmallViewport;

      setIsMobile(isMobileDevice);

      if (typeof document !== 'undefined') {
        document.body.classList.toggle('mobile-terminal', isMobileDevice);
        document.body.classList.toggle('simple-mode', simpleMode && isMobileDevice);
      }

      if (isMobileDevice && phase === 'intro' && isIntroComplete && !isAccessGranted) {
        setShowMobileSecretModal(true);
      } else if (!isMobileDevice || isAccessGranted) {
        setShowMobileSecretModal(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
      if (typeof document !== 'undefined') {
        document.body.classList.remove('mobile-terminal', 'simple-mode');
      }
    };
  }, [phase, isIntroComplete, isAccessGranted, simpleMode]);

  useEffect(() => {
    if (typeof document !== 'undefined' && isMobile) {
      document.body.classList.toggle('simple-mode', simpleMode);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('simple-mode');
      }
    };
  }, [simpleMode, isMobile]);

  useEffect(() => {
    if (isMobile && isIntroComplete && !isAccessGranted && phase === 'intro') {
      setShowMobileSecretModal(true);
    }
  }, [isMobile, isIntroComplete, isAccessGranted, phase]);

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
        setLineData((prev) => [
          ...prev,
          <TerminalOutputWithClassName key={`intro-${currentIndex}-${Date.now()}`} className="text-green-500">
            {introMessages[currentIndex]}
          </TerminalOutputWithClassName>,
        ]);
        currentIndex++;
      } else {
        clearInterval(intervalId);
        introIntervalRef.current = null;
        setIsIntroComplete(true);
        setLineData((prev) => [
          ...prev,
          <TerminalOutputWithClassName key={`hint1-${Date.now()}`} className="text-green-500">
            {'You must know the secret to get in.'}
          </TerminalOutputWithClassName>,
        ]);
        setLineData((prev) => [
          ...prev,
          <TerminalOutputWithClassName key={`hint2-${Date.now()}`} className="text-green-500">
            {"Hint: It starts with '#where'"}
          </TerminalOutputWithClassName>,
        ]);
      }
    }, 1000);
    introIntervalRef.current = intervalId;
  };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'terminal2') {
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);

    const startedAt = Date.now();
    const durationMs = 5000;

    const finish = () => {
      if (downloadIntervalRef.current) {
        clearTimeout(downloadIntervalRef.current);
        downloadIntervalRef.current = null;
      }
      setDownloadProgress(100);
      setIsDownloading(false);
      setShowEmailModal(true);
    };

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const nextProgress =
        elapsed >= durationMs ? 100 : Math.min(99, Math.floor((elapsed / durationMs) * 100));
      setDownloadProgress(nextProgress);

      if (nextProgress >= 100) {
        finish();
        return;
      }

      downloadIntervalRef.current = setTimeout(tick, 50);
    };

    downloadIntervalRef.current = setTimeout(tick, 50);
    const hardComplete = setTimeout(finish, durationMs + 120);

    return () => {
      clearTimeout(hardComplete);
      if (downloadIntervalRef.current) {
        clearTimeout(downloadIntervalRef.current);
        downloadIntervalRef.current = null;
      }
    };
  }, [phase]);

  // Watchdog: if terminal2 is still downloading too long, force completion.
  useEffect(() => {
    if (phase !== 'terminal2' || !isDownloading || showEmailModal) {
      return;
    }

    const watchdogId = setTimeout(() => {
      setDownloadProgress(100);
      setIsDownloading(false);
      setShowEmailModal(true);
    }, 8000);

    return () => clearTimeout(watchdogId);
  }, [phase, isDownloading, showEmailModal]);

  useEffect(() => {
    if (phase === 'intro') {
      runIntroAnimation();
    }
    return () => {
      if (introIntervalRef.current) clearInterval(introIntervalRef.current);
    };
  }, [phase]);

  useEffect(() => {
    const focusTerminalInput = () => {
      const input = document.querySelector('.react-terminal-input');
      if (input && input instanceof HTMLElement) {
        input.focus();
        return true;
      }
      return false;
    };

    let attempts = 0;
    const maxAttempts = 5;
    const tryFocus = () => {
      if (focusTerminalInput() || attempts >= maxAttempts) return;
      attempts++;
      setTimeout(tryFocus, 200);
    };

    tryFocus();

    const handleContainerClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const jodyElement = target.closest('[style*="z-index: 9999"]');
      if (!jodyElement) {
        setTimeout(focusTerminalInput, 50);
      }
    };

    const container = terminalContainerRef.current;
    if (container) {
      container.addEventListener('click', handleContainerClick);
    }

    return () => {
      if (container) {
        container.removeEventListener('click', handleContainerClick);
      }
    };
  }, []);

  const handleEmailSubmitted = () => {
    // EmailModal redirects directly
  };

  const handleMobileSecretSubmit = (input: string) => {
    setShowMobileSecretModal(false);
    handleInput(input);
  };

  const handleNextClick = () => {
    if (!isMobile) return;

    if (phase === 'intro' && !isIntroComplete) {
      setIsIntroComplete(true);
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`hint1-${Date.now()}`} className="text-green-500">
          {'You must know the secret to get in.'}
        </TerminalOutputWithClassName>,
      ]);
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`hint2-${Date.now()}`} className="text-green-500">
          {"Hint: It starts with '#where'"}
        </TerminalOutputWithClassName>,
      ]);
      if (isMobile) setShowMobileSecretModal(true);
    } else if (phase === 'intro' && isIntroComplete && !isAccessGranted) {
      setShowMobileSecretModal(true);
    } else if (phase === 'terminal1' && isAccessGranted) {
      setPhase('terminal2');
    } else if (phase === 'terminal2' && isDownloading && downloadProgress < 100) {
      setDownloadProgress(100);
      setIsDownloading(false);
      setShowEmailModal(true);
    } else if (phase === 'terminal2' && !isDownloading && !showEmailModal) {
      setShowEmailModal(true);
    } else {
      const input = document.querySelector('.react-terminal-input');
      if (input && input instanceof HTMLElement) {
        input.focus();
        input.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          })
        );
      }
    }
  };

  const getStepIndicator = () => {
    if (phase === 'intro' || phase === 'terminal1') return 'TERMINAL 1/2';
    if (phase === 'terminal2') return 'TERMINAL 2/2';
    return '';
  };

  const handleInput = (input: string) => {
    setLineData((prev) => [
      ...prev,
      <TerminalOutputWithClassName key={`cmd-${Date.now()}`} className="text-green-500">
        {`$ ${input}`}
      </TerminalOutputWithClassName>,
    ]);

    const normalizedInput = input.toLowerCase().trim();

    if (
      normalizedInput === 'where is jody vernon' ||
      normalizedInput === '#whereisjodyvernon'
    ) {
      if (showMobileSecretModal) setShowMobileSecretModal(false);
      if (introIntervalRef.current) {
        clearInterval(introIntervalRef.current);
        introIntervalRef.current = null;
      }
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`access-granted-${Date.now()}`} className="text-green-500">
          {'Access Granted.'}
        </TerminalOutputWithClassName>,
      ]);
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`authenticating-${Date.now()}`} className="text-green-500">
          {'authenticating...'}
        </TerminalOutputWithClassName>,
      ]);
      setIsAccessGranted(true);
      setIsIntroComplete(true);
      // Transition directly to terminal2 (email capture) - avoids React effect ordering stalls
      setPhase('terminal2');
      return;
    }

    if (!isIntroComplete && !isAccessGranted) return;

    setAttemptCount((prev) => prev + 1);

    if (attemptCount === 0) {
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`err1-${Date.now()}`} className="text-green-500">
          {"You weren't ready. But we'll give you one more shot."}
        </TerminalOutputWithClassName>,
      ]);
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`err2-${Date.now()}`} className="text-green-500">
          {'You saw it. You heard it. Try again.'}
        </TerminalOutputWithClassName>,
      ]);
      setIsSecondAttempt(true);
    } else {
      setLineData((prev) => [
        ...prev,
        <TerminalOutputWithClassName key={`err3-${Date.now()}`} className="text-green-500">
          {"Most never make it. You're welcome to try again tomorrow."}
        </TerminalOutputWithClassName>,
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

  useEffect(() => {
    if (isDownloading) {
      setLineData((prev) => {
        const newData = [...prev];
        const lastLine = newData[newData.length - 1];
        const bar = `_[${downloadProgress}%] ${'█'.repeat(Math.floor(downloadProgress / 5))}${'░'.repeat(20 - Math.floor(downloadProgress / 5))}`;
        const barEl = (
          <TerminalOutputWithClassName key={`progress-${downloadProgress}-${Date.now()}`} className="text-green-500">
            {bar}
          </TerminalOutputWithClassName>
        );
        const lastChild =
          lastLine && React.isValidElement<{ children?: React.ReactNode }>(lastLine)
            ? String(lastLine.props.children ?? '')
            : '';
        if (lastChild.includes('_')) {
          newData[newData.length - 1] = barEl;
        } else {
          newData.push(barEl);
        }
        return newData;
      });
    }
  }, [downloadProgress, isDownloading]);

  if (phase === 'lightning') {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          backgroundColor: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1
            style={{
              fontSize: '3rem',
              marginBottom: '2rem',
              color: '#00ff00',
            }}
          >
            THE AGNES PROTOCOL
          </h1>
          <div style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>
            <p style={{ color: '#ffff00', marginBottom: '1rem' }}>
              ⚡ FORGING THE BOOK ⚡
            </p>
            <div
              style={{
                border: '2px solid #00ff00',
                padding: '2rem',
                borderRadius: '8px',
                maxWidth: '600px',
                margin: '0 auto',
              }}
            >
              <p style={{ marginBottom: '1rem' }}>The book is being forged...</p>
              <p style={{ color: '#00ff00' }}>Your access has been granted.</p>
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
        className={`terminal-container ${phase === 'terminal2' ? 'terminal2-root' : ''}`}
        style={{
          width: '100%',
          height: '100vh',
          display: showEmailModal ? 'none' : 'block',
          pointerEvents:
            isMobile && showMobileSecretModal ? 'none' : 'auto',
        }}
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

      <MobileInputModal
        isOpen={showMobileSecretModal}
        prompt="Enter the secret code"
        placeholder="Hint: It starts with '#where'"
        onSubmit={handleMobileSecretSubmit}
        inputType="text"
        autoFocus={true}
      />

      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onEmailSubmitted={handleEmailSubmitted}
      />

      {!showEmailModal && (
        <JodyAssistantTerminal variant="em1" autoShowDelayMs={4000} />
      )}

      {isMobile && !showEmailModal && (
        <div className="mobile-terminal-action-bar">
          <div className="mobile-terminal-progress">
            {getStepIndicator()}
          </div>
          <div className="mobile-terminal-actions">
            <button
              type="button"
              onClick={handleNextClick}
              className="mobile-terminal-next-btn"
              aria-label="Next"
            >
              NEXT
            </button>
            <button
              type="button"
              onClick={() => setSimpleMode(!simpleMode)}
              className="mobile-terminal-simple-toggle"
              aria-label="Toggle Simple Mode"
              title={simpleMode ? 'Show full terminal' : 'Show simplified view'}
            >
              {simpleMode ? 'FULL' : 'SIMPLE'}
            </button>
          </div>
        </div>
      )}

      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'fixed',
            right: 8,
            bottom: 8,
            zIndex: 99999,
            background: '#111',
            color: '#0f0',
            padding: '4px 6px',
            fontFamily: 'monospace',
            fontSize: 12,
            border: '1px solid #0f0',
            borderRadius: 6,
          }}
        >
          agnes-next • /terminal
        </div>
      )}
    </>
  );
}
