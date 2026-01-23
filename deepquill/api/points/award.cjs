// deepquill/api/points/award.cjs
// Endpoint to award points (called from agnes-next moderation routes)

const { awardForSignalApproved, awardForReviewApproved } = require('../../lib/points/awardPoints.cjs');

module.exports = async (req, res) => {
  // Guard: Only allow in development or with admin key
  const isDev = process.env.NODE_ENV === 'development';
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;

  if (!isDev && (!expectedKey || adminKey !== expectedKey)) {
    return res.status(403).json({
      error: 'Forbidden - Development only or valid x-admin-key required',
    });
  }

  try {
    const body = req.body;
    const { type, userId, signalId, reviewId } = body;

    if (!type || !userId) {
      return res.status(400).json({
        error: 'Missing required fields: type, userId',
      });
    }

    let result;

    if (type === 'signal_approved') {
      if (!signalId) {
        return res.status(400).json({
          error: 'Missing signalId for signal_approved type',
        });
      }
      result = await awardForSignalApproved({ userId, signalId });
    } else if (type === 'review_approved') {
      if (!reviewId) {
        return res.status(400).json({
          error: 'Missing reviewId for review_approved type',
        });
      }
      result = await awardForReviewApproved({ userId, reviewId });
    } else {
      return res.status(400).json({
        error: `Unknown type: ${type}. Supported: signal_approved, review_approved`,
      });
    }

    return res.json({
      ok: true,
      awarded: result.awarded,
      reason: result.reason,
    });
  } catch (err) {
    console.error('[api/points/award] Error', err);
    return res.status(500).json({
      error: err.message || 'Failed to award points',
    });
  }
};
