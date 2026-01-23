import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  
  const v = Number(searchParams.get('v') || '1');
  const validV = [1, 2, 3].includes(v) ? v : 1;
  const ref = searchParams.get('ref') || '';
  
  // Build redirect script (allows FB to scrape metadata before redirect)
  const redirectScript = `
    <script>
      setTimeout(function() {
        window.location.href = '/';
      }, 300);
    </script>
  `;
  
  // Build HTML content
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Agnes Protocol — The End of Truth Begins Here</title>
  <meta name="description" content="A cinematic thriller that weaponizes truth. #WhereIsJodyVernon">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="${url.toString()}">
  <meta property="og:title" content="The Agnes Protocol — The End of Truth Begins Here">
  <meta property="og:description" content="A cinematic thriller that weaponizes truth. #WhereIsJodyVernon">
  <meta property="og:image" content="${url.origin}/images/fb${validV}.jpg">
  <meta property="og:video" content="${url.origin}/videos/fb${validV}.mp4">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="1280">
  <meta property="og:video:height" content="720">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="player">
  <meta name="twitter:title" content="The Agnes Protocol — The End of Truth Begins Here">
  <meta name="twitter:description" content="A cinematic thriller that weaponizes truth. #WhereIsJodyVernon">
  <meta name="twitter:image" content="${url.origin}/images/fb${validV}.jpg">
  
  ${redirectScript}
</head>
<body style="margin: 0; font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #0b0b0b; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
  <div style="max-width: 900px; margin: 40px auto; padding: 16px;">
    <video
      src="/videos/fb${validV}.mp4"
      poster="/images/fb${validV}.jpg"
      controls
      playsinline
      muted
      style="width: 100%; border-radius: 14px;"
    ></video>
    <div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
      <a
        href="/contest/score"
        style="background: #16a34a; color: #fff; padding: 10px 14px; border-radius: 10px; text-decoration: none; font-weight: 700;"
      >
        See my score
      </a>
      <a
        href="/buy"
        style="background: #16a34a; color: #fff; padding: 10px 14px; border-radius: 10px; text-decoration: none; font-weight: 700;"
      >
        Buy the book
      </a>
    </div>
    ${ref ? `<div style="opacity: 0.8; font-size: 14px; margin-top: 10px;">Ref: ${ref}</div>` : ''}
    <noscript>
      <p style="margin-top: 20px; text-align: center;">
        <a href="/" style="color: #16a34a; text-decoration: underline;">Continue to The Agnes Protocol</a>
      </p>
    </noscript>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
