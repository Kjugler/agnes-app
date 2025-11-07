'use client';

import React, { useEffect, useState } from 'react';
import { startCheckout } from '@/lib/checkout';

export default function SampleChaptersPage() {
  const [current, setCurrent] = useState(0);

  const buttons = [
    {
      id: 'btn1',
      label: 'Read Chapter 1',
      text: 'Starts off running.',
      link: '/chapters/chapter1.pdf',
    },
    {
      id: 'btn2',
      label: 'Read Chapter 2',
      text: 'Fred enters the scene – Agnes already doesn’t like him.',
      link: '/chapters/chapter2.pdf',
    },
    {
      id: 'btn3',
      label: 'Read Chapter 9',
      text: 'Meet Matt and Reese – straight from the orphanage.',
      link: '/chapters/chapter9.pdf',
    },
    {
      id: 'btn4',
      label: 'Read Chapter 45',
      text: 'Fred and Jody – always two steps ahead.',
      link: '/chapters/chapter45.pdf',
    },
    {
      id: 'btn5',
      label: 'Buy the Book',
      text: 'Enjoy the adventure – you’re already living the reality.',
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % buttons.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleBuy = async () => {
    try {
      await startCheckout({
        source: 'sample_chapters',
        successPath: '/contest/thank-you',
        cancelPath: '/sample-chapters',
      });
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'An error occurred. Please try again.');
    }
  };

  return (
    <div
      className="sample-wrap"
      data-has-test-banner
      style={{
        backgroundColor: 'black',
        color: '#00ffe5',
        fontFamily: '"Courier New", Courier, monospace',
        margin: 0,
        padding: 0,
        textAlign: 'center',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginTop: '20px', fontSize: '1.6em' }}>
        Explore Sample Chapters from <em>The Agnes Protocol</em>
      </h1>

      {/* VIDEOS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '30px',
          marginTop: '30px',
          flexWrap: 'wrap',
        }}
      >
        <iframe
          src="https://www.youtube.com/embed/qj9H74Qy4HM"
          title="Kris Video"
          frameBorder="0"
          allowFullScreen
          style={{
            width: '300px',
            height: '170px',
            border: '2px solid #00ff00',
          }}
        />
        <iframe
          src="https://www.youtube.com/embed/Rp1C4kokLdE"
          title="Beach Video"
          frameBorder="0"
          allowFullScreen
          style={{
            width: '300px',
            height: '170px',
            border: '2px solid #00ff00',
          }}
        />
      </div>

      {/* CHAPTER BUTTONS */}
      <div
        style={{
          margin: '40px auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '18px',
        }}
      >
        {buttons.slice(0, 4).map((btn, index) => (
          <div
            key={btn.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              justifyContent: 'center',
            }}
          >
            <a
              href={btn.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '12px 24px',
                border: '2px solid #00ff00',
                color: current === index ? 'black' : '#00ffe5',
                backgroundColor: current === index ? '#00ff00' : 'black',
                textDecoration: 'none',
                animation: current === index ? 'pulse 1.5s infinite' : 'none',
              }}
            >
              {btn.label}
              {current === index && (
                <span style={{ marginLeft: '12px', fontSize: '1.2em' }}>👉</span>
              )}
            </a>
            {current === index && (
              <span
                style={{
                  color: '#00ff00',
                  fontSize: '0.95em',
                  fontStyle: 'italic',
                  maxWidth: '250px',
                  textAlign: 'left',
                }}
              >
                {btn.text}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* CTA BUTTONS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '30px',
          flexWrap: 'wrap',
        }}
      >
        <a
          id="btn5"
          onClick={handleBuy}
          style={{
            padding: '12px 24px',
            border: '2px solid #00ffe5',
            color: current === 4 ? 'black' : '#00ffe5',
            backgroundColor: current === 4 ? '#00ffe5' : 'black',
            textDecoration: 'none',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: '0 0 12px #00ffe5',
          }}
        >
          {buttons[4].label}
          {current === 4 && (
            <span style={{ marginLeft: '12px', fontSize: '1.2em' }}>👉</span>
          )}
        </a>

        <a
          href="/contest"
          style={{
            padding: '12px 24px',
            border: '2px solid #00ffe5',
            color: '#00ffe5',
            textDecoration: 'none',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            backgroundColor: 'black',
            boxShadow: '0 0 12px #00ffe5',
          }}
        >
          Go Back
        </a>
      </div>

      {/* PULSE KEYFRAMES */}
      <style jsx>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 10px #00ff00;
          }
          50% {
            box-shadow: 0 0 20px #00ff00;
          }
          100% {
            box-shadow: 0 0 10px #00ff00;
          }
        }
      `}</style>

      {/* FOOTER */}
      <footer
        style={{
          textAlign: 'center',
          marginTop: '40px',
          fontSize: '0.9rem',
          color: '#00ff00',
        }}
      >
        <p>© 2025 DeepQuill LLC – All Rights Reserved</p>
        <p>
          Contact:{' '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff00' }}>
            hello@theagnesprotocol.com
          </a>
        </p>
        <p>All purchases are final. Contact us with any issues.</p>
      </footer>
    </div>
  );
}
