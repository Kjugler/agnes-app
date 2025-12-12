interface NoPurchaseEmailParams {
  firstName?: string | null;
  buyUrl: string;
  referUrl: string;
  shareUrl: string;
  journalUrl: string;
}

export function buildNoPurchaseReminderEmail({
  firstName,
  buyUrl,
  referUrl,
  shareUrl,
  journalUrl,
}: NoPurchaseEmailParams) {
  const name = firstName?.trim() || "friend";

  const subjectOptions = [
    "Your family is closer to that getaway than you realize…",
    "You've entered. Now make it real.",
    "Don't lose momentum now. This could be yours.",
    "That vacation you've dreamed about? You're closer than you think.",
  ];

  const subject =
    subjectOptions[Math.floor(Math.random() * subjectOptions.length)];

  const html = `
    <p>Hi ${name},</p>

    <p>Yesterday, you entered <strong>The Protocol Challenge</strong> — and that was the first step toward something bigger than a prize.</p>

    <p>It was a step toward something your <strong>family deserves</strong>: rest, laughter, a break from the grind… maybe even that week on the water you've pictured more than once.</p>

    <p>And you're <strong>closer than you think</strong>.</p>

    <p>The people who end up in the top ranks — the ones who actually walk away with the trips, the rewards, the pride — all have one thing in common:</p>

    <p><strong>They keep their momentum.</strong></p>

    <h3>🌅 Imagine this:</h3>

    <p>Your kids racing down the hallway of a cruise ship…<br/>
    Your spouse smiling — the real one, not the "we're managing" one…<br/>
    You, leaning over the balcony railing at sunset, thinking:<br/>
    <strong>I made this happen.</strong></p>

    <p>And you can.</p>

    <p>Right now, the next step is simple:</p>

    <p><a href="${buyUrl}" style="display:inline-block;padding:12px 20px;background:#00ff5f;color:#000;text-decoration:none;border-radius:4px;font-weight:bold;">Get your copy of <em>The Agnes Protocol</em> — keep your momentum</a></p>

    <hr style="margin:24px 0;border:none;border-top:1px solid #333;" />

    <h3>Or, take another small step to move closer to the prize:</h3>

    <p>👉 <a href="${shareUrl}"><strong>Share your invite link</strong></a><br/>
    Help your friends join the challenge. (More participants → more rewards → more fun.)</p>

    <p>👉 <a href="${referUrl}"><strong>Refer a friend</strong></a><br/>
    Earn extra entries the moment they sign up.</p>

    <p>👉 <a href="${journalUrl}"><strong>Write in your journal</strong></a><br/>
    What are you hoping for? Who would you take on that vacation?<br/>
    Your "why" shapes your journey.</p>

    <p>You already started. You already made the first choice.</p>

    <p><strong>Finish what you began. Do this for the people you love.</strong></p>

    <p>Stay steady.<br/>
    Stay hopeful.<br/>
    You're closer than you think.</p>

    <p>—Vector 🛰️<br/>
    DeepQuill LLC</p>

  `;

  return { subject, html };
}

