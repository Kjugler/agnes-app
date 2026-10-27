/**
 * Promotional notes for the decision-engine treatments.
 * No discount is offered. Each note includes the unsubscribe link.
 */

const SITE = 'https://www.theagnesprotocol.com';

function page(siteUrl, path) {
  const root = String(siteUrl || SITE).trim() || SITE;
  let origin;
  try {
    origin = new URL(root).origin;
  } catch {
    origin = new URL(SITE).origin;
  }
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${suffix}`;
}

function catalogPage(siteUrl) {
  const root = String(siteUrl || SITE).trim() || SITE;
  let base;
  try {
    base = new URL(root);
  } catch {
    base = new URL(SITE);
  }
  const target = new URL('/catalog', `${base.origin}/`);
  for (const [key, value] of base.searchParams) {
    target.searchParams.append(key, value);
  }
  return target.toString();
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function portraitImg(src) {
  return `<img src="${escapeHtml(src)}" alt="Portrait of Jody" width="86" height="86" style="width:86px;height:86px;object-fit:cover;object-position:center;border-radius:50%;border:0;display:block;margin:0 0 8px;" />`;
}

function identifiedFollowup({ samples, portrait, unsubscribeUrl }) {
  const subject = 'A little something from Jody';
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    'I noticed you stopped by to explore The Agnes Protocol, and I wanted to make sure you knew something.',
    '',
    "You don't have to start at the beginning.",
    '',
    'There are four sample chapters waiting for you, and each one opens a different window into the story.',
    '',
    'Some readers start with Chapter 1. Others jump straight into Chapter 9, where two boys discover that life can change in an instant.',
    '',
    "And that's only the beginning.",
    '',
    "Whenever you're ready, I'll be here to help you pick up the story.",
    '',
    `Explore the Sample Chapters: ${samples}`,
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeSamples = escapeHtml(samples);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">I noticed you stopped by to explore <em>The Agnes Protocol</em>, and I wanted to make sure you knew something.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">You don't have to start at the beginning.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">There are four sample chapters waiting for you, and each one opens a different window into the story.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Some readers start with Chapter 1. Others jump straight into Chapter 9, where two boys discover that life can change in an instant.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">And that's only the beginning.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">Whenever you're ready, I'll be here to help you pick up the story.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
                <tr>
                  <td bgcolor="#14342f" style="background:#14342f;border-radius:6px;">
                    <a href="${safeSamples}" style="display:inline-block;padding:14px 22px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.3;color:#ffffff;text-decoration:none;">Explore the Sample Chapters</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
                <tr>
                  <td bgcolor="#14342f" style="background:#14342f;border-radius:6px;">
                    <a href="${href}" style="display:inline-block;padding:14px 22px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.3;color:#ffffff;text-decoration:none;">${label}</a>
                  </td>
                </tr>
              </table>`;
}

function qualifiedReading({ samples, buy, portrait, unsubscribeUrl }) {
  const subject = 'Picking up the thread';
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    "I see you've spent a little time inside The Agnes Protocol. I hope you've enjoyed what you've discovered so far.",
    '',
    "But here's something you might find interesting.",
    '',
    "Those four sample chapters weren't chosen by accident. Each reveals a different piece of a much larger story.",
    '',
    "Some introduce people you'll come to know. Others reveal events whose significance won't become clear until much later.",
    '',
    'And sometimes, the smallest moments turn out to matter the most.',
    '',
    "If one chapter caught your attention, I'd encourage you to explore another. You might be surprised by the connections you discover.",
    '',
    `Explore Another Chapter: ${samples}`,
    '',
    "And whenever you're ready to discover how all those pieces fit together, the complete novel is waiting.",
    '',
    `Discover the Complete Book: ${buy}`,
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeSamples = escapeHtml(samples);
  const safeBuy = escapeHtml(buy);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">I see you've spent a little time inside <em>The Agnes Protocol</em>. I hope you've enjoyed what you've discovered so far.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">But here's something you might find interesting.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Those four sample chapters weren't chosen by accident. Each reveals a different piece of a much larger story.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Some introduce people you'll come to know. Others reveal events whose significance won't become clear until much later.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">And sometimes, the smallest moments turn out to matter the most.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">If one chapter caught your attention, I'd encourage you to explore another. You might be surprised by the connections you discover.</p>
              ${ctaButton(safeSamples, 'Explore Another Chapter')}
              <p style="margin:16px 0 8px;font-size:18px;line-height:1.55;">And whenever you're ready to discover how all those pieces fit together, the complete novel is waiting.</p>
              ${ctaButton(safeBuy, 'Discover the Complete Book')}
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function multiChapterReading({ samples, buy, portrait, unsubscribeUrl }) {
  const subject = "You're starting to see the pieces...";
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    "I see you've been exploring more than one chapter of The Agnes Protocol.",
    '',
    "Now you're beginning to get a glimpse of something interesting.",
    '',
    'At first, the people, places, and events might seem like separate stories. Different lives. Different circumstances. Different moments in time.',
    '',
    "But they're not nearly as separate as they appear.",
    '',
    'Some connections are obvious. Others are hiding in plain sight.',
    '',
    "And a few won't make sense until much later.",
    '',
    "That's part of what makes this story so fascinating. Every chapter adds another piece to a much larger puzzle.",
    '',
    "You've already discovered a few of those pieces. There are plenty more waiting for you.",
    '',
    `Explore the Sample Chapters: ${samples}`,
    '',
    "And when you're ready to see how the pieces come together...",
    '',
    `Discover the Complete Novel: ${buy}`,
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeSamples = escapeHtml(samples);
  const safeBuy = escapeHtml(buy);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">I see you've been exploring more than one chapter of <em>The Agnes Protocol</em>.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Now you're beginning to get a glimpse of something interesting.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">At first, the people, places, and events might seem like separate stories. Different lives. Different circumstances. Different moments in time.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">But they're not nearly as separate as they appear.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Some connections are obvious. Others are hiding in plain sight.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">And a few won't make sense until much later.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">That's part of what makes this story so fascinating. Every chapter adds another piece to a much larger puzzle.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">You've already discovered a few of those pieces. There are plenty more waiting for you.</p>
              ${ctaButton(safeSamples, 'Explore the Sample Chapters')}
              <p style="margin:16px 0 8px;font-size:18px;line-height:1.55;">And when you're ready to see how the pieces come together...</p>
              ${ctaButton(safeBuy, 'Discover the Complete Novel')}
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function retailerReturn({ samples, buy, portrait, unsubscribeUrl }) {
  const subject = "There's something waiting for you...";
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    'Sometimes finding the right book takes a little exploring.',
    '',
    'You read a description. Maybe look at a few reviews. And somewhere along the way, you start wondering whether this might be a story worth getting lost in.',
    '',
    "Well, there's something I'd love you to know about The Agnes Protocol.",
    '',
    "It's more than a political thriller. Beneath the mystery, the technology, and the unexpected twists, there's a story about friendship, loyalty, and the choices people make when everything they care about is at stake.",
    '',
    "And you don't have to take my word for it.",
    '',
    'Four sample chapters are waiting for you. Each offers a different glimpse into the story.',
    '',
    `Take Another Look: ${samples}`,
    '',
    "And here's a little something worth knowing.",
    '',
    "When you purchase the paperback directly from our website, you'll also receive the complete eBook at no additional charge. That means you can start reading without waiting for the paperback to arrive.",
    '',
    `Explore the Complete Book: ${buy}`,
    '',
    'Whatever you decide, I hope you enjoy discovering the story.',
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeSamples = escapeHtml(samples);
  const safeBuy = escapeHtml(buy);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Sometimes finding the right book takes a little exploring.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">You read a description. Maybe look at a few reviews. And somewhere along the way, you start wondering whether this might be a story worth getting lost in.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Well, there's something I'd love you to know about <em>The Agnes Protocol</em>.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's more than a political thriller. Beneath the mystery, the technology, and the unexpected twists, there's a story about friendship, loyalty, and the choices people make when everything they care about is at stake.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">And you don't have to take my word for it.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">Four sample chapters are waiting for you. Each offers a different glimpse into the story.</p>
              ${ctaButton(safeSamples, 'Take Another Look')}
              <p style="margin:16px 0 16px;font-size:18px;line-height:1.55;">And here's a little something worth knowing.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">When you purchase the paperback directly from our website, you'll also receive the complete eBook at no additional charge. That means you can start reading without waiting for the paperback to arrive.</p>
              ${ctaButton(safeBuy, 'Explore the Complete Book')}
              <p style="margin:16px 0 0;font-size:18px;line-height:1.55;">Whatever you decide, I hope you enjoy discovering the story.</p>
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function shareLink(textAFriendUrl) {
  const raw = String(textAFriendUrl || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const ref = String(url.searchParams.get('ref') || '').trim();
    if (!ref || ref === '...') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function textAFriend({ shareUrl, portrait, unsubscribeUrl }) {
  const subject = "If you know someone who'd love this story";
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    "I hope you've been enjoying The Agnes Protocol.",
    '',
    'If you know someone who might enjoy it too, you can save them 15% on their paperback purchase.',
    '',
    'Just use your personal sharing link. Your friend will receive the discount when they purchase through it.',
    '',
    `Share the Story — Save a Friend 15%: ${shareUrl}`,
    '',
    "It's a small way of saying thank you for introducing someone new to the story. And if they purchase the paperback directly, they'll receive the complete eBook at no additional charge, so they can begin reading right away.",
    '',
    'Whether you share it with one friend or several, thank you for being part of this adventure.',
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeShare = escapeHtml(shareUrl);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">I hope you've been enjoying <em>The Agnes Protocol</em>.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">If you know someone who might enjoy it too, you can save them 15% on their paperback purchase.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">Just use your personal sharing link. Your friend will receive the discount when they purchase through it.</p>
              ${ctaButton(safeShare, 'Share the Story — Save a Friend 15%')}
              <p style="margin:16px 0 16px;font-size:18px;line-height:1.55;">It's a small way of saying thank you for introducing someone new to the story. And if they purchase the paperback directly, they'll receive the complete eBook at no additional charge, so they can begin reading right away.</p>
              <p style="margin:0 0 0;font-size:18px;line-height:1.55;">Whether you share it with one friend or several, thank you for being part of this adventure.</p>
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function buyIntent({ samples, catalog, portrait, unsubscribeUrl }) {
  const subject = 'A little something worth knowing about The Agnes Protocol';
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    "I noticed you were taking a closer look at The Agnes Protocol. I'm glad you stopped by.",
    '',
    "When you purchase the paperback directly from our website, you'll receive the complete eBook at no additional charge.",
    '',
    'That means you can begin reading the entire story without waiting for the paperback to arrive.',
    '',
    `Discover the Complete Book: ${catalog}`,
    '',
    "If you're still deciding, the four sample chapters are open. Each one offers a different glimpse into the story.",
    '',
    `Explore the Sample Chapters: ${samples}`,
    '',
    "Whatever you decide, I hope you'll enjoy discovering where the story leads.",
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeSamples = escapeHtml(samples);
  const safeCatalog = escapeHtml(catalog);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">I noticed you were taking a closer look at <em>The Agnes Protocol</em>. I'm glad you stopped by.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">When you purchase the paperback directly from our website, <strong>you'll receive the complete eBook at no additional charge.</strong></p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">That means you can begin reading the entire story without waiting for the paperback to arrive.</p>
              ${ctaButton(safeCatalog, 'Discover the Complete Book')}
              <p style="margin:16px 0 8px;font-size:18px;line-height:1.55;">If you're still deciding, the four sample chapters are open. Each one offers a different glimpse into the story.</p>
              ${ctaButton(safeSamples, 'Explore the Sample Chapters')}
              <p style="margin:16px 0 0;font-size:18px;line-height:1.55;">Whatever you decide, I hope you'll enjoy discovering where the story leads.</p>
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function checkoutResume({ samples, catalog, portrait, unsubscribeUrl }) {
  const subject = "Whenever you're ready";
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    'You spent a moment considering The Agnes Protocol. I\'m glad it held your attention.',
    '',
    "Some stories ask for a little time before you're ready to bring them home. That's perfectly all right.",
    '',
    'Whenever you want the book, you can choose it here.',
    '',
    "When you purchase the paperback directly from our website, you'll receive the complete eBook at no additional charge, so you can begin reading without waiting for the paperback to arrive.",
    '',
    `Discover the Complete Book: ${catalog}`,
    '',
    "If you'd rather stay with the story a little longer first, the four sample chapters are open. Each one offers a different window in.",
    '',
    `Explore the Sample Chapters: ${samples}`,
    '',
    'Whatever you decide, the story will be here.',
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeSamples = escapeHtml(samples);
  const safeCatalog = escapeHtml(catalog);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">You spent a moment considering <em>The Agnes Protocol</em>. I'm glad it held your attention.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Some stories ask for a little time before you're ready to bring them home. That's perfectly all right.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Whenever you want the book, you can choose it here.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">When you purchase the paperback directly from our website, <strong>you'll receive the complete eBook at no additional charge,</strong> so you can begin reading without waiting for the paperback to arrive.</p>
              ${ctaButton(safeCatalog, 'Discover the Complete Book')}
              <p style="margin:16px 0 8px;font-size:18px;line-height:1.55;">If you'd rather stay with the story a little longer first, the four sample chapters are open. Each one offers a different window in.</p>
              ${ctaButton(safeSamples, 'Explore the Sample Chapters')}
              <p style="margin:16px 0 0;font-size:18px;line-height:1.55;">Whatever you decide, the story will be here.</p>
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function honestReview({ amazonUrl, barnesUrl, portrait, unsubscribeUrl }) {
  const subject = 'A small favor from Jody';
  const text = [
    'Hi,',
    '',
    "It's Jody.",
    '',
    'Thank you for spending time with The Agnes Protocol, and with the people in it.',
    '',
    'If you have a moment, an honest note helps someone else decide whether this story is right for them. A few sentences are enough.',
    '',
    'Please be candid. A positive note, a mixed one, or a critical one all help. There is no reward attached.',
    '',
    'Amazon and Barnes & Noble each set their own rules for who can leave a review. If one of these is open to you, that is enough.',
    '',
    `Review on Amazon: ${amazonUrl}`,
    `Review on Barnes & Noble: ${barnesUrl}`,
    '',
    'Whatever you choose to say, thank you for considering it.',
    '',
    'Until next time...',
    '— Jody',
    '',
    'These are occasional notes. Purchase receipts are separate.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
  const safeAmazon = escapeHtml(amazonUrl);
  const safeBarnes = escapeHtml(barnesUrl);
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f4f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;">
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
              ${portraitImg(portrait)}
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Hi,</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">It's Jody.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Thank you for spending time with <em>The Agnes Protocol</em>, and with the people in it.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">If you have a moment, an honest note helps someone else decide whether this story is right for them. A few sentences are enough.</p>
              <p style="margin:0 0 16px;font-size:18px;line-height:1.55;">Please be candid. A positive note, a mixed one, or a critical one all help. There is no reward attached.</p>
              <p style="margin:0 0 8px;font-size:18px;line-height:1.55;">Amazon and Barnes &amp; Noble each set their own rules for who can leave a review. If one of these is open to you, that is enough.</p>
              ${ctaButton(safeAmazon, 'Review on Amazon')}
              ${ctaButton(safeBarnes, 'Review on Barnes &amp; Noble')}
              <p style="margin:16px 0 0;font-size:18px;line-height:1.55;">Whatever you choose to say, thank you for considering it.</p>
              <p style="margin:28px 0 0;font-size:18px;line-height:1.55;">Until next time...</p>
              <p style="margin:4px 0 0;font-size:18px;line-height:1.55;">— Jody</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6d675f;">
              These are occasional notes. Purchase receipts are separate.<br />
              <a href="${safeUnsubscribe}" style="color:#6d675f;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function applyGreeting(built, priorJodyMessage) {
  if (!priorJodyMessage) return built;
  return {
    ...built,
    text: String(built.text || '').replace("It's Jody.", "It's Jody again."),
    html: String(built.html || '').replace("It's Jody.</p>", "It's Jody again.</p>"),
  };
}

function buildNurtureMessage({ treatment, unsubscribeUrl, siteUrl, textAFriendUrl, postalAddress, priorJodyMessage }) {
  const samples = page(siteUrl, '/sample-chapters');
  const buy = catalogPage(siteUrl);
  const portrait = page(siteUrl, '/jody-icons/jody-em1.png');
  const qualifiedPortrait = page(siteUrl, '/jody-icons/jody-em12.png');
  const multiPortrait = page(siteUrl, '/jody-icons/jody-em2.png');
  const retailerPortrait = page(siteUrl, '/jody-icons/jody-fb.png');
  const friendPortrait = page(siteUrl, '/jody-icons/jody-tiktok.png');
  const buyPortrait = page(siteUrl, '/jody-icons/jody-ig.png');
  const reviewPortrait = page(siteUrl, '/jody-icons/jody-em2.png');
  const friend = shareLink(textAFriendUrl);
  const tail = footer(unsubscribeUrl);
  const notes = {
    identified_followup: identifiedFollowup({ samples, portrait, unsubscribeUrl }),
    qualified_reading: qualifiedReading({
      samples,
      buy,
      portrait: qualifiedPortrait,
      unsubscribeUrl,
    }),
    multi_chapter_reading: multiChapterReading({
      samples,
      buy,
      portrait: multiPortrait,
      unsubscribeUrl,
    }),
    retailer_return: retailerReturn({
      samples,
      buy,
      portrait: retailerPortrait,
      unsubscribeUrl,
    }),
    buy_intent: buyIntent({
      samples,
      catalog: buy,
      portrait: buyPortrait,
      unsubscribeUrl,
    }),
    checkout_resume: checkoutResume({
      samples,
      catalog: buy,
      portrait,
      unsubscribeUrl,
    }),
    text_a_friend_day_28: friend
      ? textAFriend({ shareUrl: friend, portrait: friendPortrait, unsubscribeUrl })
      : null,
    honest_review_day_42: honestReview({
      amazonUrl: 'https://www.amazon.com/dp/B0GWQBDH66#customerReviews',
      barnesUrl: 'https://www.barnesandnoble.com/w/the-agnes-protocol-simon-mcquade/1147811774?ean=9798998952609',
      portrait: reviewPortrait,
      unsubscribeUrl,
    }),
  };
  const note = notes[treatment];
  if (!note || !unsubscribeUrl) return null;
  const built = {
    subject: note.subject,
    text: note.text,
    html: note.html || `<pre style="font-family:Georgia,serif;white-space:pre-wrap">${note.text}</pre>`,
  };
  const stable = page(siteUrl, '/preferences/unsubscribe');
  const stableLine = `If this link has expired, open ${stable} and enter the email address that received this note.`;
  const address = String(postalAddress || '').trim();
  const alreadyNamed = /^deepquill llc\b/i.test(address);
  const postalText = !address ? '' : alreadyNamed ? `${address}\n` : `DeepQuill LLC\n${address}\n`;
  const postalHtml = !address
    ? ''
    : alreadyNamed
      ? `<br />${escapeHtml(address)}`
      : `<br />DeepQuill LLC<br />${escapeHtml(address)}`;
  const footerExtra = `<br /><a href="${escapeHtml(stable)}" style="color:#6d675f;">Unsubscribe without this link</a>${postalHtml}`;
  return applyGreeting({
    ...built,
    text: `${built.text}\n${stableLine}\n${postalText}`,
    html: built.html.replace('>Unsubscribe</a>', `>Unsubscribe</a>${footerExtra}`),
  }, priorJodyMessage === true);
}

module.exports = {
  buildNurtureMessage,
};
