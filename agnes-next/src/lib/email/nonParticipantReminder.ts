interface NonParticipantEmailParams {
  firstName?: string | null;
  enterUrl: string;
}

export function buildNonParticipantReminderEmail({
  firstName,
  enterUrl,
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
    <p>Hi ${name},</p>

    <p>You visited <strong>The Agnes Protocol</strong> — and that tells us something.</p>

    <p>It tells us you're curious. You're looking for something more. Maybe you're wondering what this is all about.</p>

    <p>Here's what you might not know:</p>

    <p><strong>The Protocol Challenge</strong> isn't just a contest. It's a chance to:</p>

    <ul>
      <li>Win incredible prizes (think: vacations, experiences, rewards)</li>
      <li>Join a community of people who are taking action</li>
      <li>Be part of something bigger than yourself</li>
    </ul>

    <p>And it all starts with one simple step:</p>

    <p><a href="${enterUrl}" style="display:inline-block;padding:12px 20px;background:#00ff5f;color:#000;text-decoration:none;border-radius:4px;font-weight:bold;">Enter The Protocol Challenge</a></p>

    <p>You've already taken the first step by visiting. Now take the next one.</p>

    <p>Don't let this moment pass. The people who win are the ones who show up.</p>

    <p>See you inside,<br/>
    —Vector 🛰️<br/>
    DeepQuill LLC</p>
  `;

  return { subject, html };
}

