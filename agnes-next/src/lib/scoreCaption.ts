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
  name: string | null;
  score: number;
  actions: PlayerActions;
  dailyShares: DailyShareStatus;
  rabbits: RabbitStatus;
  lastEvent: LastEventInfo | null;
};

/** Book-focused coaching lines for Reader Sharing Tools (no score/contest copy). */
export function buildScoreCaption(state: PlayerState): string[] {
  const lines: string[] = [];
  const { name, actions, lastEvent } = state;

  if (name && name.trim().length > 0) {
    lines.push(`Welcome back, ${name}.`);
  } else {
    lines.push('Welcome, reader.');
  }

  lines.push('Share The Agnes Protocol with friends who would love a great thriller.');

  if (lastEvent?.type === 'purchase_book') {
    const refName = lastEvent.referrerName;
    if (refName && refName.trim().length > 0) {
      lines.push(
        `Thanks for buying the book — and thank ${refName} for sharing their reader discount link with you.`
      );
    } else {
      lines.push('Thanks for buying The Agnes Protocol. Invite friends to read the sample chapters next.');
    }
  }

  const completed: string[] = [];
  if (actions.facebookShare) completed.push('shared on Facebook');
  if (actions.xShare) completed.push('shared on X');
  if (actions.instagramShare) completed.push('shared on Instagram');
  if (actions.purchasedBook) completed.push('bought the book');

  if (completed.length > 0) {
    const last = completed.pop();
    if (completed.length === 0 && last) {
      lines.push(`You've already ${last}.`);
    } else if (last) {
      lines.push(`You've ${completed.join(', ')} and ${last}.`);
    }
  } else {
    lines.push('Pick a tool below — text, email, or post — and send your personal sample-chapters link.');
  }

  const { dailyShares } = state;
  const notSharedToday: string[] = [];
  if (!dailyShares.facebookEarnedToday) notSharedToday.push('Facebook');
  if (!dailyShares.xEarnedToday) notSharedToday.push('X');
  if (!dailyShares.instagramEarnedToday) notSharedToday.push('Instagram');

  if (notSharedToday.length > 0) {
    const platforms = notSharedToday.join(', ').replace(/, ([^,]*)$/, ' and $1');
    lines.push(`Haven't posted to ${platforms} lately? Your link includes your reader discount code.`);
  } else if (actions.facebookShare || actions.xShare || actions.instagramShare) {
    lines.push('You have been busy sharing — come back tomorrow to reach more readers.');
  }

  if (!actions.purchasedBook) {
    lines.push('When you are ready, grab your copy — your referral link helps friends save on the book.');
  } else {
    lines.push('Keep sharing sample chapters — every link helps another reader discover the story.');
  }

  return lines;
}
