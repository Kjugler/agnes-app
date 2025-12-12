interface NonParticipantEmailParams {
  firstName?: string | null;
  challengeUrl: string;
  buyUrl: string;
  sampleUrl: string;
  shareUrl: string;
}

export function buildNonParticipantReminderEmail({
  firstName,
  challengeUrl,
  buyUrl,
  sampleUrl,
  shareUrl,
}: NonParticipantEmailParams) {
  const name = firstName?.trim() || "friend";

  const subjectOptions = [
    "You're missing out on something bigger than a prize…",
    "The Protocol Challenge is waiting for you.",
    "Don't let this opportunity pass you by.",
    "Your chance to win starts with one step.",
  ];

  const subject =
    subjectOptions[Math.floor(Math.random() * subjectOptions.length)];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Agnes Protocol – Non-Participant Reminder</title>
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
                You visited <strong>The Agnes Protocol</strong> — and that tells us something.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                It tells us you're curious. You're looking for something more. Maybe you're wondering what this is all about.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Here's what you might not know:
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                <strong>The Protocol Challenge</strong> isn't just a contest. It's a chance to:
              </p>

              <ul style="margin:0 0 16px 0;padding-left:24px;font-size:16px;line-height:1.6;color:#f5f5f5;">
                <li style="margin-bottom:8px;">Win incredible prizes (think: vacations, experiences, rewards)</li>
                <li style="margin-bottom:8px;">Join a community of people who are taking action</li>
                <li style="margin-bottom:8px;">Be part of something bigger than yourself</li>
              </ul>

              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
                And it all starts with one simple step:
              </p>
            </td>
          </tr>

          <!-- Action Buttons -->
          <tr>
            <td style="padding:16px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <a href="${challengeUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:12px 20px;background-color:#00c0ff;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Enter the Challenge
              </a>

              <a href="${buyUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:12px 20px;background-color:#00ff7f;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Buy the Book
              </a>

              <a href="${sampleUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:12px 20px;background-color:#fff;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Read Sample Chapters
              </a>

              <a href="${shareUrl}" style="display:inline-block;margin-bottom:12px;padding:12px 20px;background-color:#ffcc00;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Share the Protocol
              </a>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="padding:16px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                You've already taken the first step by visiting. Now take the next one.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Don't let this moment pass. The people who win are the ones who show up.
              </p>

              <p style="margin:0;font-size:15px;line-height:1.6;">
                See you inside,<br />
                —Vector 🛰️<br />
                <span style="color:#aaa;font-size:13px;">DeepQuill LLC</span>
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

