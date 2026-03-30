const express = require('express');
const router = express.Router();
const { prisma } = require('../prisma.cjs');
const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { normalizeReferralCode } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../prisma.cjs');
const { getMailchimpClient } = require('../../lib/email/sendEmail.cjs');

const {
  MAILCHIMP_TRANSACTIONAL_KEY,
  MAILCHIMP_FROM_EMAIL,
  SITE_ROOT,
  APP_BASE_URL
} = process.env;

// Use APP_BASE_URL for testing (ngrok), fallback to SITE_ROOT, then production
const siteRoot = APP_BASE_URL || SITE_ROOT || 'https://theagnesprotocol.com';

/**
 * 🔒 LOCKED COPY — DO NOT REWRITE
 * This email copy is intentionally worded for deliverability + trust + conversion.
 * If you change phrasing, you MUST get approval from Kris/Vector.
 */

/**
 * Template Version Stamp — Used to verify which code produced the email
 * Update this when template changes to track which version is live
 */
const REFERRAL_TEMPLATE_VERSION = "RF-V3-2026-01-26-0730";

/**
 * Generate referral email subject line
 * @param {string} referrerDisplayName - Full name or email of referrer
 * @returns {string} Subject line
 */
function REFERRAL_EMAIL_SUBJECT(referrerDisplayName) {
  return `${referrerDisplayName} believes you'll love this book he found — The Agnes Protocol`;
}

/**
 * Generate referral email body text
 * @param {Object} params
 * @param {string} params.referrerDisplayName - Full name or email of referrer
 * @param {string} params.referralCode - Referral code
 * @param {string} params.siteUrl - Site URL with ref param
 * @param {string} params.videoTitle - Selected video title
 * @param {string} params.videoUrl - Video URL (optional)
 * @returns {string} HTML email body
 */
function REFERRAL_EMAIL_TEXT({ referrerDisplayName, referralCode, siteUrl, videoTitle, videoUrl }) {
  // Build video section - always show if videoUrl exists
  const videoSection = videoUrl ? `
    <p><strong>The video I picked: ${videoTitle}</strong></p>
    <p>👉 <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">Watch the video</a></p>
  ` : videoTitle ? `
    <p>The video I picked: <strong>${videoTitle}</strong></p>
  ` : '';
  
  return `
    <p>Hey there,</p>
    <p>${referrerDisplayName} asked us to send you a quick video and a link to a new thriller called <em>The Agnes Protocol</em> — and honestly, the website is off the hook. You'll love it.</p>
    <p><strong>Your personal discount code:</strong> ${referralCode}</p>
    <p>Use it to get $3.90 off the list price and join the interactive contest:</p>
    <p>👉 <a href="${siteUrl}" target="_blank" rel="noopener noreferrer">${siteUrl}</a></p>
    ${videoSection}
    <p>If you end up buying the book, I'll earn $2 for every copy purchased using my code — and if you decide to share it with friends, they'll get a discount too, and you can earn $2 as well.</p>
    <p>— DeepQuill LLC</p>
  `;
}

/**
 * Map videoId to video title
 */
const VIDEO_TITLES = {
  fb1: 'Video 1 — "Agnes Protocol Intro"',
  fb2: 'Video 2 — "Truth Under Siege"',
  fb3: 'Video 3 — "Play. Win. Ascend."',
  video1: 'Video 1 — "Agnes Protocol Intro"',
  video2: 'Video 2 — "Truth Under Siege"',
  video3: 'Video 3 — "Play. Win. Ascend."',
};

/**
 * Get referrer display name from available data
 * Priority: firstName + lastName > firstName > email local-part > full email
 */
function getReferrerDisplayName({ referrerFirstName, referrerLastName, referrerEmail }) {
  if (referrerFirstName && referrerLastName) {
    return `${referrerFirstName} ${referrerLastName}`;
  }
  if (referrerFirstName) {
    return referrerFirstName;
  }
  if (referrerEmail) {
    // Extract local-part (before @) as fallback
    const localPart = referrerEmail.split('@')[0];
    return localPart || referrerEmail;
  }
  return 'a friend';
}

/** Outbound email: Mailchimp Transactional HTTPS API (same path as purchase emails). SMTP to smtp.mandrillapp.com often connection-times out from Railway. */

router.post('/', async (req, res) => {
  try {
    const {
      friendEmail,
      friendEmails,
      friendName,
      fromEmail,
      referrerEmail,
      referrerFirstName,
      referrerLastName,
      note,
      videoVariant,
      videoId,
      associateCode,
      referralCode
    } = req.body || {};

    // Support both singular friendEmail and plural friendEmails array
    const emails = friendEmails && Array.isArray(friendEmails) && friendEmails.length > 0
      ? friendEmails.filter(e => e && typeof e === 'string' && e.trim())
      : friendEmail
      ? [friendEmail]
      : [];

    const code = associateCode || referralCode;

    if (emails.length === 0 || !code) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: friendEmail/friendEmails or associateCode/referralCode'
      });
    }

    // Resolve referrer user ID from referral code (for lastReferral tracking)
    let referrerUserId = null;
    let referrerReferralCode = null;
    if (prisma && code) {
      try {
        ensureDatabaseUrl();
        const normalizedCode = normalizeReferralCode(code);
        if (normalizedCode) {
          const referrerUser = await prisma.user.findFirst({
            where: {
              OR: [
                { code: normalizedCode },
                { referralCode: normalizedCode },
              ],
            },
            select: {
              id: true,
              code: true,
              referralCode: true,
            },
          });
          if (referrerUser) {
            referrerUserId = referrerUser.id;
            referrerReferralCode = referrerUser.referralCode || referrerUser.code;
            console.log('[REFER-FRIEND] Resolved referrer', {
              code: normalizedCode,
              referrerUserId,
              referrerReferralCode,
            });
          }
        }
      } catch (refErr) {
        console.warn('[REFER-FRIEND] Failed to resolve referrer user', {
          error: refErr.message,
          code,
        });
        // Continue anyway - email sending doesn't depend on referrer resolution
      }
    }

    // Get referrer display name (for subject and body)
    const referrerDisplayName = getReferrerDisplayName({
      referrerFirstName: referrerFirstName?.trim(),
      referrerLastName: referrerLastName?.trim(),
      referrerEmail: (referrerEmail && referrerEmail.trim()) || (fromEmail && fromEmail.trim()),
    });

    const safeFriendName = friendName && friendName.trim() ? friendName.trim() : 'there';

    // ✅ Build referral link - use /start?ref= as canonical entry point (goes through splitter)
    const refLink = `${siteRoot}/start?ref=${encodeURIComponent(code)}&src=ref_email`;

    // Map videoId to video title (support both videoId and videoVariant)
    const vidId = videoId || videoVariant;
    const videoTitle = VIDEO_TITLES[vidId] || VIDEO_TITLES.fb1 || 'Video 1 — "Agnes Protocol Intro"';
    
    // Build video URL - always include if videoId exists
    const videoUrl = vidId ? `${siteRoot}/videos/${vidId}.mp4` : null;

    const mailchimpClient = getMailchimpClient();
    if (!mailchimpClient) {
      console.warn('[REFER-FRIEND] Mailchimp client unavailable (missing MAILCHIMP_TRANSACTIONAL_KEY)');
      return res.status(500).json({
        ok: false,
        error: 'Email service not configured'
      });
    }

    console.log('[REFER-FRIEND] Email transport', {
      transport: 'mailchimp_transactional_api',
      provider: 'Mailchimp Transactional (HTTPS)',
      fromConfigured: Boolean(MAILCHIMP_FROM_EMAIL),
    });

    // 🔒 LOCKED COPY — Use canonical subject and body templates
    const baseSubject = REFERRAL_EMAIL_SUBJECT(referrerDisplayName);
    const subject = `${baseSubject} [${REFERRAL_TEMPLATE_VERSION}]`;

    // Send emails to all recipients and track results
    // Also update lastReferral fields on recipient users (Part A2)
    const sendPromises = emails.map(async (email) => {
      try {
        // 🔒 LOCKED COPY — Use canonical email template
        const baseHtml = REFERRAL_EMAIL_TEXT({
          referrerDisplayName,
          referralCode: code,
          siteUrl: refLink,
          videoTitle,
          videoUrl: videoUrl || null,
        });
        // Inject version stamp at the top of body
        const html = `<p style="font-size: 10px; color: #999;">Template: ${REFERRAL_TEMPLATE_VERSION}</p>\n${baseHtml}`;

        const { html: finalHtml, subject: finalSubject } = applyGlobalEmailBanner({ html, subject });

        // Log template version before sending (proves which code ran)
        console.log("[REFER-FRIEND] Using template", REFERRAL_TEMPLATE_VERSION, {
          to: email,
          referrerDisplayName,
          referralCode: code,
          videoId: vidId,
          subject: finalSubject || subject,
        });

        const fromDisplayName = referrerDisplayName || 'DeepQuill LLC';
        const fromEmailAddr = MAILCHIMP_FROM_EMAIL || 'no-reply@theagnesprotocol.com';
        const replyToAddr =
          (referrerEmail && String(referrerEmail).trim()) ||
          MAILCHIMP_FROM_EMAIL ||
          'hello@theagnesprotocol.com';

        const tSend0 = Date.now();
        console.log('[REFER-FRIEND] messages.send start', {
          to: email,
          template: REFERRAL_TEMPLATE_VERSION,
        });

        let emailResult;
        try {
          emailResult = await mailchimpClient.messages.send({
            message: {
              from_email: fromEmailAddr,
              from_name: fromDisplayName,
              to: [{ email, type: 'to' }],
              subject: finalSubject || subject,
              html: finalHtml || html,
              headers: { 'Reply-To': replyToAddr },
            },
          });
        } catch (sendErr) {
          console.error('[REFER-FRIEND] messages.send HTTP error', {
            to: email,
            elapsedMs: Date.now() - tSend0,
            message: sendErr.message,
            code: sendErr.code,
          });
          throw sendErr;
        }

        const elapsedMs = Date.now() - tSend0;
        const row = Array.isArray(emailResult) ? emailResult[0] : null;
        console.log('[REFER-FRIEND] messages.send finished', {
          to: email,
          elapsedMs,
          status: row?.status,
          reject_reason: row?.reject_reason,
          id: row?._id,
        });

        if (row && (row.status === 'rejected' || row.status === 'invalid')) {
          throw new Error(row.reject_reason || row.status || 'Email rejected by provider');
        }

        console.log('[refer-friend] Sent referral email to', email, 'for code', code);

        // Part A2: Update recipient's lastReferral fields (if referrer was resolved)
        if (prisma && referrerUserId && referrerReferralCode) {
          try {
            ensureDatabaseUrl();
            const normalizedFriendEmail = normalizeEmail(email);
            if (normalizedFriendEmail) {
              // Ensure user exists (create if needed)
              let recipientUser = await prisma.user.findUnique({
                where: { email: normalizedFriendEmail },
              });

              if (!recipientUser) {
                // Create user with minimal fields (code will be generated)
                const { customAlphabet } = require('nanoid');
                const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                const CODE_SIZE = 6;
                const generateCode = customAlphabet(CODE_ALPHABET, CODE_SIZE);
                
                let uniqueCode;
                for (let i = 0; i < 10; i++) {
                  const code = generateCode();
                  const match = await prisma.user.findFirst({
                    where: {
                      OR: [{ code }, { referralCode: code }],
                    },
                    select: { id: true },
                  });
                  if (!match) {
                    uniqueCode = code;
                    break;
                  }
                }
                if (!uniqueCode) {
                  throw new Error('Unable to generate unique code');
                }

                recipientUser = await prisma.user.create({
                  data: {
                    email: normalizedFriendEmail,
                    code: uniqueCode,
                    referralCode: uniqueCode,
                    rabbitSeq: 1,
                    rabbitTarget: 500,
                  },
                });
              }

              // Update lastReferral fields
              await prisma.user.update({
                where: { id: recipientUser.id },
                data: {
                  lastReferredByUserId: referrerUserId,
                  lastReferralCode: referrerReferralCode,
                  lastReferralAt: new Date(),
                  lastReferralSource: 'email',
                  lastReferralEmail: normalizedFriendEmail,
                },
              });

              console.log('[REFER-FRIEND] Updated lastReferral for recipient', {
                recipientEmail: normalizedFriendEmail,
                recipientUserId: recipientUser.id,
                referrerUserId,
                referrerReferralCode,
              });
            }
          } catch (updateErr) {
            // Non-blocking: log but don't fail email send
            console.warn('[REFER-FRIEND] Failed to update lastReferral for recipient', {
              email,
              error: updateErr.message,
            });
          }
        }

        return { email, success: true };
      } catch (err) {
        console.error('[refer-friend] Failed to send email to', email, ':', err.message);
        return { email, success: false, error: err.message };
      }
    });

    const results = await Promise.all(sendPromises);
    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return res.json({
      ok: true,
      sent,
      failed,
      total: emails.length
    });
  } catch (err) {
    console.error('[refer-friend] Error sending email', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to send referral email'
    });
  }
});

module.exports = router;

