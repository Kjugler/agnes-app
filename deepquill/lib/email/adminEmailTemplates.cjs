/**
 * Admin one-shot email bodies (template registry).
 * Add new templates here and register in server/routes/adminEmail.cjs
 */

const QUIET_REVEAL_SUBJECT = 'Something is opening — quietly';

function buildQuietRevealEmail({ siteUrl }) {
  const manageUrl = siteUrl ? `${String(siteUrl).replace(/\/+$/, '')}/preferences` : null;
  const footerText = manageUrl
    ? `You are receiving this email because you have interacted with The Agnes Protocol. Manage preferences: ${manageUrl} or reply to this email to opt out.`
    : 'You are receiving this email because you have interacted with The Agnes Protocol. Reply to this email to opt out.';

  const text = [
    'Something is opening — quietly.',
    '',
    'Not everything is being explained yet.',
    '',
    'Over the next few days, a small group will get early access to something that hasn’t been fully revealed.',
    '',
    'No rollout. No announcement. Just… access.',
    '',
    'If you’ve been paying attention, you’ll know where to look.',
    '',
    'April 30 – May 1',
    '',
    'Take your time.',
    '',
    '— Simon McQuade',
    '',
    footerText,
  ].join('\n');

  const html = `
<div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#111; max-width:640px; margin:0 auto;">
  <p>Something is opening — quietly.</p>
  <p>Not everything is being explained yet.</p>
  <p>Over the next few days, a small group will get early access to something that hasn’t been fully revealed.</p>
  <p>No rollout. No announcement. Just… access.</p>
  <p>If you’ve been paying attention, you’ll know where to look.</p>
  <p>April 30 – May 1</p>
  <p>Take your time.</p>
  <p>— Simon McQuade</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />
  <p style="font-size:12px;color:#666;">
    ${
      manageUrl
        ? `You are receiving this email because you have interacted with The Agnes Protocol. <a href="${manageUrl}">Manage preferences</a> or reply to this email to opt out.`
        : 'You are receiving this email because you have interacted with The Agnes Protocol. Reply to this email to opt out.'
    }
  </p>
</div>
`.trim();

  return { subject: QUIET_REVEAL_SUBJECT, html, text };
}

const TEMPLATES = {
  'quiet-reveal': (opts) => buildQuietRevealEmail(opts),
};

function getTemplateContent(template, opts) {
  const fn = TEMPLATES[template];
  if (typeof fn !== 'function') return null;
  return fn(opts);
}

module.exports = {
  getTemplateContent,
  TEMPLATES: Object.keys(TEMPLATES),
};
