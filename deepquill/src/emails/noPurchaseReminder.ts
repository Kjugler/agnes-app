// DEPRECATED: use deepquill/lib/email/builders/noPurchaseReminder.cjs (book-focused copy).
// Kept aligned so accidental imports do not send contest language.

interface NoPurchaseEmailParams {
  firstName?: string | null;
  buyUrl: string;
  referUrl: string;
  shareUrl: string;
  journalUrl: string;
}

export function buildNoPurchaseReminderEmail({
  firstName,
  buyUrl,
  referUrl,
  shareUrl,
}: NoPurchaseEmailParams) {
  const name = firstName?.trim() || 'friend';
  const sampleUrl = shareUrl || buyUrl;

  const subjectOptions = [
    'Still thinking about The Agnes Protocol?',
    'Your sample chapters are waiting',
    'A political thriller worth finishing',
    'Pick up where you left off',
  ];

  const subject = subjectOptions[Math.floor(Math.random() * subjectOptions.length)];

  const html = `
    <p>Hi ${name},</p>
    <p>You recently visited <strong>The Agnes Protocol</strong> — a political thriller about truth, media, and trust.</p>
    <p>If the story stayed with you, the next step is simple: read a little more or grab your copy.</p>
    <p><a href="${sampleUrl}">Read sample chapters</a></p>
    <p><a href="${buyUrl}">Buy the book</a></p>
    <p><a href="${referUrl}"><strong>Share with a friend</strong></a> — they save on the book, and you earn when they buy.</p>
    <p>Questions? hello@theagnesprotocol.com</p>
    <p>—Vector 🛰️<br/>DeepQuill LLC</p>
  `;

  return { subject, html };
}
