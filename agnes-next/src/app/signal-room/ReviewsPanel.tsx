'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReviewComposer from './ReviewComposer';

type ReviewData = {
  id: string;
  rating: number;
  text: string;
  tags: string[] | null;
  createdAt: Date | string;
  userEmail: string;
  userFirstName: string | null;
};

type SummaryData = {
  count: number;
  isStable: boolean;
  average: number | null;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
};

type ReviewsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const reviewDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - reviewDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return reviewDate.toLocaleDateString();
}

function getDisplayName(review: { userFirstName: string | null; userEmail: string }): string {
  if (review.userFirstName) return review.userFirstName;
  const [username] = review.userEmail.split('@');
  return username;
}

export default function ReviewsPanel({ isOpen, onClose }: ReviewsPanelProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const reviewsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, listRes] = await Promise.all([
        fetch('/api/reviews/summary'),
        fetch('/api/reviews/list?take=50'),
      ]);

      const summaryData = await summaryRes.json();
      const listData = await listRes.json();

      if (summaryData.ok) {
        setSummary(summaryData);
      }
      if (listData.ok) {
        setReviews(listData.reviews || []);
      }
    } catch (err) {
      console.error('[ReviewsPanel] Load error', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshReviews = async () => {
    await loadData();
    // Scroll to top
    if (reviewsListRef.current) {
      reviewsListRef.current.scrollTop = 0;
    }
    // Show success message
    setShowSuccessMessage(true);
    setTimeout(() => {
      setShowSuccessMessage(false);
    }, 3000);
  };

  const handleReviewSubmitted = () => {
    refreshReviews(); // Refresh data after review submission
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 999,
        }}
      />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '90%',
          maxWidth: '500px',
          backgroundColor: '#0a0e27',
          borderLeft: '1px solid #1a1f3a',
          color: '#e0e0e0',
          fontFamily: '"Courier New", monospace',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid #1a1f3a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '1.5em',
              color: '#00ffe0',
              margin: 0,
            }}
          >
            Reviews
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            padding: '1.5rem',
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <div style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading...</div>
          ) : (
            <>
              {/* Summary */}
              {summary && (
                <div
                  style={{
                    backgroundColor: '#14192e',
                    border: '1px solid #1a1f3a',
                    borderRadius: '4px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  {summary.isStable ? (
                    <>
                      <div
                        style={{
                          fontSize: '1.5em',
                          fontWeight: 'bold',
                          color: '#00ffe0',
                          marginBottom: '0.5rem',
                        }}
                      >
                        {summary.average?.toFixed(1)} ⭐
                      </div>
                      <div
                        style={{
                          fontSize: '0.9em',
                          color: '#888',
                          marginBottom: '0.5rem',
                        }}
                      >
                        Based on {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
                      </div>
                      <div
                        style={{
                          fontSize: '0.85em',
                          color: '#666',
                        }}
                      >
                        {summary.distribution[5]} five • {summary.distribution[4]} four • {summary.distribution[3]} three •{' '}
                        {summary.distribution[2]} two • {summary.distribution[1]} one
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        color: '#888',
                        fontSize: '0.9em',
                        textAlign: 'center',
                        padding: '1rem',
                      }}
                    >
                      Early signal forming…
                    </div>
                  )}
                </div>
              )}

              {/* Write Review Button */}
              <button
                onClick={() => setIsComposerOpen(true)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#00ffe0',
                  border: '1px solid #00ffe0',
                  borderRadius: '4px',
                  color: '#000',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '0.9em',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  marginBottom: '1.5rem',
                }}
              >
                Write a Review
              </button>

              {/* Success Message */}
              {showSuccessMessage && (
                <div
                  style={{
                    backgroundColor: '#0a4a2a',
                    border: '1px solid rgba(0,255,224,0.5)',
                    borderRadius: '4px',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    color: '#00ffe0',
                    fontSize: '0.9em',
                    textAlign: 'center',
                  }}
                >
                  ✓ Review saved
                </div>
              )}

              {/* Reviews List */}
              <div
                ref={reviewsListRef}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                {reviews.length === 0 ? (
                  <div
                    style={{
                      color: '#888',
                      textAlign: 'center',
                      padding: '2rem',
                      fontSize: '0.9em',
                    }}
                  >
                    No reviews yet. Be the first!
                  </div>
                ) : (
                  reviews.map((review) => {
                    const displayName = getDisplayName(review);
                    return (
                      <div
                        key={review.id}
                        style={{
                          backgroundColor: '#14192e',
                          border: '1px solid #1a1f3a',
                          borderRadius: '4px',
                          padding: '1rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <div
                            style={{
                              color: '#ffcc00',
                              fontSize: '0.9em',
                              fontWeight: 'bold',
                            }}
                          >
                            {displayName}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span
                              style={{
                                color: '#ffcc00',
                                fontSize: '1em',
                              }}
                            >
                              {'★'.repeat(review.rating)}
                            </span>
                            <span
                              style={{
                                color: '#666',
                                fontSize: '0.75em',
                                marginLeft: '0.25rem',
                              }}
                            >
                              {formatRelativeTime(review.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            color: '#e0e0e0',
                            fontSize: '0.9em',
                            lineHeight: '1.5',
                          }}
                        >
                          {review.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Review Composer Modal */}
      <ReviewComposer
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onSubmitted={handleReviewSubmitted}
      />
    </>
  );
}

