// deepquill/src/api/TerminalEmulator.jsx
import React, { useState, useEffect, useRef } from 'react';
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui';
import EmailModal from './EmailModal';
import './TerminalEmulator.css';
import { subscribeEmail } from '../api/subscribeEmail';

const TerminalEmulator = () => {
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
            {"Hint: It starts with 'Where'"}
          </TerminalOutput>,
        ]);
      }
    }, 1000);
    introIntervalRef.current = intervalId;
  };

  // download animation -> then show email modal
  useEffect(() => {
    if (isAccessGranted) {
      console.log('[TerminalEmulator] Access granted, starting download animation');
      setIsDownloading(true);
      setDownloadProgress(0); // Reset progress
      const downloadInterval = setInterval(() => {
        setDownloadProgress(prev => {
          const next = prev + 1;
          if (next >= 100) {
            console.log('[TerminalEmulator] Download complete, showing email modal');
            clearInterval(downloadInterval);
            setIsDownloading(false);
            setShowEmailModal(true);
            return 100;
          }
          return next;
        });
      }, 50);
      return () => {
        console.log('[TerminalEmulator] Cleaning up download interval');
        clearInterval(downloadInterval);
      };
    }
  }, [isAccessGranted]);

  // intro run once
  useEffect(() => {
    runIntroAnimation();
    return () => {
      if (introIntervalRef.current) clearInterval(introIntervalRef.current);
    };
  }, []);

  // NEW: email submit handler (component scope)
  async function handleEmailSubmit(email) {
    setEmailError('');
    setEmailSubmitting(true);
    try {
      const res = await subscribeEmail(email, { apiBase: 'http://localhost:5055' });
      if (res?.ok) {
        setShowEmailModal(false);
        // go to next step
        window.location.href = '/lightening'; // change if your next route differs
        return;
      }
      setEmailError(res?.error || 'Could not subscribe. Please try again.');
    } catch (err) {
      setEmailError(err.message || 'Network error. Please try again.');
    } finally {
      setEmailSubmitting(false);
    }
  }

  const handleInput = (input) => {
    // echo the command
    setLineData(prev => [
      ...prev,
      <TerminalOutput key={`cmd-${Date.now()}`} className="text-green-500">
        {`$ ${input}`}
      </TerminalOutput>,
    ]);

    if (!isIntroComplete && !isAccessGranted) return;

    const normalizedInput = input.toLowerCase().trim();
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
      console.log('[TerminalEmulator] Setting isAccessGranted to true');
    } else {
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

  return (
    <>
      <div className="terminal-container" style={{ width: '100%', height: '100vh' }}>
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
        console.log('[TerminalEmulator] Render - showEmailModal:', showEmailModal);
        return null;
      })()}
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => {
          console.log('[TerminalEmulator] EmailModal onClose called');
          setShowEmailModal(false);
        }}
      />
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
