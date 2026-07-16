/**
 * Jody Concierge conversation copy — data-driven, not embedded in React.
 * Rewrite lines here; never hardcode personality in components.
 * See docs/jody-charter.md for why.
 */

export type JodyBeatId =
  | 'remember-offer'
  | 'email-capture'
  | 'email-sent'
  | 'verified-success'
  | 'updates-offer'
  | 'return-welcome';

export type JodyCopyLine = string | { template: string; key: string };

export type JodyBeatCopy = {
  id: JodyBeatId;
  lines: JodyCopyLine[];
  primaryAction?: { id: string; label: string };
  secondaryAction?: { id: string; label: string };
  bulletItems?: string[];
};

export const JODY_CONCIERGE_COPY: Record<JodyBeatId, JodyBeatCopy> = {
  'remember-offer': {
    id: 'remember-offer',
    lines: [
      'Hi.',
      "I'm Jody.",
      'Would you like me to remember where you stopped reading?',
      'That way you can continue later from any phone, tablet or computer.',
    ],
    primaryAction: { id: 'remember-accept', label: 'Remember My Place' },
    secondaryAction: { id: 'remember-decline', label: 'Not Now' },
  },
  'email-capture': {
    id: 'email-capture',
    lines: [
      'Great.',
      "I just need a verified email address so I know it's really you.",
    ],
    primaryAction: { id: 'email-submit', label: 'Send me a link' },
    secondaryAction: { id: 'email-back', label: 'Back' },
  },
  'email-sent': {
    id: 'email-sent',
    lines: [
      'Check your inbox.',
      'Tap the link in the email — then I\'ll remember your place automatically.',
    ],
    secondaryAction: { id: 'email-sent-close', label: 'Got it' },
  },
  'verified-success': {
    id: 'verified-success',
    lines: ['Perfect.', "I'll remember your place automatically."],
    primaryAction: { id: 'verified-continue', label: 'Continue Reading' },
  },
  'updates-offer': {
    id: 'updates-offer',
    lines: [
      'Since I already know how to reach you…',
      'Would you also like me to let you know about:',
    ],
    bulletItems: [
      'New chapters',
      'Reader contests',
      'Special sales',
      'Audiobook releases',
      'Book signings',
    ],
    primaryAction: { id: 'updates-accept', label: 'Yes' },
    secondaryAction: { id: 'updates-decline', label: 'No Thanks' },
  },
  'return-welcome': {
    id: 'return-welcome',
    lines: [
      'Welcome back.',
      'Good to see you again.',
      "I've been saving your place.",
      'Ready to continue?',
    ],
    primaryAction: { id: 'return-continue', label: 'Continue Reading' },
    secondaryAction: { id: 'return-dismiss', label: 'Not Now' },
  },
};

export function resolveCopyLine(
  line: JodyCopyLine,
  vars: Record<string, string | null | undefined>,
): string {
  if (typeof line === 'string') return line;
  let text = line.template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }
  return text;
}
