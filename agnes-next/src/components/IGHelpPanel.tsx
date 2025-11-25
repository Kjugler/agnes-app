'use client';

import { useState } from 'react';
import { IGHelpStep } from './IGHelpStep';

export function IGHelpPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const steps = [
    {
      number: 1,
      title: 'Open Instagram & start a new post',
      description: 'Open the Instagram app on your phone. Tap the "+" button at the bottom center, then select "Reel" or "Post".',
      images: ['/images/ig-help/step1-open-instagram.png'],
    },
    {
      number: 2,
      title: 'Select your downloaded video',
      description: 'Tap "Gallery" or "Library" to find the video you downloaded. Select the Agnes Protocol video file.',
      images: [
        '/images/ig-help/step2-create-post.png',
        '/images/ig-help/step2-select-video.png',
      ],
    },
    {
      number: 3,
      title: 'Adjust cover & trim',
      description: 'Choose a cover frame for your reel (the thumbnail). You can also trim the video if needed. Tap "Next" when ready.',
      images: ['/images/ig-help/step3-cover-and-trim.png'],
    },
    {
      number: 4,
      title: 'Paste your caption',
      description: 'Tap the caption area at the bottom. Paste the caption you copied earlier. Make sure to include your referral code!',
      images: ['/images/ig-help/step4-paste-caption.png'],
    },
    {
      number: 5,
      title: 'Press Share',
      description: 'Review your post one more time. When everything looks good, tap "Share" to publish your reel.',
      images: ['/images/ig-help/step5-share-reel.png'],
    },
    {
      number: 6,
      title: 'Return & click "I posted"',
      description: 'After your post is live, come back to this page and click the "I posted to Instagram" button to earn your points!',
      images: ['/images/ig-help/step6-confirm-post.png'],
    },
  ];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 640,
        marginTop: '3rem',
        marginBottom: '2rem',
        background: 'rgba(15, 15, 36, 0.9)',
        border: '1px solid rgba(178, 107, 255, 0.3)',
        borderRadius: '16px',
        padding: 'clamp(1rem, 4vw, 1.5rem)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: 'clamp(0.875rem, 3vw, 1rem) clamp(1rem, 4vw, 1.5rem)',
          borderRadius: '12px',
          border: 'none',
          background: isOpen
            ? 'linear-gradient(135deg, #b26bff 0%, #8b5cf6 100%)'
            : 'rgba(178, 107, 255, 0.1)',
          color: 'white',
          fontSize: 'clamp(1rem, 3vw, 1.1rem)',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.3s ease',
          boxShadow: isOpen
            ? '0 0 20px rgba(178, 107, 255, 0.4)'
            : 'none',
          textAlign: 'left',
        }}
        aria-expanded={isOpen}
        aria-controls="ig-help-steps"
      >
        <span>How do I post this on Instagram?</span>
        <span
          style={{
            fontSize: '1.5rem',
            transition: 'transform 0.3s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </button>

      {/* Steps Container */}
      {isOpen && (
        <div
          id="ig-help-steps"
          role="region"
          aria-label="Instagram posting instructions"
          style={{
            marginTop: '2rem',
            paddingTop: '2rem',
            borderTop: '1px solid rgba(178, 107, 255, 0.2)',
          }}
        >
          {steps.map((step) => (
            <IGHelpStep
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
              images={step.images}
            />
          ))}
        </div>
      )}
    </div>
  );
}

