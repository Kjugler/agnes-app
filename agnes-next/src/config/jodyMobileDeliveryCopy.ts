/**
 * Jody mobile chapter delivery copy — Phase 1A.
 * Personality lives here, not in components. See docs/jody-charter.md.
 */

export function getChapterWelcomeCopy(chapterTitle: string) {
  return {
    greeting: ['Hi.', "I'm Jody.", 'Great choice.'],
    intro: [
      `For the best reading experience on your phone, I'll send ${chapterTitle} directly to you.`,
      "That way you can save it, read whenever you'd like, and I'll make it easy to continue your journey.",
    ],
    benefits: [
      'Easier to read on your phone',
      'Easy to save',
      'Easy to find again',
      'Continue where you left off',
    ],
    emailLabel: `Email Me ${chapterTitle}`,
    emailPlaceholder: 'your@email.com',
    emailSubmitting: 'Sending…',
    emailSentTitle: 'Check your inbox.',
    emailSentBody: [
      `I just sent ${chapterTitle} to your email.`,
      "Tap Download Chapter when you're ready — or Continue Reading to pick up your journey.",
    ],
    readHereLink: "I'd rather read it here",
    readHereHint:
      'Opens the chapter in your browser. On phones, the emailed version is usually easier to read.',
    errorGeneric: "I couldn't send that. Please try again.",
    errorInvalidEmail: 'Please enter a valid email address.',
  };
}

export const CONTINUE_READING_COPY = {
  welcome: ['Welcome back.', "I'm glad you're here."],
  buyLabel: 'Buy the Book',
  continueLabel: 'Continue Reading',
  chaptersHeading: 'Sample Chapters',
  reviewsHeading: 'See What Readers Are Saying',
  amazonLabel: 'Amazon Reviews',
  bnLabel: 'Barnes & Noble Reviews',
  errorInvalidLink: 'This link is invalid or has expired.',
  errorGeneric: 'Something went wrong. Please try again.',
};
