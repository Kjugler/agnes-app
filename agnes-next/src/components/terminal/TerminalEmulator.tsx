'use client';

import React, { useState, useEffect, useRef } from 'react';
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui';
import EmailModal from './EmailModal';
import JodyAssistantTerminal, { JodyMobilePeekStrip } from './JodyAssistantTerminal';
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

const TERMINAL_MOBILE_DEBUG = process.env.NEXT_PUBLIC_TERMINAL_MOBILE_DEBUG === '1';

function logTerminalMobile(message: string, data?: Record<string, unknown>) {
  if (TERMINAL_MOBILE_DEBUG) {
    console.log('[TERMINAL_MOBILE]', message, data ?? {});
  }
}

/** Real typing element from react-terminal-ui (not the prompt line div). */
function getTerminalHiddenInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.terminal-hidden-input');
}

/**
 * iOS Safari: focus in a direct user gesture; readOnly flip helps *initial* keyboard open only.
 * Never run readOnly=true while the field already has focus — it blocks the software keyboard
 * (no character echo, Enter submits empty) if the user scrolls/taps the terminal while typing.
 */
function focusTerminalHiddenInput(
  fromUserGesture: boolean,
  onIosFocusComplete?: (active: boolean) => void
): boolean {
  const el = getTerminalHiddenInput();
  if (!el) {
    logTerminalMobile('focus:no-input', { fromUserGesture });
    return false;
  }
  const isIOS =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const alreadyFocused = document.activeElement === el;

  try {
    logTerminalMobile('focus:attempt', { fromUserGesture, alreadyFocused });
    if (fromUserGesture && isIOS && alreadyFocused) {
      el.focus({ preventScroll: true });
      onIosFocusComplete?.(true);
      return true;
    }
    if (fromUserGesture && isIOS && !alreadyFocused) {
      el.readOnly = true;
      el.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        el.readOnly = false;
        el.focus({ preventScroll: true });
        const active = document.activeElement === el;
        logTerminalMobile('focus:ios-readonly-toggle', { active });
        onIosFocusComplete?.(active);
        window.setTimeout(() => {
          if (el.readOnly) {
            el.readOnly = false;
            logTerminalMobile('focus:ios-readonly-safety-clear', {});
          }
        }, 200);
      });
      return true;
    }
    el.focus({ preventScroll: true });
    const active = document.activeElement === el;
    logTerminalMobile('focus:direct', { active });
    onIosFocusComplete?.(active);
    return active;
  } catch (e) {
    logTerminalMobile('focus:error', { err: String(e) });
    el.readOnly = false;
    return false;
  }
}

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
  const [keyboardAssistUsed, setKeyboardAssistUsed] = useState(false);
  /** Hidden input focused or user typed in terminal — assist stays until this is true (then re-open only after reset). */
  const [terminalKeyboardSatisfied, setTerminalKeyboardSatisfied] = useState(false);

  const introIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const downloadIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  /** Once we detect real mobile/iOS, keep mobile chrome for the session (avoids assist/bar vanishing on resize/UA quirks). */
  const mobileLatchedRef = useRef(false);

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
      const isIOS =
        typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isMobileDevice = forceMobile || isCoarsePointer || isSmallViewport;

      if (isMobileDevice || isIOS) {
        mobileLatchedRef.current = true;
      }
      const effectiveMobile = mobileLatchedRef.current;

      setIsMobile(effectiveMobile);

      if (TERMINAL_MOBILE_DEBUG) {
        logTerminalMobile('device-check', {
          forceMobile,
          isCoarsePointer,
          isSmallViewport,
          isMobileDevice,
          isIOS,
          effectiveMobile,
          latched: mobileLatchedRef.current,
          innerWidth: viewportWidth,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 120) : '',
        });
      }

      if (typeof document !== 'undefined') {
        document.body.classList.toggle('mobile-terminal', effectiveMobile);
        document.body.classList.toggle('simple-mode', simpleMode && effectiveMobile);
      }

      // Do not auto-open secret modal when intro completes — keeps Jody + terminal typing primary;
      // user can open the modal from NEXT if they prefer that path.
      if (!effectiveMobile || isAccessGranted) {
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

  /** iOS often focuses the hidden input programmatically without opening the keyboard; never mark "satisfied" from focusin alone. */
  const markAssistSatisfiedFromUserFocus = (active: boolean) => {
    if (active) {
      setTerminalKeyboardSatisfied(true);
      logTerminalMobile('assist:keyboard-satisfied', { reason: 'user-gesture-focus' });
    }
  };

  useEffect(() => {
    if (!TERMINAL_MOBILE_DEBUG) return;
    const typingBlockedByOverlay = showMobileSecretModal || showEmailModal;
    const typingNotRequired =
      phase === 'lightning' || (phase === 'terminal2' && isDownloading);
    const assistWouldShow =
      isMobile &&
      !showEmailModal &&
      !showMobileSecretModal &&
      !(phase === 'terminal2' && isDownloading) &&
      !terminalKeyboardSatisfied;
    let hideReason = '';
    if (!isMobile) hideReason = 'not-mobile';
    else if (showEmailModal) hideReason = 'email-modal';
    else if (showMobileSecretModal) hideReason = 'secret-modal';
    else if (phase === 'terminal2' && isDownloading) hideReason = 'terminal2-downloading';
    else if (terminalKeyboardSatisfied) hideReason = 'keyboard-satisfied';
    logTerminalMobile('assist:state', {
      assistVisible: assistWouldShow,
      assistHiddenReason: assistWouldShow ? undefined : hideReason,
      phase,
      typingBlockedByOverlay,
      typingNotRequired,
      hiddenInputInDom: typeof document !== 'undefined' ? !!getTerminalHiddenInput() : false,
    });
  }, [
    isMobile,
    showEmailModal,
    showMobileSecretModal,
    phase,
    isDownloading,
    terminalKeyboardSatisfied,
  ]);

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
    let attempts = 0;
    const maxAttempts = 5;
    const tryFocus = () => {
      const ok = focusTerminalHiddenInput(false);
      logTerminalMobile('mount-focus-attempt', { attempt: attempts + 1, ok });
      if (ok || attempts >= maxAttempts) return;
      attempts++;
      setTimeout(tryFocus, 200);
    };

    tryFocus();
  }, []);

  /**
   * As soon as the intro finishes and the $ line is asking for the secret, try to raise the keyboard.
   * This matches the product intent (input is expected immediately; Jody is extra help).
   * iOS Safari often ignores programmatic focus until the user taps once — assist / tap-on-terminal stay the fallback.
   */
  useEffect(() => {
    if (!isIntroComplete || isAccessGranted || phase !== 'intro') return;
    if (showMobileSecretModal) return;

    let attempts = 0;
    const maxAttempts = 15;
    const interval = window.setInterval(() => {
      attempts += 1;
      focusTerminalHiddenInput(false);
      logTerminalMobile('prompt-ready-focus', {
        attempt: attempts,
        phase: phaseRef.current,
      });
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [isIntroComplete, isAccessGranted, phase, showMobileSecretModal]);

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
      const input = getTerminalHiddenInput();
      if (input) {
        focusTerminalHiddenInput(true, markAssistSatisfiedFromUserFocus);
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
    if (input.length > 0) {
      setTerminalKeyboardSatisfied((prev) => {
        if (!prev) {
          logTerminalMobile('assist:keyboard-satisfied', {
            reason: 'first-char-typed',
            phase: phaseRef.current,
          });
        }
        return true;
      });
    }

    setLineData((prev) => [
      ...prev,
      <TerminalOutputWithClassName key={`cmd-${Date.now()}`} className="text-green-500">
        {`$ ${input}`}
      </TerminalOutputWithClassName>,
    ]);

    const normalizedInput = input.toLowerCase().trim();
    const secretNoHash = normalizedInput.startsWith('#')
      ? normalizedInput.slice(1)
      : normalizedInput;

    if (
      normalizedInput === 'where is jody vernon' ||
      normalizedInput === '#whereisjodyvernon' ||
      secretNoHash === 'whereisjodyvernon'
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
        setTerminalKeyboardSatisfied(false);
        logTerminalMobile('assist:reset', { reason: 'intro-retry-after-fail' });
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

  const terminalShell = (
    <div
      ref={terminalContainerRef}
      className={`terminal-container ${phase === 'terminal2' ? 'terminal2-root' : ''}`}
      style={{
        width: '100%',
        height: isMobile && !showEmailModal ? '100%' : '100vh',
        flex: isMobile && !showEmailModal ? '1 1 auto' : undefined,
        minHeight: isMobile && !showEmailModal ? 0 : undefined,
        display: showEmailModal ? 'none' : 'block',
        pointerEvents: isMobile && showMobileSecretModal ? 'none' : 'auto',
      }}
      onPointerDownCapture={(e) => {
        if (!isMobile || showEmailModal || showMobileSecretModal) return;
        const target = e.target as HTMLElement;
        if (target.closest?.('.jody-assistant-container')) return;
        const inputEl = getTerminalHiddenInput();
        if (inputEl && document.activeElement === inputEl) {
          return;
        }
        focusTerminalHiddenInput(true, (active) => {
          markAssistSatisfiedFromUserFocus(active);
          logTerminalMobile('container-tap-focus', {
            succeeded: active,
            phase: phaseRef.current,
            hiddenInputFound: !!getTerminalHiddenInput(),
          });
        });
      }}
    >
      <Terminal
        name="THE CONTROL ROOM"
        colorMode={ColorMode.Dark}
        onInput={handleInput}
        prompt="$"
        height={isMobile && !showEmailModal ? '100%' : '100vh'}
      >
        {lineData}
      </Terminal>
    </div>
  );

  return (
    <>
      {isMobile && !showEmailModal ? (
        <div className="mobile-terminal-scroll-root">
          <div className="mobile-terminal-first-screen">
            {terminalShell}
            <JodyMobilePeekStrip variant="em1" />
          </div>
          <JodyAssistantTerminal variant="em1" layoutMode="inline-mobile" />
        </div>
      ) : (
        terminalShell
      )}

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

      {/* Desktop / tablet: fixed bottom-right Jody. Mobile: inline scroll layout above. */}
      {!showEmailModal && !isMobile && (
        <JodyAssistantTerminal variant="em1" appearDelayMs={2000} />
      )}

      {/* z-index 10020: above action bar (10000), below secret modal (200000). Shown until user-gesture focus works or first char typed. */}
      {isMobile &&
        !showEmailModal &&
        !showMobileSecretModal &&
        !(phase === 'terminal2' && isDownloading) &&
        !terminalKeyboardSatisfied && (
          <div className="mobile-terminal-keyboard-assist">
            <button
              type="button"
              className="mobile-terminal-keyboard-assist-btn"
              aria-label="Open keyboard for terminal input"
              onClick={() => {
                setKeyboardAssistUsed(true);
                focusTerminalHiddenInput(true, (active) => {
                  markAssistSatisfiedFromUserFocus(active);
                  logTerminalMobile('keyboard-assist-tap', {
                    focusSucceeded: active,
                    phase: phaseRef.current,
                  });
                });
              }}
            >
              Tap to open keyboard
            </button>
          </div>
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

      {(process.env.NODE_ENV === 'development' || TERMINAL_MOBILE_DEBUG) && (
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
            fontSize: 11,
            border: '1px solid #0f0',
            borderRadius: 6,
            maxWidth: 'min(92vw, 280px)',
            wordBreak: 'break-all',
          }}
        >
          {TERMINAL_MOBILE_DEBUG
            ? `m:${isMobile ? '1' : '0'} sec:${showMobileSecretModal ? '1' : '0'} em:${showEmailModal ? '1' : '0'} sat:${terminalKeyboardSatisfied ? '1' : '0'} key:${keyboardAssistUsed ? '1' : '0'}`
            : 'agnes-next • /terminal'}
        </div>
      )}
    </>
  );
}
