/**
 * Dry-run reader nurturing decisions.
 *
 * Uses classifyReader and classifyProspectEngagement. Does not send mail,
 * create discounts, write referral codes, enroll nurture, or schedule jobs.
 * A recommended treatment can still be HOLD — NO SEND.
 */

const { classifyReader, OWNERSHIP, CONFIDENCE } = require('./classifyReader.cjs');
const { classifyProspectEngagement } = require('./classifyProspectEngagement.cjs');
const { promotionalConsentState } = require('./promotionalConsent.cjs');
const { promotionalRecipientBlock } = require('./promotionalRecipientPolicy.cjs');
const { FUNNEL_EVENT_TYPES } = require('../funnel/funnelEventTypes.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const IDENTIFIED_WAIT_DAYS = 3;
const ENGAGED_WAIT_DAYS = 1;
const TEXT_A_FRIEND_DAY = 28;
const REVIEW_AFTER_TEXT_A_FRIEND_DAYS = 14;
const FALLBACK_REVIEW_DAY = TEXT_A_FRIEND_DAY + REVIEW_AFTER_TEXT_A_FRIEND_DAYS;
const CODE_PREREQUISITE = 'personal_referral_code_required';
const CODE_UNAVAILABLE = 'personal_referral_code_unavailable';

const DECISION = Object.freeze({
  HOLD: 'HOLD — NO SEND',
  SUPPRESSED: 'SUPPRESSED',
  NOT_YET: 'NOT YET',
  ALREADY_REQUESTED: 'ALREADY REQUESTED',
  NO_TREATMENT: 'NO TREATMENT',
});

const TREATMENT = Object.freeze({
  NONE: 'none',
  IDENTIFIED_FOLLOWUP: 'identified_followup',
  QUALIFIED_READING: 'qualified_reading',
  MULTI_CHAPTER: 'multi_chapter_reading',
  RETAILER_RETURN: 'retailer_return',
  BUY_INTENT: 'buy_intent',
  CHECKOUT_RESUME: 'checkout_resume',
  TEXT_A_FRIEND: 'text_a_friend_day_28',
  HONEST_REVIEW: 'honest_review_day_42',
});

const SENT_OUTCOMES = new Set([
  'accepted',
  'recorded_sent_delivery_unknown',
  'unknown',
  'sending',
  'delivery_unknown',
]);
const BUY_CLICK_TYPES = new Set([
  FUNNEL_EVENT_TYPES.CATALOG_BUY_CLICK,
  FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK,
  FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK,
  FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_DIRECT_CLICK,
]);

const TEXT_A_FRIEND_OUTLINE = [
  'Open the existing Text a Friend page with this reader’s own referral code.',
  'Click the recommendation link, enter one or more friends’ names, and tap Send.',
  'Friends can read the sample chapters and purchase through that referral.',
  'A qualifying referral purchase notifies the reader with the friend’s savings and the $2 reward.',
  'The invitation is about enjoying the story together.',
  'Do not replace the referral code with a nurturing discount.',
].join(' ');

const REVIEW_OUTLINE = [
  'Invite an honest review on Amazon or Barnes & Noble.',
  'Do not offer compensation, a discount, points, or any other incentive for the review.',
].join(' ');

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isoFrom(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addDays(iso, days) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + days * DAY_MS).toISOString();
}

function isDue(now, when) {
  const left = isoFrom(now);
  const right = isoFrom(when);
  if (!left || !right) return false;
  return left >= right;
}

function asEvents(value) {
  return Array.isArray(value) ? value : [];
}

function latestEventAt(events, types) {
  let latest = null;
  for (const event of events) {
    if (!event || !types.has(event.type)) continue;
    const at = isoFrom(event.createdAt);
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

function hasSent(communications, category) {
  return sentAt(communications, category) != null;
}

function sentAt(communications, category) {
  let earliest = null;
  for (const row of asEvents(communications)) {
    if (!row || row.category !== category) continue;
    if (!SENT_OUTCOMES.has(asTrimmed(row.outcome))) continue;
    const at = isoFrom(row.occurredAt);
    if (at && (!earliest || at < earliest)) earliest = at;
  }
  return earliest;
}

function referralFrom(input) {
  const lead = input.leadAttribution && typeof input.leadAttribution === 'object' ? input.leadAttribution : {};
  const code = asTrimmed(input.referralCode || lead.ref || lead.code || input.preferredDiscountCode);
  if (!code) {
    return { status: 'none', code: null, blocksNurtureDiscount: false };
  }
  if (input.qualifyingReferral === true) {
    return { status: 'qualifying', code, blocksNurtureDiscount: true };
  }
  return { status: 'requires_resolution', code, blocksNurtureDiscount: true };
}

function textAFriendCanProceed(input) {
  return input.textAFriendEligible !== false && input.referralCodeIssuable !== false;
}

function knownProviderStop(input) {
  if (input.providerComplaint === true) {
    return { status: 'complaint', canSendPromotional: false, reason: 'complaint', hardStop: true };
  }
  if (input.providerUnsubscribe === true) {
    return { status: 'unsubscribed', canSendPromotional: false, reason: 'provider_unsubscribe', hardStop: true };
  }
  const check = input.providerSuppression;
  if (!check || check.checked !== true || check.suppressed !== true) return null;
  const reason = asTrimmed(check.reason) || 'provider_reject';
  const status = reason === 'complaint'
    ? 'complaint'
    : reason === 'provider_unsubscribe'
      ? 'unsubscribed'
      : 'provider_rejected';
  return {
    status,
    canSendPromotional: false,
    reason,
    providerReason: check.providerReason || null,
    hardStop: true,
  };
}

function permissionFrom(input, ownership) {
  const archived = input.profile && String(input.profile.status || '') === 'archived';
  const consent = promotionalConsentState({
    emailMarketingConsentAt: input.emailMarketingConsentAt,
    emailMarketingConsentSource: input.emailMarketingConsentSource,
    emailMarketingOptOutAt: input.emailMarketingOptOutAt,
    emailMarketingOptOutSource: input.emailMarketingOptOutSource,
  });
  if (input.doNotContact === true || ownership.contactability === 'suppressed_do_not_contact') {
    return { status: 'suppressed_do_not_contact', canSendPromotional: false, reason: 'do_not_contact', hardStop: true };
  }
  if (archived) {
    return { status: 'archived', canSendPromotional: false, reason: 'archived', hardStop: true };
  }
  if (ownership.contactability === 'no_mailable_email') {
    return { status: 'no_mailable_email', canSendPromotional: false, reason: 'no_mailable_email', hardStop: true };
  }
  const recipientBlock = promotionalRecipientBlock(input.email);
  if (recipientBlock) {
    return { status: recipientBlock, canSendPromotional: false, reason: recipientBlock, hardStop: true };
  }
  const providerStop = knownProviderStop(input);
  if (providerStop) return providerStop;
  if (consent.optOutAt && !consent.active) {
    return { status: 'promotional_opt_out', canSendPromotional: false, reason: 'promotional_opt_out', hardStop: true };
  }
  if (!consent.active) {
    return {
      status: 'no_marketing_consent',
      canSendPromotional: false,
      reason: 'reading_access_email_is_not_marketing_consent',
      hardStop: false,
    };
  }
  const check = input.providerSuppression;
  if (!check || check.checked !== true || check.suppressed === true) {
    return {
      status: 'provider_check_required',
      canSendPromotional: false,
      reason: 'provider_check_required',
      hardStop: false,
    };
  }
  return {
    status: 'promotional_allowed_not_sending',
    canSendPromotional: true,
    reason: 'sending_not_enabled',
    hardStop: false,
  };
}

function behaviorLines(input, engagement, signals) {
  const lines = [];
  const chapters = engagement && Array.isArray(engagement.chaptersSampled) ? engagement.chaptersSampled : [];
  if (chapters.length) lines.push(`Chapters sampled: ${chapters.join(', ')}.`);
  if (engagement && Number(engagement.qualifyingMs) > 0) {
    const by = engagement.qualifyingByChapter || {};
    lines.push(
      `Server qualifying time ${engagement.qualifyingMs} ms (chapter 1 ${by[1] || 0}, chapter 2 ${by[2] || 0}, chapter 9 ${by[9] || 0}, chapter 45 ${by[45] || 0}).`,
    );
  }
  if (engagement && engagement.gateReached) lines.push('Gate reached.');
  if (engagement && engagement.gateEmailAccepted) lines.push('Email accepted at the gate.');
  if (engagement && engagement.notNow) lines.push('Not Now selected.');
  if (engagement && engagement.retailerReturn) {
    lines.push(`Confirmed retailer return${engagement.retailerOrigin ? ` (${engagement.retailerOrigin})` : ''}.`);
  } else if (signals.retailerClick) {
    lines.push(`Retailer click recorded (${signals.retailerClick}); no confirmed retailer return.`);
  }
  const activity = engagement && engagement.activity;
  if (activity) {
    lines.push(
      `Activity from ${activity.firstActivityAt || 'unknown'} to ${activity.latestActivityAt || 'unknown'}. Measured sessions: unavailable. Inferred returns: ${activity.inferredReturnCount}. A return is a gap of at least six hours, not a measured visit.`,
    );
  }
  if (signals.checkoutAt) lines.push(`Checkout started ${signals.checkoutAt}.`);
  if (signals.buyClickAt) lines.push(`Buy the Book or catalog buy click ${signals.buyClickAt}.`);
  if (input.confirmedPurchaseAt) lines.push(`Confirmed purchase ${isoFrom(input.confirmedPurchaseAt)}.`);
  if (input.fulfilledAt) lines.push(`Fulfillment recorded ${isoFrom(input.fulfilledAt)}.`);
  if (input.knownReview === true) lines.push('A review is already known.');
  if (input.confirmedPurchaseAt && !asTrimmed(input.ownReferralCode)) {
    if (textAFriendCanProceed(input)) {
      lines.push(
        'No personal referral code is on record. Day 28 Text a Friend stays recommended. An empty personal code can be associated later without changing referral attribution. This dry run does not create a code.',
      );
    } else {
      lines.push(
        'A personal referral code cannot be associated for this purchaser. Text a Friend is unavailable. The review uses the purchase-plus-42-day fallback and does not record a recommendation as sent.',
      );
    }
  }
  return lines;
}

function signalsFrom(input) {
  const events = asEvents(input.events);
  const amazon = latestEventAt(events, new Set([FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK]));
  const bn = latestEventAt(events, new Set([FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK]));
  return {
    checkoutAt: isoFrom(input.checkoutStartedAt) || latestEventAt(events, new Set([FUNNEL_EVENT_TYPES.CHECKOUT_STARTED])),
    buyClickAt: isoFrom(input.buyClickAt) || latestEventAt(events, BUY_CLICK_TYPES),
    retailerClick: amazon && (!bn || amazon >= bn) ? 'amazon' : bn ? 'bn' : null,
  };
}

function offerFor(referral, treatment) {
  const offerTreatments = new Set([
    TREATMENT.QUALIFIED_READING,
    TREATMENT.MULTI_CHAPTER,
    TREATMENT.RETAILER_RETURN,
    TREATMENT.BUY_INTENT,
    TREATMENT.CHECKOUT_RESUME,
  ]);
  if (!offerTreatments.has(treatment)) {
    return { nurtureOffer: 'none', discountAction: 'none' };
  }
  if (referral.blocksNurtureDiscount) {
    const nurtureOffer = referral.status === 'requires_resolution'
      ? 'blocked_pending_resolution'
      : 'blocked_by_referral';
    return { nurtureOffer, discountAction: 'none' };
  }
  return { nurtureOffer: 'candidate_not_activated', discountAction: 'none' };
}

function prospectPlan(input, engagement, signals, now) {
  const anchor = engagement && engagement.latestEngagementAt;
  if (signals.checkoutAt) {
    return planRow(TREATMENT.CHECKOUT_RESUME, addDays(signals.checkoutAt, ENGAGED_WAIT_DAYS), 'prospect_nurture', now);
  }
  if (signals.buyClickAt) {
    return planRow(TREATMENT.BUY_INTENT, addDays(signals.buyClickAt, ENGAGED_WAIT_DAYS), 'prospect_nurture', now);
  }
  if (engagement && engagement.engagement === 'retailer_return_engaged') {
    return planRow(TREATMENT.RETAILER_RETURN, addDays(anchor || signals.checkoutAt, ENGAGED_WAIT_DAYS), 'prospect_nurture', now);
  }
  const chapters = engagement && Array.isArray(engagement.chaptersSampled) ? engagement.chaptersSampled : [];
  if (engagement && engagement.sampleEngaged && chapters.length >= 2) {
    return planRow(TREATMENT.MULTI_CHAPTER, addDays(anchor, ENGAGED_WAIT_DAYS), 'prospect_nurture', now);
  }
  if (engagement && engagement.sampleEngaged) {
    return planRow(TREATMENT.QUALIFIED_READING, addDays(anchor, ENGAGED_WAIT_DAYS), 'prospect_nurture', now);
  }
  if (engagement && engagement.engagement === 'identified') {
    const start = (engagement.activity && engagement.activity.firstActivityAt) || anchor;
    return planRow(TREATMENT.IDENTIFIED_FOLLOWUP, addDays(start, IDENTIFIED_WAIT_DAYS), 'prospect_nurture', now);
  }
  return { treatment: TREATMENT.NONE, timing: null, category: null, due: false };
}

function planRow(treatment, timing, category, now) {
  return {
    treatment,
    timing,
    category,
    due: Boolean(timing) && isDue(now, timing),
  };
}

function postPurchasePlan(input, now) {
  const anchor = isoFrom(input.fulfilledAt) || isoFrom(input.confirmedPurchaseAt);
  if (!anchor) return { treatment: TREATMENT.NONE, timing: null, category: null, due: false, reason: 'purchase_date_missing' };
  const textAt = addDays(anchor, TEXT_A_FRIEND_DAY);
  const textSentAt = sentAt(input.communications, 'reader_recommendation_taf');
  const reviewSent = hasSent(input.communications, 'review_invitation') || input.knownReview === true;
  const hasOwnCode = Boolean(asTrimmed(input.ownReferralCode));

  if (!textSentAt) {
    if (!textAFriendCanProceed(input)) {
      if (reviewSent) {
        return {
          treatment: TREATMENT.NONE,
          timing: null,
          category: null,
          due: false,
          reason: 'post_purchase_already_requested',
          textAFriendSentAt: null,
        };
      }
      return {
        ...planRow(TREATMENT.HONEST_REVIEW, addDays(anchor, FALLBACK_REVIEW_DAY), 'review_invitation', now),
        outline: REVIEW_OUTLINE,
        prerequisite: hasOwnCode ? 'text_a_friend_not_eligible' : CODE_UNAVAILABLE,
        reviewAnchor: 'purchase_plus_42_fallback',
        textAFriendSentAt: null,
      };
    }
    return {
      ...planRow(TREATMENT.TEXT_A_FRIEND, textAt, 'reader_recommendation_taf', now),
      outline: TEXT_A_FRIEND_OUTLINE,
      prerequisite: hasOwnCode ? null : CODE_PREREQUISITE,
      reviewAnchor: 'awaits_text_a_friend_send',
      textAFriendSentAt: null,
    };
  }

  if (!reviewSent) {
    return {
      ...planRow(
        TREATMENT.HONEST_REVIEW,
        addDays(textSentAt, REVIEW_AFTER_TEXT_A_FRIEND_DAYS),
        'review_invitation',
        now,
      ),
      outline: REVIEW_OUTLINE,
      reviewAnchor: 'text_a_friend_sent',
      textAFriendSentAt: textSentAt,
    };
  }
  return {
    treatment: TREATMENT.NONE,
    timing: null,
    category: null,
    due: false,
    reason: 'post_purchase_already_requested',
    textAFriendSentAt: textSentAt,
  };
}

function confirmedPurchaser(ownership) {
  return ownership.ownership === OWNERSHIP.PURCHASER && ownership.confidence === CONFIDENCE.CONFIRMED;
}

function finish(base, plan, permission, communications) {
  const already = plan.category ? hasSent(communications, plan.category) : false;
  let finalDecision = DECISION.NO_TREATMENT;
  let reason = plan.reason || 'no_treatment';

  if (base.suppressedReason) {
    finalDecision = DECISION.SUPPRESSED;
    reason = base.suppressedReason;
  } else if (!plan.treatment || plan.treatment === TREATMENT.NONE) {
    finalDecision = DECISION.NO_TREATMENT;
    reason = plan.reason || 'no_treatment';
  } else if (already || (plan.treatment === TREATMENT.HONEST_REVIEW && base.knownReview)) {
    finalDecision = DECISION.ALREADY_REQUESTED;
    reason = 'already_requested';
  } else if (!plan.due) {
    finalDecision = DECISION.NOT_YET;
    reason = 'scheduled_time_not_reached';
  } else {
    finalDecision = DECISION.HOLD;
    reason = permission.reason;
  }

  return {
    ...base,
    recommendedTreatment: plan.treatment || TREATMENT.NONE,
    recommendedTiming: plan.timing || null,
    category: plan.category || null,
    prerequisite: plan.prerequisite || null,
    reviewAnchor: plan.reviewAnchor || null,
    textAFriendSentAt: plan.textAFriendSentAt || null,
    codeAction: 'none',
    messageOutline: plan.outline || null,
    contactPermissionStatus: permission.status,
    providerReason: permission.providerReason || null,
    canSendPromotional: false,
    finalDecision,
    reason,
    wouldBeEligible: false,
    sendsEmail: false,
    schedulesSend: false,
    analyticsOnly: true,
  };
}

/**
 * @param {object} input Plain reader snapshot. Email is used only for classification.
 */
function decideReaderNurture(input) {
  const src = input && typeof input === 'object' ? input : {};
  const now = isoFrom(src.now) || new Date().toISOString();
  const ownership = classifyReader(src);
  const engagement = classifyProspectEngagement(src);
  const signals = signalsFrom(src);
  const referral = referralFrom(src);
  const permission = permissionFrom(src, ownership);
  const behavior = behaviorLines(src, engagement, signals);

  let suppressedReason = null;
  if (permission.hardStop) {
    suppressedReason = permission.reason;
  } else if (ownership.ownership === OWNERSHIP.BOOK_OWNER_GIFTED) {
    suppressedReason = 'ownership_gifted';
  } else if (ownership.ownership === OWNERSHIP.UNKNOWN) {
    suppressedReason = 'ownership_unknown';
  }

  let plan;
  if (ownership.ownership === OWNERSHIP.PURCHASER && !suppressedReason) {
    if (!confirmedPurchaser(ownership)) {
      plan = { treatment: TREATMENT.NONE, timing: null, category: null, due: false, reason: 'purchase_not_confirmed' };
    } else {
      plan = postPurchasePlan(src, now);
    }
  } else if (!suppressedReason) {
    plan = prospectPlan(src, engagement, signals, now);
    if (plan.treatment === TREATMENT.NONE) plan.reason = 'no_prospect_behavior';
  } else {
    plan = { treatment: TREATMENT.NONE, timing: null, category: null, due: false, reason: suppressedReason };
  }

  const offer = offerFor(referral, plan.treatment);
  const result = finish(
    {
      readerRef: asTrimmed(src.readerRef) || 'reader',
      classification: {
        ownership: ownership.ownership,
        confidence: ownership.confidence,
        contactability: ownership.contactability,
        review: ownership.review,
        nurtureSuppressed: ownership.nurtureSuppressed,
        engagement: engagement.engagement,
      },
      behavior,
      referralDiscountStatus: referral.status,
      nurtureOffer: offer.nurtureOffer,
      discountAction: offer.discountAction,
      suppressedReason,
      knownReview: src.knownReview === true,
    },
    plan,
    permission,
    src.communications,
  );

  const permissionAllows = permission.canSendPromotional === true && !suppressedReason;
  result.canSendPromotional = permissionAllows && result.finalDecision === DECISION.HOLD;
  result.wouldBeEligible = result.canSendPromotional === true;
  result.sendsEmail = false;
  result.schedulesSend = false;
  return result;
}

function formatDryRunReport(decisions) {
  const rows = Array.isArray(decisions) ? decisions : [decisions];
  return rows.map((row) => [
    `Reader: ${row.readerRef}`,
    `Classification: ${row.classification.ownership} / ${row.classification.engagement || 'no engagement anchor'} / nurtureSuppressed=${row.classification.nurtureSuppressed}`,
    `Behavior: ${row.behavior.length ? row.behavior.join(' ') : 'None recorded.'}`,
    `Treatment: ${row.recommendedTreatment}`,
    `Timing: ${row.recommendedTiming || 'none'}`,
    `Prerequisite: ${row.prerequisite || 'none'}`,
    `Review anchor: ${row.reviewAnchor || 'none'}`,
    `Referral discount: ${row.referralDiscountStatus} (${row.nurtureOffer})`,
    `Contact permission: ${row.contactPermissionStatus}`,
    `Decision: ${row.finalDecision}`,
    `Reason: ${row.reason}`,
  ].join('\n')).join('\n\n');
}

module.exports = {
  decideReaderNurture,
  formatDryRunReport,
  DECISION,
  TREATMENT,
  TEXT_A_FRIEND_DAY,
  REVIEW_AFTER_TEXT_A_FRIEND_DAYS,
  FALLBACK_REVIEW_DAY,
  CODE_PREREQUISITE,
  CODE_UNAVAILABLE,
  TEXT_A_FRIEND_OUTLINE,
  REVIEW_OUTLINE,
};
