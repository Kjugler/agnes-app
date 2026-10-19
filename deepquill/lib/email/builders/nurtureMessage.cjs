/**
 * Promotional notes for the decision-engine treatments.
 * No discount is offered. Each note includes the unsubscribe link.
 */

const SITE = 'https://www.theagnesprotocol.com';

function page(siteUrl, path) {
  const root = String(siteUrl || SITE).replace(/\/$/, '');
  return `${root}${path}`;
}

function footer(unsubscribeUrl) {
  return [
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
    '',
    'Until next time…',
    '— Jody',
  ].join('\n');
}

function buildNurtureMessage({ treatment, unsubscribeUrl, siteUrl, textAFriendUrl }) {
  const samples = page(siteUrl, '/sample-chapters');
  const buy = page(siteUrl, '/');
  const friend = textAFriendUrl || page(siteUrl, '/text-a-friend');
  const tail = footer(unsubscribeUrl);
  const notes = {
    identified_followup: {
      subject: 'The sample chapters are still here',
      text: `Hi.\n\nIt's Jody.\n\nWhenever you want to continue, the sample chapters are here:\n${samples}${tail}`,
    },
    qualified_reading: {
      subject: 'Picking up the thread',
      text: `Hi.\n\nJody here.\n\nYou can keep reading the sample chapters, or look at the book when you are ready.\n\nSample chapters: ${samples}\nThe book: ${buy}${tail}`,
    },
    multi_chapter_reading: {
      subject: 'The next sample chapter is open',
      text: `Hi.\n\nIt's Jody.\n\nThere is more of the sample waiting if you want to continue.\n\n${samples}${tail}`,
    },
    retailer_return: {
      subject: 'Back to the sample chapters',
      text: `Hi.\n\nJody here.\n\nIf you were looking at the book elsewhere, the sample chapters are still here when you come back.\n\n${samples}${tail}`,
    },
    buy_intent: {
      subject: 'The book, when you want it',
      text: `Hi.\n\nIt's Jody.\n\nNo rush. The sample chapters and the book are both here when you want them.\n\nSample chapters: ${samples}\nThe book: ${buy}${tail}`,
    },
    checkout_resume: {
      subject: 'Your place in checkout',
      text: `Hi.\n\nJody here.\n\nIf you still want the book, you can return to it here:\n${buy}\n\nThe sample chapters also remain available:\n${samples}${tail}`,
    },
    text_a_friend_day_28: {
      subject: 'If you know someone who would like this',
      text: `Hi.\n\nIt's Jody.\n\nIf you want to tell a friend about the book, this page uses your own referral code:\n${friend}${tail}`,
    },
    honest_review_day_42: {
      subject: 'If you have a minute for an honest note',
      text: `Hi.\n\nJody here.\n\nIf the book stayed with you, an honest review helps other readers. There is no incentive attached.\n\n${buy}${tail}`,
    },
  };
  const note = notes[treatment];
  if (!note || !unsubscribeUrl) return null;
  return {
    subject: note.subject,
    text: note.text,
    html: `<pre style="font-family:Georgia,serif;white-space:pre-wrap">${note.text}</pre>`,
  };
}

module.exports = {
  buildNurtureMessage,
};
