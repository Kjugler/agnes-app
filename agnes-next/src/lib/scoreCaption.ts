export type PlayerActions = {
  facebookShare: boolean;
  xShare: boolean;
  instagramShare: boolean;
  purchasedBook: boolean;
};

export type DailyShareStatus = {
  facebookEarnedToday: boolean;
  xEarnedToday: boolean;
  instagramEarnedToday: boolean;
};

export type RabbitStatus = {
  rabbit1Completed: boolean;
};

export type LastEventInfo = {
  type: "purchase_book" | "share_fb" | "share_x" | "share_ig" | "invite_friend" | null;
  referrerName?: string | null;
};

export type PlayerState = {
  name: string | null;          // Player's name, if we know it
  score: number;                // Current points
  actions: PlayerActions;       // What they've done so far
  dailyShares: DailyShareStatus; // Daily share point status
  rabbits: RabbitStatus;        // Rabbit mission status
  lastEvent: LastEventInfo | null; // Most recent event info
};

export function buildScoreCaption(state: PlayerState): string[] {
  const lines: string[] = [];

  const { name, score, actions } = state;

  // 1. Greeting
  if (name && name.trim().length > 0) {
    lines.push(`Welcome back, ${name}.`);
  } else {
    lines.push("Welcome, friend.");
  }

  // 2. Score line
  lines.push(`Your current score is ${score}.`);

  // 2.5. Purchase congrats line – event-specific
  const { lastEvent } = state;
  if (lastEvent?.type === "purchase_book") {
    const refName = lastEvent.referrerName;
    if (refName && refName.trim().length > 0) {
      lines.push(
        `Congratulations on buying The Agnes Protocol, the book that is causing a worldwide phenomenon. You received 15% off for using ${refName}'s associate publisher code, and you earned ${refName} $2. ${refName} thanks you!`
      );
    } else {
      lines.push(
        "Congratulations on buying The Agnes Protocol, the book that is causing a worldwide phenomenon. Your purchase pushes your score and the story forward."
      );
    }
  }

  // 3. Completed actions summary
  const completed: string[] = [];
  if (actions.facebookShare) completed.push("posted to Facebook");
  if (actions.xShare) completed.push("posted to X");
  if (actions.instagramShare) completed.push("posted to Instagram");
  if (actions.purchasedBook) completed.push("purchased the book");

  if (completed.length > 0) {
    // Join with "and" for the last item
    const last = completed.pop();

    if (completed.length === 0 && last) {
      lines.push(`So far, you've ${last}.`);
    } else if (last) {
      lines.push(`So far, you've ${completed.join(", ")} and ${last}.`);
    }
  } else {
    lines.push("You haven't taken any actions yet… but that can change fast.");
  }

  // 4. Next-steps coaching with daily caps
  const { dailyShares } = state;

  const availableToday: string[] = [];
  const maxedToday: string[] = [];

  if (!dailyShares.facebookEarnedToday) {
    availableToday.push("Facebook");
  } else if (actions.facebookShare) {
    maxedToday.push("Facebook");
  }

  if (!dailyShares.xEarnedToday) {
    availableToday.push("X");
  } else if (actions.xShare) {
    maxedToday.push("X");
  }

  if (!dailyShares.instagramEarnedToday) {
    availableToday.push("Instagram");
  } else if (actions.instagramShare) {
    maxedToday.push("Instagram");
  }

  if (availableToday.length > 0) {
    // They still have platforms where they can earn 100 points today
    const platforms = availableToday.join(", ").replace(/, ([^,]*)$/, " and $1");
    if (!actions.purchasedBook) {
      lines.push(
        `Post to ${platforms} today to earn 100 points on each platform and get your copy of The Agnes Protocol to push your score even higher.`
      );
    } else {
      lines.push(
        `Post to ${platforms} today to earn 100 points on each platform and keep climbing the leaderboard.`
      );
    }
  } else if (maxedToday.length > 0) {
    // They've earned all social-share points available today
    const platforms = maxedToday.join(", ").replace(/, ([^,]*)$/, " and $1");
    lines.push(
      `You've already earned your 100 daily points from ${platforms}. Your social-share points will reset tomorrow—stay ready.`
    );
    if (!actions.purchasedBook) {
      lines.push(
        "You've hit today's social-share caps. Grabbing The Agnes Protocol will still boost your score."
      );
    }
  } else {
    // No actions yet and no daily records – brand-new visitor
    lines.push(
      "Start by posting to Facebook, X, or Instagram today to earn your first 100 points on each platform."
    );
  }

  // 5. Rabbit coaching and congrats
  const { rabbits } = state;

  // Rabbit #1 messaging
  if (!rabbits.rabbit1Completed) {
    // Player has FB + book but is missing X/IG → coach them exactly like you described
    const hasFb = actions.facebookShare;
    const hasX = actions.xShare;
    const hasIg = actions.instagramShare;
    const hasBook = actions.purchasedBook;

    const missingX = !hasX;
    const missingIg = !hasIg;

    if (hasFb && hasBook && (missingX || missingIg)) {
      const missingPlatforms: string[] = [];
      if (missingX) missingPlatforms.push("X");
      if (missingIg) missingPlatforms.push("Instagram");

      const platformText = missingPlatforms
        .join(", ")
        .replace(/, ([^,]*)$/, " and $1");

      lines.push(
        `You're close to catching the first rabbit. Now post to ${platformText} to earn an extra 500-point rabbit bonus.`
      );
    } else if (hasFb || hasX || hasIg || hasBook) {
      // They've started, but the pattern isn't exactly the FB+book scenario above
      lines.push(
        "A rabbit is loose. Complete all three social posts and grab your copy of The Agnes Protocol to unlock a 500-point rabbit bonus."
      );
    } else {
      // Brand new – keep the rabbit reference subtle
      lines.push(
        "Rumor has it there's a rabbit worth 500 bonus points. Posting and grabbing the book will help you find it."
      );
    }
  } else {
    // Rabbit 1 already completed
    lines.push(
      "You caught your first rabbit and unlocked a 500-point bonus. Another rabbit is already on the move—higher rewards await."
    );
  }

  return lines;
}

