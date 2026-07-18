// Ensure ReaderProfile exists for Jody concierge reading state.

const { prisma } = require('../../server/prisma.cjs');
const {
  resolveReaderStatusServer,
  userHasPurchase,
  READER_STATUS,
} = require('./readerStatus.cjs');

const SAMPLE_CHAPTER_IDS = new Set(['1', '2', '9', '45']);

const CHAPTER_PDF_FILES = {
  '1': 'chapter1.pdf',
  '2': 'chapter2.pdf',
  '9': 'chapter9.pdf',
  '45': 'chapter45.pdf',
};

function getChapterPdfPath(chapterId) {
  const file = CHAPTER_PDF_FILES[String(chapterId)];
  if (!file) return null;
  return `/chapters/${file}`;
}

function isValidChapterId(chapterId) {
  return SAMPLE_CHAPTER_IDS.has(String(chapterId));
}

/**
 * @param {string} userId
 */
async function ensureReaderProfileForJody(userId) {
  const existing = await prisma.readerProfile.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  return prisma.readerProfile.create({
    data: {
      userId,
      source: 'Jody Concierge',
      readerType: 'interested',
      status: 'active',
    },
  });
}

/**
 * @param {{ userId: string, chapterId: string }} params
 */
async function saveJodyReadingProgress({ userId, chapterId }) {
  if (!isValidChapterId(chapterId)) {
    throw new Error('invalid_chapter_id');
  }
  await ensureReaderProfileForJody(userId);
  return prisma.readerProfile.update({
    where: { userId },
    data: {
      lastCompletedChapterId: String(chapterId),
      lastCompletedAt: new Date(),
      jodyVerifiedAt: new Date(),
    },
  });
}

/**
 * @param {{ userId: string, accept: boolean }} params
 */
async function saveJodyUpdatesConsent({ userId, accept }) {
  await ensureReaderProfileForJody(userId);
  return prisma.readerProfile.update({
    where: { userId },
    data: {
      emailUpdatesConsent: Boolean(accept),
      emailUpdatesConsentAt: new Date(),
    },
  });
}

/**
 * @param {string} userId
 * @param {{ clientStatusHint?: string | null }} [opts]
 */
async function getJodyReaderState(userId, opts = {}) {
  const [user, profile, hasPurchased] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        fname: true,
      },
    }),
    prisma.readerProfile.findUnique({
      where: { userId },
      select: {
        lastCompletedChapterId: true,
        lastCompletedAt: true,
        emailUpdatesConsent: true,
        emailUpdatesConsentAt: true,
        jodyVerifiedAt: true,
      },
    }),
    userHasPurchase(prisma, userId),
  ]);

  if (!user) return null;

  let greetingName = user.firstName || user.fname;
  if (!greetingName && user.email) {
    const { extractNameFromEmail } = require('../../src/lib/normalize.cjs');
    greetingName = extractNameFromEmail(user.email);
  }

  const isVerified = Boolean(profile?.jodyVerifiedAt);
  const readerStatus = resolveReaderStatusServer({
    hasPurchased,
    isVerified,
    clientStatusHint: opts.clientStatusHint ?? null,
  });

  return {
    userId: user.id,
    email: user.email,
    greetingName: greetingName || null,
    lastCompletedChapterId: profile?.lastCompletedChapterId || null,
    lastCompletedAt: profile?.lastCompletedAt?.toISOString() || null,
    emailUpdatesConsent: profile?.emailUpdatesConsent ?? false,
    emailUpdatesConsentAt: profile?.emailUpdatesConsentAt?.toISOString() || null,
    jodyVerifiedAt: profile?.jodyVerifiedAt?.toISOString() || null,
    isVerified,
    hasPurchased,
    readerStatus,
  };
}

/**
 * @param {{ userId: string, chapterId: string }} params
 */
async function saveChapterDelivery({ userId, chapterId }) {
  if (!isValidChapterId(chapterId)) {
    throw new Error('invalid_chapter_id');
  }
  const profile = await ensureReaderProfileForJody(userId);
  const now = new Date();
  return prisma.readerProfile.update({
    where: { userId },
    data: {
      lastDeliveredChapterId: String(chapterId),
      lastDeliveredAt: now,
      ...(profile.jodyVerifiedAt ? {} : { jodyVerifiedAt: now }),
    },
  });
}

module.exports = {
  ensureReaderProfileForJody,
  saveJodyReadingProgress,
  saveChapterDelivery,
  saveJodyUpdatesConsent,
  getJodyReaderState,
  isValidChapterId,
  getChapterPdfPath,
  SAMPLE_CHAPTER_IDS,
  READER_STATUS,
};
