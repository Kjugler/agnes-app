// Server-side Reader Status resolver (mirrors agnes-next/src/lib/readerStatus.ts).

const READER_STATUS = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  READING: 'READING',
  KNOWN: 'KNOWN',
  RETURNING: 'RETURNING',
  PURCHASER: 'PURCHASER',
});

/**
 * @param {{ hasPurchased: boolean, isVerified: boolean, clientStatusHint?: string | null }} input
 * @returns {string}
 */
function resolveReaderStatusServer(input) {
  const { hasPurchased, isVerified, clientStatusHint } = input;
  if (hasPurchased) return READER_STATUS.PURCHASER;
  if (
    clientStatusHint === READER_STATUS.RETURNING ||
    (isVerified && clientStatusHint === 'RETURNING')
  ) {
    return READER_STATUS.RETURNING;
  }
  if (isVerified) return READER_STATUS.KNOWN;
  if (clientStatusHint === READER_STATUS.READING) return READER_STATUS.READING;
  return READER_STATUS.UNKNOWN;
}

/**
 * @param {string} userId
 */
async function userHasPurchase(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { earnedPurchaseBook: true },
  });
  if (user?.earnedPurchaseBook) return true;
  const count = await prisma.purchase.count({ where: { userId } });
  return count > 0;
}

module.exports = {
  READER_STATUS,
  resolveReaderStatusServer,
  userHasPurchase,
};
