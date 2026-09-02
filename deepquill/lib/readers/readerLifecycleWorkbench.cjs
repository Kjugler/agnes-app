/**
 * Derived Reader Lifecycle workbench helpers (Checkpoint 5J-D1P).
 *
 * Pure: no Prisma, filesystem, env, or writes. Does not call classifyReader.
 * Primary queues are mutually exclusive. Secondary badges (LIVE/TEST/MIXED,
 * identity warning, historical conflict) never create extra queue membership.
 *
 * resolved_keep_separate reviews suppress only the reviewed pair-edge for the
 * signal named by reasonCode (duplicate_name → name, similar_email → email).
 * Phone edges are never suppressed here. Open reviews are a separate Identity
 * force and are not interpreted in this file.
 */

const PRIMARY_QUEUES = Object.freeze([
  'archived',
  'dnc',
  'identity',
  'test_synthetic',
  'legacy_gifted',
  'legacy_purchaser',
  'prospects',
  'needs_review',
  'clear_no_action',
]);

const QUEUE_PRECEDENCE = PRIMARY_QUEUES;

const PURCHASE_MODE = Object.freeze({
  NONE: 'none',
  LIVE: 'live',
  TEST: 'test',
  MIXED: 'mixed',
  OTHER: 'other',
});

const ARCHIVED_SALE_STATUS = 'archived_beta';
const FIXTURE_EMAILS = Object.freeze(['me@here.com', 'test@test.com', 'noreply@noreply.com']);
const FIXTURE_DOMAINS = Object.freeze(['example.com', 'example.org']);

function asTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(email) {
  const trimmed = asTrimmed(email).toLowerCase();
  if (!trimmed || !trimmed.includes('@') || trimmed.length < 3) return null;
  return trimmed;
}

function isFixtureEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (FIXTURE_EMAILS.includes(normalized)) return true;
  const domain = normalized.split('@')[1] || '';
  return FIXTURE_DOMAINS.includes(domain);
}

function sessionKind(sessionId) {
  const id = asTrimmed(sessionId);
  if (!id) return 'unknown';
  if (id.startsWith('cs_test_')) return 'test';
  if (id.startsWith('cs_live_')) return 'live';
  return 'other';
}

function isCountablePurchase(purchase) {
  if (!purchase || typeof purchase !== 'object') return false;
  return asTrimmed(purchase.saleStatus).toLowerCase() !== ARCHIVED_SALE_STATUS;
}

function purchaseMode(purchases) {
  let live = 0;
  let test = 0;
  let other = 0;
  for (const row of Array.isArray(purchases) ? purchases : []) {
    if (!isCountablePurchase(row)) continue;
    const kind = sessionKind(row.sessionId);
    if (kind === 'live') live += 1;
    else if (kind === 'test') test += 1;
    else other += 1;
  }
  if (live > 0 && test > 0) return PURCHASE_MODE.MIXED;
  if (live > 0) return PURCHASE_MODE.LIVE;
  if (test > 0) return PURCHASE_MODE.TEST;
  if (other > 0) return PURCHASE_MODE.OTHER;
  return PURCHASE_MODE.NONE;
}

function purchaseSessionMode(purchase) {
  if (!purchase || typeof purchase !== 'object') return 'unknown';
  return sessionKind(purchase.sessionId);
}

function nameParts(user) {
  const firstRaw = asTrimmed((user && (user.fname || user.firstName)) || '');
  const lastRaw = asTrimmed((user && user.lname) || '');
  if (firstRaw && lastRaw) {
    return { first: firstRaw, last: lastRaw };
  }
  if (firstRaw && !lastRaw) {
    const tokens = firstRaw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      return { first: tokens.slice(0, -1).join(' '), last: tokens[tokens.length - 1] };
    }
    return { first: firstRaw, last: '' };
  }
  if (lastRaw) return { first: '', last: lastRaw };
  return { first: '', last: '' };
}

function nameClusterKey(user) {
  const { first, last } = nameParts(user);
  const f = first.toLowerCase();
  const l = last.toLowerCase();
  if (f.length < 2 || l.length < 2) return null;
  return `name:${f} ${l}`;
}

function emailClusterKey(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (isFixtureEmail(normalized)) return null;
  if (normalized.endsWith('@reader.crm')) return null;
  return `email:${normalized}`;
}

function phoneClusterKey(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length < 10) return null;
  return `phone:${digits}`;
}

function clusterKeysForReader(input) {
  const keys = [];
  const nameKey = nameClusterKey(input.user || {});
  if (nameKey) keys.push(nameKey);
  const emailKey = emailClusterKey(input.email);
  if (emailKey) keys.push(emailKey);
  const phoneKey = phoneClusterKey(input.phone);
  if (phoneKey) keys.push(phoneKey);
  return keys;
}

function signalForClusterKey(key) {
  const raw = asTrimmed(key);
  if (raw.startsWith('name:')) return 'name';
  if (raw.startsWith('email:')) return 'email';
  if (raw.startsWith('phone:')) return 'phone';
  return null;
}

function signalForIdentityReasonCode(reasonCode) {
  const code = asTrimmed(reasonCode).toLowerCase();
  if (code === 'duplicate_name') return 'name';
  if (code === 'similar_email') return 'email';
  return null;
}

function pairSignalKey(userIdA, userIdB, signal) {
  const a = asTrimmed(userIdA);
  const b = asTrimmed(userIdB);
  const kind = asTrimmed(signal);
  if (!a || !b || a === b || !kind) return null;
  return a < b ? `${a}|${b}|${kind}` : `${b}|${a}|${kind}`;
}

function readerUserId(row) {
  if (!row || typeof row !== 'object') return '';
  return asTrimmed((row.user && row.user.id) || row.userId);
}

function resolvedKeepSeparateSignals(reviews) {
  const set = new Set();
  for (const row of Array.isArray(reviews) ? reviews : []) {
    if (!row || typeof row !== 'object') continue;
    if (asTrimmed(row.status).toLowerCase() !== 'resolved_keep_separate') continue;
    const key = pairSignalKey(row.primaryUserId, row.otherUserId, signalForIdentityReasonCode(row.reasonCode));
    if (key) set.add(key);
  }
  return set;
}

function isPairSignalResolved(resolvedSignals, userIdA, userIdB, signal) {
  const key = pairSignalKey(userIdA, userIdB, signal);
  if (!key) return false;
  if (resolvedSignals instanceof Set) return resolvedSignals.has(key);
  if (Array.isArray(resolvedSignals)) return resolvedSignals.includes(key);
  return false;
}

function buildIdentityClusters(readers, resolvedSignals) {
  const byKey = new Map();
  const userIdByProfile = new Map();
  for (const row of Array.isArray(readers) ? readers : []) {
    const profileId = asTrimmed(row.readerProfileId);
    if (!profileId) continue;
    const userId = readerUserId(row);
    if (userId) userIdByProfile.set(profileId, userId);
    for (const key of clusterKeysForReader(row)) {
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key).add(profileId);
    }
  }

  const peersByProfile = new Map();
  const firstKeyByProfile = new Map();
  for (const [key, ids] of byKey.entries()) {
    if (ids.size < 2) continue;
    const signal = signalForClusterKey(key);
    const members = [...ids];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const left = members[i];
        const right = members[j];
        if (
          signal &&
          isPairSignalResolved(
            resolvedSignals,
            userIdByProfile.get(left),
            userIdByProfile.get(right),
            signal,
          )
        ) {
          continue;
        }
        if (!peersByProfile.has(left)) peersByProfile.set(left, new Set());
        if (!peersByProfile.has(right)) peersByProfile.set(right, new Set());
        peersByProfile.get(left).add(right);
        peersByProfile.get(right).add(left);
        if (!firstKeyByProfile.has(left)) firstKeyByProfile.set(left, key);
        if (!firstKeyByProfile.has(right)) firstKeyByProfile.set(right, key);
      }
    }
  }

  const clusterByProfile = new Map();
  for (const [id, peers] of peersByProfile.entries()) {
    if (!peers.size) continue;
    clusterByProfile.set(id, {
      key: firstKeyByProfile.get(id),
      memberIds: [id, ...peers],
    });
  }
  return clusterByProfile;
}

function isTestSynthetic(input) {
  if (purchaseMode(input.purchases) === PURCHASE_MODE.TEST) return true;
  if (isFixtureEmail(input.email)) return true;
  return false;
}

function hasUsableReaderName(input) {
  const user = (input && input.user) || input || {};
  const { first } = nameParts(user);
  if (first.length >= 2) return true;
  const display = asTrimmed(input && input.name);
  if (!display) return false;
  const tokens = display.split(/\s+/).filter((token) => token.length >= 2);
  return tokens.length > 0;
}

function isNamelessPurchaser(input) {
  if (hasUsableReaderName(input)) return false;
  return asTrimmed(input && input.ownership).toLowerCase() === 'purchaser';
}

function assignPrimaryQueue(input) {
  const status = asTrimmed(input.legacyStatus || input.status).toLowerCase();
  const contactability = asTrimmed(input.contactability).toLowerCase();
  const ownership = asTrimmed(input.ownership).toLowerCase();
  const review = asTrimmed(input.review).toLowerCase();
  const reasons = Array.isArray(input.reasons) ? input.reasons : [];

  if (status === 'archived') return 'archived';
  if (contactability === 'suppressed_do_not_contact' || input.independentDnc === true) return 'dnc';
  if (input.openIdentityReview === true || input.inIdentityCluster === true) return 'identity';
  if (isTestSynthetic(input)) return 'test_synthetic';
  if (reasons.includes('legacy_gifted_label_without_evidence')) return 'legacy_gifted';
  if (reasons.includes('legacy_purchased_label_without_evidence')) return 'legacy_purchaser';
  if (ownership === 'non_purchaser') return 'prospects';
  if (review === 'incomplete' || review === 'conflicting' || review === 'identity_review_required') {
    return 'needs_review';
  }
  if (isNamelessPurchaser(input)) return 'needs_review';
  return 'clear_no_action';
}

function recommendedAction(primaryQueue, input) {
  if (primaryQueue === 'needs_review' && isNamelessPurchaser(input || {})) {
    return 'Review missing reader identity';
  }
  switch (primaryQueue) {
    case 'archived':
      return 'Leave archived unless Kris restores for a specific reason.';
    case 'dnc':
      return 'Do not outreach.';
    case 'identity':
      return 'Review identity before ownership evidence.';
    case 'test_synthetic':
      return 'Do not treat as a production customer.';
    case 'legacy_gifted':
      return 'Confirm gift if Kris independently knows it.';
    case 'legacy_purchaser':
      return 'Add retailer evidence only if Kris confirms. Do not invent a website Purchase.';
    case 'prospects':
      return 'Leave as prospect.';
    case 'needs_review':
      return 'Insufficient evidence — do not guess.';
    case 'clear_no_action':
      return 'No write.';
    default:
      return 'Insufficient evidence — do not guess.';
  }
}

function evidenceSummary(input) {
  const sources = Array.isArray(input.sources) ? input.sources.filter(Boolean) : [];
  const currentEvidence = (Array.isArray(input.evidence) ? input.evidence : []).filter(
    (row) => row && asTrimmed(row.status).toLowerCase() !== 'superseded',
  );
  const mode = purchaseMode(input.purchases);
  const parts = [];
  if (sources.length) parts.push(sources.join(', '));
  if (mode === PURCHASE_MODE.LIVE || mode === PURCHASE_MODE.MIXED) {
    const live = (input.purchases || []).filter(
      (row) => isCountablePurchase(row) && sessionKind(row.sessionId) === 'live',
    ).length;
    parts.push(`${live} live purchase${live === 1 ? '' : 's'}`);
  }
  if (currentEvidence.length) {
    const kinds = [...new Set(currentEvidence.map((row) => asTrimmed(row.kind)).filter(Boolean))];
    if (kinds.length) parts.push(kinds.join(', '));
  }
  if (!parts.length) {
    if ((input.reasons || []).includes('legacy_gifted_label_without_evidence')) {
      return 'CRM gifted · no evidence';
    }
    if ((input.reasons || []).includes('legacy_purchased_label_without_evidence')) {
      return 'CRM purchased · no authoritative evidence';
    }
    return 'No purchase or evidence';
  }
  return parts.join(' · ');
}

function historicalCrmConflict(input) {
  const notes = asTrimmed(input.notes);
  const current = (Array.isArray(input.evidence) ? input.evidence : []).filter(
    (row) => row && asTrimmed(row.status).toLowerCase() !== 'superseded',
  );
  if (!notes || !current.length) return null;
  const noteText = notes.toLowerCase();
  const details = current.map((row) => asTrimmed(row.details).toLowerCase()).join(' ');
  const noteEbook = /\be-?book\b/.test(noteText);
  const evidencePhysical = /\bpaperback\b|\bhardcover\b|\bphysical\b/.test(details);
  if (noteEbook && evidencePhysical) {
    return {
      code: 'format_conflict',
      message:
        'Lifecycle evidence is the current administrative truth. The CRM note is historical and was not edited.',
      detail: 'Current gift evidence records a physical paperback; the historical CRM note mentions an eBook.',
    };
  }
  return null;
}

function emptyQueueCounts() {
  const counts = {};
  for (const queue of PRIMARY_QUEUES) counts[queue] = 0;
  return counts;
}

function tallyPrimaryQueues(items) {
  const counts = emptyQueueCounts();
  for (const item of Array.isArray(items) ? items : []) {
    const queue = item && item.primaryQueue;
    if (counts[queue] == null) continue;
    counts[queue] += 1;
  }
  return counts;
}

function assertExclusiveQueues(items) {
  const counts = tallyPrimaryQueues(items);
  const sum = PRIMARY_QUEUES.reduce((n, key) => n + counts[key], 0);
  if (sum !== items.length) {
    throw new Error(`exclusive queue sum ${sum} !== item count ${items.length}`);
  }
  return counts;
}

module.exports = {
  PRIMARY_QUEUES,
  QUEUE_PRECEDENCE,
  PURCHASE_MODE,
  FIXTURE_EMAILS,
  FIXTURE_DOMAINS,
  sessionKind,
  purchaseMode,
  purchaseSessionMode,
  nameParts,
  nameClusterKey,
  emailClusterKey,
  phoneClusterKey,
  clusterKeysForReader,
  signalForClusterKey,
  signalForIdentityReasonCode,
  pairSignalKey,
  resolvedKeepSeparateSignals,
  buildIdentityClusters,
  isFixtureEmail,
  isTestSynthetic,
  hasUsableReaderName,
  isNamelessPurchaser,
  assignPrimaryQueue,
  recommendedAction,
  evidenceSummary,
  historicalCrmConflict,
  emptyQueueCounts,
  tallyPrimaryQueues,
  assertExclusiveQueues,
};
