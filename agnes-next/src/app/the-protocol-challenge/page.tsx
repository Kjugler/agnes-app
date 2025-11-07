'use client';

import React, { useEffect, useState } from 'react';

export default function ProtocolChallengePage() {
  const [signupUrl, setSignupUrl] = useState('/contest/signup');

  useEffect(() => {
    // Build signup URL with current path and query params preserved
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const currentQuery = window.location.search;
      const fromParam = encodeURIComponent(`${currentPath}${currentQuery}`);
      setSignupUrl(`/contest/signup?from=${fromParam}`);
    }
  }, []);

  return (
    <div
      style={{
        backgroundColor: 'black',
        color: '#00ffe0',
        fontFamily: '"Courier New", monospace',
        textAlign: 'center',
        margin: 0,
        minHeight: '100vh',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <h1 style={{ fontSize: '1.8em', marginTop: '30px' }}>
        Begin the Protocol Challenge –<br />
        6 Days. 5 Nights. All-Inclusive Family Cruise!
      </h1>

      <a href={signupUrl} className="glitch-button">
        ENTER CONTEST
      </a>

      <br />

      <iframe
        src="https://www.youtube.com/embed/Q8pVd_XhiTE"
        frameBorder="0"
        allowFullScreen
        style={{
          width: '90%',
          maxWidth: '900px',
          height: '506px',
          marginTop: '30px',
        }}
      />

      <div
        style={{
          width: '100%',
          backgroundColor: 'red',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '16px',
          position: 'fixed',
          bottom: 0,
          padding: '5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            animation: 'scroll-left 25s linear infinite',
          }}
        >
          Agnes Protocol tops banned book list — again. ⚡ Tiana M. just earned 3,450 points. ⚡ Nate R. entered the
          contest from Tucson. ⚡
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        @keyframes glitch {
          0% {
            transform: translate(0);
          }
          20% {
            transform: translate(-2px, 2px);
          }
          40% {
            transform: translate(2px, -2px);
          }
          60% {
            transform: translate(-1px, 1px);
          }
          80% {
            transform: translate(1px, -1px);
          }
          100% {
            transform: translate(0);
          }
        }

        .glitch-button {
          border: 2px solid #00ffe0;
          padding: 10px 20px;
          font-size: 1em;
          color: red;
          text-shadow: 0 0 2px red;
          background: black;
          margin: 20px auto;
          display: inline-block;
          cursor: pointer;
          text-decoration: none;
          animation: glitch 0.3s infinite;
        }

        .glitch-button:hover {
          animation: none;
          color: #00ffe0;
          background-color: #111;
          box-shadow: 0 0 12px #00ffe0, 0 0 24px #00ffe0;
          text-shadow: 0 0 6px #00ffe0;
          transition: all 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
