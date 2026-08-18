// Prospect nurture emails 0–4 — production copy locked in docs/bn-funnel-readers-agree-v2-prospect-nurture-study.md

const STEPS = Object.freeze({
  0: {
    subject: 'Your free chapters are ready',
    bodyParagraphs: [
      'Something happened to Jody Vernon.',
      'Your free chapters of The Agnes Protocol are waiting.',
    ],
    ctaLabel: 'START READING',
  },
  1: {
    subject: "Something doesn't add up.",
    bodyParagraphs: [
      'The deeper you get into The Agnes Protocol, the more you realize very little is happening by accident.',
    ],
    ctaLabel: 'KEEP READING',
  },
  2: {
    subject: "They're just getting started.",
    bodyParagraphs: [
      'A handful of unlikely people are beginning to realize what they\'re up against.',
      'And the drama is just getting started.',
    ],
    ctaLabel: 'CONTINUE THE STORY',
  },
  3: {
    subject: "Readers didn't expect this.",
    bodyParagraphs: [
      'They expected conspiracy, technology, and political intrigue.',
      "They didn't expect how much they'd care about the people caught inside it.",
    ],
    ctaLabel: 'SEE WHY READERS AGREE',
  },
  4: {
    subject: "You've only seen the beginning.",
    bodyParagraphs: [
      "You've met some of them. You've seen what they're up against.",
      "But you haven't seen what happens next.",
    ],
    ctaLabel: 'CONTINUE THE AGNES PROTOCOL',
  },
});

function buildProspectNurtureEmail({ step, sampleChaptersUrl }) {
  const config = STEPS[step];
  if (!config) {
    throw new Error(`invalid_prospect_nurture_step:${step}`);
  }

  const bodyHtml = config.bodyParagraphs.map((p) => `<p>${p}</p>`).join('\n');
  const ctaHtml = `<p style="margin:28px 0;"><a href="${sampleChaptersUrl}" style="display:inline-block;padding:14px 24px;background:#00b35a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;">${config.ctaLabel}</a></p>`;

  const html = `
    ${bodyHtml}
    ${ctaHtml}
    <p style="color:#666;font-size:13px;margin-top:32px;">— The Agnes Protocol<br/>DeepQuill LLC</p>
  `;

  const text = [
    ...config.bodyParagraphs,
    '',
    `${config.ctaLabel}: ${sampleChaptersUrl}`,
  ].join('\n');

  return { subject: config.subject, html, text };
}

module.exports = { buildProspectNurtureEmail, PROSPECT_NURTURE_STEPS: STEPS };
