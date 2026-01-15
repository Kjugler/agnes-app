const express = require('express');
const router = express.Router();
const mailchimp = require('@mailchimp/mailchimp_marketing');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { normalizeEmail } = require('../src/lib/normalize.cjs');
dotenv.config();

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: process.env.MAILCHIMP_SERVER_PREFIX,
});

// Default: don't block the UX if Mailchimp hiccups
const FAIL_OPEN = process.env.SUBSCRIBE_FAIL_OPEN !== 'false';

router.post('/', async (req, res) => {
  console.log('✅ Received POST to /api/subscribe');

  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ ok: false, error: 'Email is required.' });
  }

  const subscriberHash = crypto.createHash('md5').update(normalizedEmail).digest('hex');

  try {
    // Check if already exists
    await mailchimp.lists.getListMember(process.env.MAILCHIMP_LIST_ID, subscriberHash);
    console.log('👤 Returning visitor recognized.');
    return res.status(200).json({
      ok: true,
      status: 'existing',
      message: 'Access Granted! Welcome back!'
    });

  } catch (err) {
    if (err.status === 404) {
      // Not found — create/update
      try {
        await mailchimp.lists.setListMember(
          process.env.MAILCHIMP_LIST_ID,
          subscriberHash,
          {
            email_address: normalizedEmail,
            status_if_new: 'subscribed',
            tags: ['deepquill-access'],
          }
        );
        console.log('🆕 New subscriber added.');
        return res.status(200).json({
          ok: true,
          status: 'new',
          message: 'Access Granted! Welcome aboard!'
        });

      } catch (subscribeError) {
        console.error('❌ Subscription failed:', subscribeError);
        if (FAIL_OPEN) {
          // Soft-pass so the UX continues
          return res.status(200).json({
            ok: true,
            status: 'soft-fail',
            message: 'Access granted. We’ll finish sign-up shortly.'
          });
        }
        return res.status(400).json({
          ok: false,
          error: subscribeError.message,
          details: subscribeError.response?.body || 'No details',
        });
      }
    }

    // Unexpected error (not 404)
    console.error('❌ Mailchimp error (not 404):', err);
    if (FAIL_OPEN) {
      return res.status(200).json({
        ok: true,
        status: 'soft-fail',
        message: 'Access granted. We’ll finish sign-up shortly.'
      });
    }
    return res.status(400).json({
      ok: false,
      error: err.message,
      details: err.response?.body || 'No details',
    });
  }
});

module.exports = router;
