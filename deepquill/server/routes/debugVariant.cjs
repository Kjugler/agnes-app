// deepquill/server/routes/debugVariant.cjs
// Logs variant selection for A/B split measurement

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { variant, next, ts } = req.body || {};
    
    console.log('[VARIANT]', {
      variant: variant || 'unknown',
      next: next || 'unknown',
      timestamp: ts ? new Date(ts).toISOString() : 'unknown',
      ip: req.ip || req.connection?.remoteAddress || 'unknown',
    });
    
    res.status(200).json({ ok: true, logged: true });
  } catch (err) {
    console.error('[VARIANT] Error logging variant:', err);
    res.status(500).json({ error: 'Failed to log variant' });
  }
};

