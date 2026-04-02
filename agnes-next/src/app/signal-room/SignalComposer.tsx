'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validateDocumentPasteUrl } from '@/lib/signalDocumentUrl';

type SignalComposerProps = {
  isOpen: boolean;
  onClose: () => void;
};

type SubmitState = 'idle' | 'submitting' | 'approved' | 'held' | 'error';

type MediaTypeOption = 'none' | 'video' | 'image' | 'document';
type AttachMode = 'upload' | 'url';

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

function documentExtForMime(mime: string): string | null {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return null;
}

function isValidMediaUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function SignalComposer({ isOpen, onClose }: SignalComposerProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [mediaType, setMediaType] = useState<MediaTypeOption>('none');
  /** Shared by Video and Document rows (upload vs paste link). */
  const [attachMode, setAttachMode] = useState<AttachMode>('upload');
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setText('');
      setMediaType('none');
      setAttachMode('upload');
      setMediaUrl('');
      setUploadProgress(null);
      setSubmitState('idle');
      setError(null);
    }
  }, [isOpen]);

  const handleVideoFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      setError('Use MP4 or WebM only.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Video must be 80 MB or smaller.');
      return;
    }
    setUploadProgress(0);
    try {
      const ctx = await fetch('/api/signal/upload-context');
      const ctxJson = await ctx.json().catch(() => ({}));
      if (!ctx.ok) {
        throw new Error(
          ctxJson.error === 'UNAUTHORIZED' ? 'Sign in to upload video.' : 'Could not start upload.'
        );
      }
      const userId = ctxJson.userId as string;
      const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
      const pathname = `signals/${userId}/${crypto.randomUUID()}.${ext}`;
      const { upload } = await import('@vercel/blob/client');
      const result = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/signal/media-upload',
        multipart: file.size > 4 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploadProgress(percentage),
      });
      setMediaUrl(result.url);
      setUploadProgress(100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setUploadProgress(null);
    } finally {
      window.setTimeout(() => setUploadProgress(null), 600);
    }
  };

  const handleDocumentFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    const allowedMime = new Set<string>(ALLOWED_DOCUMENT_TYPES);
    if (!allowedMime.has(file.type)) {
      setError('Use PDF, PNG, or JPG only.');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('File must be 50 MB or smaller.');
      return;
    }
    const ext = documentExtForMime(file.type);
    if (!ext) {
      setError('Unsupported file type.');
      return;
    }
    setUploadProgress(0);
    try {
      const ctx = await fetch('/api/signal/upload-context');
      const ctxJson = await ctx.json().catch(() => ({}));
      if (!ctx.ok) {
        throw new Error(
          ctxJson.error === 'UNAUTHORIZED' ? 'Sign in to upload documents.' : 'Could not start upload.'
        );
      }
      const userId = ctxJson.userId as string;
      const pathname = `signals/${userId}/${crypto.randomUUID()}.${ext}`;
      const { upload } = await import('@vercel/blob/client');
      const result = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/signal/media-upload',
        multipart: file.size > 4 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploadProgress(percentage),
      });
      setMediaUrl(result.url);
      setUploadProgress(100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setUploadProgress(null);
    } finally {
      window.setTimeout(() => setUploadProgress(null), 600);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate media when selected
    if (mediaType === 'image') {
      const url = mediaUrl.trim();
      if (!url) {
        setError('Please enter an image URL or choose Upload for video');
        return;
      }
      if (!isValidMediaUrl(url)) {
        setError('Media URL must start with http:// or https://');
        return;
      }
    }
    if (mediaType === 'video') {
      const url = mediaUrl.trim();
      if (!url) {
        setError(attachMode === 'upload' ? 'Upload a video file first' : 'Enter a video URL or upload a file');
        return;
      }
      if (!isValidMediaUrl(url)) {
        setError('Media URL must start with http:// or https://');
        return;
      }
    }
    if (mediaType === 'document') {
      const url = mediaUrl.trim();
      if (!url) {
        setError(attachMode === 'upload' ? 'Upload a PDF or image first' : 'Paste a direct link to a PDF or image file');
        return;
      }
      const docCheck = validateDocumentPasteUrl(url);
      if (!docCheck.ok) {
        setError(docCheck.error);
        return;
      }
    }

    setSubmitState('submitting');

    try {
      const body: Record<string, unknown> = { text: text.trim() };
      if (mediaType === 'video' || mediaType === 'image' || mediaType === 'document') {
        body.mediaType = mediaType;
        body.mediaUrl = mediaUrl.trim();
      }

      const response = await fetch('/api/signal/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create signal');
      }

      if (data.ok) {
        if (data.status === 'APPROVED') {
          setSubmitState('approved');
          setText('');
          setMediaType('none');
          setMediaUrl('');
          setAttachMode('upload');
          setUploadProgress(null);
          setTimeout(() => {
            onClose();
            router.refresh();
          }, 800);
        } else if (data.status === 'HELD') {
          setSubmitState('held');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setSubmitState('error');
    }
  };

  const textValid = text.trim().length >= 3 && text.trim().length <= 240;
  const mediaValid = (() => {
    if (mediaType === 'none') return true;
    const url = mediaUrl.trim();
    if (!url) return false;
    if (mediaType === 'document' && attachMode === 'url') {
      return validateDocumentPasteUrl(url).ok;
    }
    return isValidMediaUrl(url);
  })();
  const isValid = textValid && mediaValid;
  const uploadBusy = uploadProgress !== null && uploadProgress < 100;
  const canSubmit = isValid && submitState === 'idle' && !uploadBusy;
  const isDisabled = submitState === 'held' || submitState === 'submitting' || submitState === 'approved';

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
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#14192e',
            border: '1px solid #1a1f3a',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            color: '#e0e0e0',
            fontFamily: '"Courier New", monospace',
          }}
        >
          <h2
            style={{
              fontSize: '1.5em',
              marginBottom: '0.5rem',
              color: '#00ffe0',
            }}
          >
            Transmit a Signal
          </h2>
          <p
            style={{
              fontSize: '0.9em',
              color: '#888',
              marginBottom: '1.5rem',
            }}
          >
            Describe your experience — don't quote the book.
          </p>

          {submitState === 'approved' && (
            <div
              style={{
                backgroundColor: '#0a0e27',
                border: '1px solid rgba(0,255,224,0.25)',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  color: '#00ffe0',
                  fontSize: '1em',
                  fontWeight: 'bold',
                }}
              >
                Posted successfully
              </div>
            </div>
          )}

          {submitState === 'held' && (
            <div
              style={{
                backgroundColor: '#0a0e27',
                border: '1px solid rgba(0,255,224,0.25)',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  color: '#00ffe0',
                  fontSize: '1em',
                  fontWeight: 'bold',
                  marginBottom: '0.25rem',
                }}
              >
                Submitted for review
              </div>
              <div
                style={{
                  color: '#bbb',
                  fontSize: '0.9em',
                }}
              >
                Your signal will appear once approved.
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                backgroundColor: '#4a2a2a',
                border: '1px solid #8a4a4a',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1rem',
                color: '#ff6b6b',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder="What did it make you feel? Keep it experience-based."
              maxLength={240}
              disabled={isDisabled}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '0.75rem',
                backgroundColor: '#0a0e27',
                border: '1px solid #1a1f3a',
                borderRadius: '4px',
                color: isDisabled ? '#666' : '#e0e0e0',
                fontFamily: '"Courier New", monospace',
                fontSize: '0.95em',
                resize: 'vertical',
                marginBottom: '0.5rem',
                cursor: isDisabled ? 'not-allowed' : 'text',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.85em',
                  color: text.length > 240 ? '#ff6b6b' : '#888',
                }}
              >
                {text.length}/240
              </span>
            </div>

            {/* Media attachment */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  color: '#888',
                  fontSize: '0.85em',
                  marginBottom: '0.35rem',
                }}
              >
                Attach media (optional)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={mediaType}
                  onChange={(e) => {
                    const v = e.target.value as MediaTypeOption;
                    setMediaType(v);
                    setError(null);
                    setMediaUrl('');
                    setUploadProgress(null);
                    if (v === 'video' || v === 'document') setAttachMode('upload');
                  }}
                  disabled={isDisabled}
                  style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#0a0e27',
                    border: '1px solid #1a1f3a',
                    borderRadius: 4,
                    color: isDisabled ? '#666' : '#e0e0e0',
                    fontFamily: '"Courier New", monospace',
                    fontSize: '0.9em',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value="none">None</option>
                  <option value="image">Image (URL)</option>
                  <option value="video">Video</option>
                  <option value="document">Document (PDF / PNG / JPG)</option>
                </select>
                {mediaType === 'image' && (
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => {
                      setMediaUrl(e.target.value);
                      setError(null);
                    }}
                    placeholder="https://... (image URL)"
                    disabled={isDisabled}
                    style={{
                      flex: 1,
                      minWidth: 200,
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#0a0e27',
                      border: '1px solid #1a1f3a',
                      borderRadius: 4,
                      color: isDisabled ? '#666' : '#e0e0e0',
                      fontFamily: '"Courier New", monospace',
                      fontSize: '0.9em',
                    }}
                  />
                )}
                {mediaType === 'video' && (
                  <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          setAttachMode('upload');
                          setMediaUrl('');
                          setError(null);
                        }}
                        style={{
                          padding: '0.4rem 0.75rem',
                          backgroundColor: attachMode === 'upload' ? '#00ffe0' : '#0a0e27',
                          color: attachMode === 'upload' ? '#000' : '#e0e0e0',
                          border: '1px solid #1a1f3a',
                          borderRadius: 4,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontFamily: '"Courier New", monospace',
                          fontSize: '0.85em',
                        }}
                      >
                        Upload file
                      </button>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          setAttachMode('url');
                          setMediaUrl('');
                          setError(null);
                        }}
                        style={{
                          padding: '0.4rem 0.75rem',
                          backgroundColor: attachMode === 'url' ? '#00ffe0' : '#0a0e27',
                          color: attachMode === 'url' ? '#000' : '#e0e0e0',
                          border: '1px solid #1a1f3a',
                          borderRadius: 4,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontFamily: '"Courier New", monospace',
                          fontSize: '0.85em',
                        }}
                      >
                        Paste link
                      </button>
                    </div>
                    {attachMode === 'upload' && (
                      <>
                        <label
                          style={{
                            display: 'inline-block',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#1a1f3a',
                            border: '1px solid #2a3a4a',
                            borderRadius: 4,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '0.85em',
                            color: '#e0e0e0',
                          }}
                        >
                          Choose video (MP4 / WebM, max 80 MB)
                          <input
                            type="file"
                            accept="video/mp4,video/webm,.mp4,.webm"
                            disabled={isDisabled || uploadBusy}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              void handleVideoFile(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {uploadProgress !== null && uploadProgress < 100 && (
                          <span style={{ fontSize: '0.8em', color: '#888' }}>Uploading… {uploadProgress}%</span>
                        )}
                        {!!mediaUrl && attachMode === 'upload' && (
                          <span style={{ fontSize: '0.8em', color: '#00ffe0' }}>Video ready — send when you&apos;re done writing.</span>
                        )}
                      </>
                    )}
                    {attachMode === 'url' && (
                      <input
                        type="url"
                        value={mediaUrl}
                        onChange={(e) => {
                          setMediaUrl(e.target.value);
                          setError(null);
                        }}
                        placeholder="https://... (YouTube, Vimeo, or direct MP4)"
                        disabled={isDisabled}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          backgroundColor: '#0a0e27',
                          border: '1px solid #1a1f3a',
                          borderRadius: 4,
                          color: isDisabled ? '#666' : '#e0e0e0',
                          fontFamily: '"Courier New", monospace',
                          fontSize: '0.9em',
                        }}
                      />
                    )}
                  </div>
                )}
                {mediaType === 'document' && (
                  <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          setAttachMode('upload');
                          setMediaUrl('');
                          setError(null);
                        }}
                        style={{
                          padding: '0.4rem 0.75rem',
                          backgroundColor: attachMode === 'upload' ? '#00ffe0' : '#0a0e27',
                          color: attachMode === 'upload' ? '#000' : '#e0e0e0',
                          border: '1px solid #1a1f3a',
                          borderRadius: 4,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontFamily: '"Courier New", monospace',
                          fontSize: '0.85em',
                        }}
                      >
                        Upload file
                      </button>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          setAttachMode('url');
                          setMediaUrl('');
                          setError(null);
                        }}
                        style={{
                          padding: '0.4rem 0.75rem',
                          backgroundColor: attachMode === 'url' ? '#00ffe0' : '#0a0e27',
                          color: attachMode === 'url' ? '#000' : '#e0e0e0',
                          border: '1px solid #1a1f3a',
                          borderRadius: 4,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontFamily: '"Courier New", monospace',
                          fontSize: '0.85em',
                        }}
                      >
                        Paste link
                      </button>
                    </div>
                    {attachMode === 'upload' && (
                      <>
                        <label
                          style={{
                            display: 'inline-block',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#1a1f3a',
                            border: '1px solid #2a3a4a',
                            borderRadius: 4,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '0.85em',
                            color: '#e0e0e0',
                          }}
                        >
                          Choose file (PDF, PNG, JPG — max 50 MB)
                          <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                            disabled={isDisabled || uploadBusy}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              void handleDocumentFile(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {uploadProgress !== null && uploadProgress < 100 && (
                          <span style={{ fontSize: '0.8em', color: '#888' }}>Uploading… {uploadProgress}%</span>
                        )}
                        {!!mediaUrl && attachMode === 'upload' && (
                          <span style={{ fontSize: '0.8em', color: '#00ffe0' }}>
                            Document ready — send when you&apos;re done writing.
                          </span>
                        )}
                      </>
                    )}
                    {attachMode === 'url' && (
                      <>
                        <input
                          type="url"
                          value={mediaUrl}
                          onChange={(e) => {
                            setMediaUrl(e.target.value);
                            setError(null);
                          }}
                          placeholder="https://… direct .pdf or .png / .jpg (not Google Drive /view)"
                          disabled={isDisabled}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#0a0e27',
                            border: '1px solid #1a1f3a',
                            borderRadius: 4,
                            color: isDisabled ? '#666' : '#e0e0e0',
                            fontFamily: '"Courier New", monospace',
                            fontSize: '0.9em',
                          }}
                        />
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#888', lineHeight: 1.4 }}>
                          Paste links must point <strong>directly</strong> to a file (URL ends in .pdf, .png, .jpg). Viewer
                          pages (e.g. Google Drive “open” links) cannot be embedded — use a direct asset URL or upload the
                          file.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={submitState === 'submitting'}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#1a1f3a',
                  border: '1px solid #2a3a4a',
                  borderRadius: '4px',
                  color: '#e0e0e0',
                  cursor: submitState === 'submitting' ? 'not-allowed' : 'pointer',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '0.9em',
                }}
              >
                {submitState === 'held' ? 'Close' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isDisabled}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: canSubmit && !isDisabled ? '#00ffe0' : '#1a1f3a',
                  border: canSubmit && !isDisabled ? '1px solid #00ffe0' : '1px solid #2a3a4a',
                  borderRadius: '4px',
                  color: canSubmit && !isDisabled ? '#000' : '#666',
                  cursor: canSubmit && !isDisabled ? 'pointer' : 'not-allowed',
                  fontFamily: '"Courier New", monospace',
                  fontSize: '0.9em',
                  fontWeight: 'bold',
                }}
              >
                {submitState === 'submitting'
                  ? 'Sending...'
                  : submitState === 'held'
                    ? 'Submitted for review'
                    : submitState === 'approved'
                      ? 'Posted'
                      : 'Send Signal'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

