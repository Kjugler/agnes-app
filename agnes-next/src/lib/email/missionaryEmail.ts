// agnes-next/src/lib/email/missionaryEmail.ts

export function buildMissionaryEmail({
  firstName,
  referUrl,
  shareUrl,
  reviewUrl,
  challengeUrl,
  journalUrl,
}: {
  firstName?: string | null;
  referUrl: string;
  shareUrl: string;
  reviewUrl: string;
  challengeUrl: string;
  journalUrl: string;
}) {
  const subjects = [
    "You finished the book. Now the real story begins.",
    "Your voice matters more than you know.",
    "Readers like you ignite movements.",
    "What you felt reading this… others need to feel too.",
  ];

  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const name = firstName?.trim() || "friend";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Agnes Protocol – Missionary Email</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0a0a;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:#111111;border-radius:8px;overflow:hidden;border:1px solid #222222;">
          <tr>
            <td style="padding:24px 24px 16px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;">
                Hi ${name},
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                If you're reading this, then you've stepped into a world that most people never see.
                You didn't just buy <em>The Agnes Protocol</em> — you <strong>experienced</strong> it.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                And now something important happens.
                Stories like this don't spread because of marketing.
                They spread because people like <strong>you</strong> feel something — something you can't quite shake.
                Something that makes you want to say,
                <strong>"People need to know about this."</strong>
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                You are the heartbeat of this movement.
                You're the reason it grows.
                You're the reason others find their way into the world you just walked through.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Because truth doesn't shout.<br />
                It whispers — through readers who speak up.
              </p>

              <p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;font-weight:bold;">
                If the book moved you, shocked you, thrilled you, or made you think… tell someone.
              </p>

              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
                Even if it's just one friend.<br />
                Even if it's just one post.<br />
                Even if it's just one sentence.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Your voice travels farther than you know.
              </p>
            </td>
          </tr>

          <!-- Share Section -->
          <tr>
            <td style="padding:16px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <h2 style="margin:0 0 8px 0;font-size:18px;">⭐ Share The Agnes Protocol</h2>
              <p style="margin:0 0 16px 0;font-size:15px;color:#d0d0d0;">
                Your personal link carries your referral code automatically.
                Anyone who buys through you saves — and you earn rewards.
              </p>

              <a href="${referUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:10px 18px;background-color:#00ff7f;color:#000;text-decoration:none;font-size:14px;font-weight:bold;border-radius:4px;">
                Refer a Friend
              </a>

              <a href="${shareUrl}" style="display:inline-block;margin-bottom:12px;padding:10px 18px;background-color:#fff;color:#000;text-decoration:none;font-size:14px;font-weight:bold;border-radius:4px;">
                Share on Social
              </a>

              <div style="margin-top:8px;">
                <a href="${shareUrl}" style="color:#00ff7f;text-decoration:underline;font-size:14px;">
                  Send a quick email to someone who would love this
                </a>
              </div>
            </td>
          </tr>

          <!-- Inner Circle -->
          <tr>
            <td style="padding:16px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <h2 style="margin:0 0 8px 0;font-size:18px;">⭐ Join the Inner Circle</h2>
              <p style="margin:0 0 16px 0;font-size:15px;color:#d0d0d0;">
                Keep playing. Keep exploring. New clues and content are coming.
              </p>

              <a href="${challengeUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:10px 18px;background-color:#00c0ff;color:#000;text-decoration:none;font-size:14px;font-weight:bold;border-radius:4px;">
                Continue the Challenge
              </a>

              <span style="display:inline-block;margin-bottom:12px;padding:10px 18px;background-color:#333;color:#bbb;font-size:13px;font-weight:bold;border-radius:4px;">
                Unlock More Clues (Coming Soon)
              </span>
            </td>
          </tr>

          <!-- Write Words -->
          <tr>
            <td style="padding:16px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <h2 style="margin:0 0 8px 0;font-size:18px;">⭐ Write a Few Words</h2>
              <p style="margin:0 0 16px 0;font-size:15px;color:#d0d0d0;">
                You don't need to be a writer. Just tell the truth:
                What did you feel reading this book?
              </p>

              <a href="${reviewUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:10px 18px;background-color:#ffcc00;color:#000;text-decoration:none;font-size:14px;font-weight:bold;border-radius:4px;">
                Leave a Review
              </a>

              <a href="${journalUrl}" style="display:inline-block;margin-bottom:12px;padding:10px 18px;background-color:#fff;color:#000;text-decoration:none;font-size:14px;font-weight:bold;border-radius:4px;">
                Add a Note in Your Journal
              </a>

              <p style="margin:16px 0 16px 0;font-size:16px;line-height:1.6;">
                <em>The Agnes Protocol</em> may be fiction… but the forces it warns about are real.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Readers like you light the spark that becomes a fire.
                Someone out there is waiting for <strong>your voice</strong> to give them permission to step inside the story.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Thanks for walking this path with us.  
                You matter more than you know.
              </p>

              <p style="margin:0;font-size:15px;line-height:1.6;">
                —Vector 🛰️<br />
                <span style="color:#aaa;font-size:13px;">DeepQuill LLC — Storytelling for a world that needs it</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return { subject, html };
}
