// agnes-next/src/lib/email/engagedReminder.ts

export function buildEngagedReminderEmail({
  firstName,
  buyUrl,
  challengeUrl,
  shareUrl,
  journalUrl,
}: {
  firstName?: string | null;
  buyUrl: string;
  challengeUrl: string;
  shareUrl: string;
  journalUrl: string;
}) {
  const subjects = [
    "You've stepped inside the story… don't stop now.",
    "You're closer than you think.",
    "Something brought you here. Follow it.",
    "Your next step is waiting inside The Agnes Protocol.",
  ];

  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const name = firstName?.trim() || "friend";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Agnes Protocol – Engaged Reminder</title>
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
                You didn't just stumble into <em>The Agnes Protocol</em>…
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                You engaged.<br />
                You explored, clicked, played, or stepped into the contest.<br />
                Something inside you said: <strong>"There's something happening here."</strong>
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                And you were right.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Most people glance at a world like this and walk away.<br />
                But you didn't. You took a step — one that millions never take.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Now the door opens a little wider.<br />
                And the next step is the one that matters most.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                If you've been thinking about reading the book… this is your moment.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                Because once you start turning the pages, everything you've seen so far begins to make sense.<br />
                The clues.<br />
                The warnings.<br />
                The feeling that something bigger is going on.
              </p>

              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">
                And here's the truth:<br />
                Your curiosity brought you here. Your voice will carry the story forward.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                When you're ready, jump back in:
              </p>
            </td>
          </tr>

          <!-- Action Buttons -->
          <tr>
            <td style="padding:16px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <a href="${buyUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:12px 20px;background-color:#00ff7f;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Buy the Book
              </a>

              <a href="${challengeUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:12px 20px;background-color:#00c0ff;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Continue the Challenge
              </a>

              <a href="${shareUrl}" style="display:inline-block;margin-right:12px;margin-bottom:12px;padding:12px 20px;background-color:#fff;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Share the Protocol
              </a>

              <a href="${journalUrl}" style="display:inline-block;margin-bottom:12px;padding:12px 20px;background-color:#ffcc00;color:#000;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px;">
                Write in Your Journal
              </a>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="padding:16px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;border-top:1px solid #222;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                You've already taken the first step.
              </p>

              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">
                All that's left… is the step that changes everything.
              </p>

              <p style="margin:0;font-size:15px;line-height:1.6;">
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

