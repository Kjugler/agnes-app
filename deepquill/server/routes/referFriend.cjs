const express = require('express');
const router = express.Router();
const { prisma } = require('../prisma.cjs');
const { applyGlobalEmailBanner } = require('../../src/lib/emailBanner.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { normalizeReferralCode } = require('../../src/lib/normalize.cjs');
const { isSelfReferral, normalizeIdentityEmail } = require('../../src/lib/selfReferralGuards.cjs');
const { ensureDatabaseUrl } = require('../prisma.cjs');
const { getMailchimpClient } = require('../../lib/email/sendEmail.cjs');
const { guardMailableEmail } = require('../../lib/email/guardMailableEmail.cjs');

const {
  MAILCHIMP_TRANSACTIONAL_KEY,
  MAILCHIMP_FROM_EMAIL,
  SITE_ROOT,
  APP_BASE_URL
} = process.env;

// Use APP_BASE_URL for testing (ngrok), fallback to SITE_ROOT, then production
const siteRoot = APP_BASE_URL || SITE_ROOT || 'https://theagnesprotocol.com';

/**
 * Template Version Stamp — Used to verify which code produced the email
 */
const REFERRAL_TEMPLATE_VERSION = 'RF-V5-2026-06-26-reader-advocate';

const SAMPLE_CHAPTERS_THUMBNAIL_PATH = '/og/creator-sample-card-v1.jpg';

function REFERRAL_EMAIL_SUBJECT() {
  return "You've got to read this.";
}

function buildReferralEmailBody({ sampleChaptersLink, thumbnailUrl }) {
  const text = `I just finished The Agnes Protocol and immediately thought of you.

Start with the free sample chapters below.

If you decide to buy the book, I already got you 15% off.

The reviews have been outstanding, but don't take anyone else's word for it.

Read the sample chapters.

I think you'll understand why readers are recommending this book to their friends.

${sampleChaptersLink}`;

  const html = `<p>I just finished <em>The Agnes Protocol</em> and immediately thought of you.</p>
<p>Start with the free sample chapters below.</p>
<p>If you decide to buy the book, I already got you 15% off.</p>
<p>The reviews have been outstanding, but don't take anyone else's word for it.</p>
<p>Read the sample chapters.</p>
<p>I think you'll understand why readers are recommending this book to their friends.</p>
<p><br></p>
<p><a href="${sampleChaptersLink}">${sampleChaptersLink}</a></p>
<p style="text-align: center; margin: 24px 0 0;">
  <a href="${sampleChaptersLink}" style="display: inline-block;">
    <img
      src="${thumbnailUrl}"
      alt="Read sample chapters from The Agnes Protocol"
      width="560"
      style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
    />
  </a>
</p>`;

  return { text, html };
}

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

    const siteBase = siteRoot.replace(/\/$/, '');
    const sampleChaptersLink = code
      ? `${siteBase}/sample-chapters?ref=${encodeURIComponent(code)}`
      : `${siteBase}/sample-chapters`;
    const sampleChaptersThumbnailUrl = `${siteBase}${SAMPLE_CHAPTERS_THUMBNAIL_PATH}`;

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

    const subject = REFERRAL_EMAIL_SUBJECT();

    const vidId = videoId || videoVariant;

    // Send emails to all recipients and track results
    // Also update lastReferral fields on recipient users (Part A2)
    const sendPromises = emails.map(async (email) => {
      try {
        const { text: bodyText, html: bodyHtml } = buildReferralEmailBody({
          sampleChaptersLink,
          thumbnailUrl: sampleChaptersThumbnailUrl,
        });

        const { html: finalHtml, text: finalText, subject: finalSubject } = applyGlobalEmailBanner({
          html: bodyHtml,
          text: bodyText,
          subject,
        });

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
          const mailableFriend = guardMailableEmail(email, 'refer_friend');
          if (!mailableFriend) {
            return { email, success: false, error: 'non_mailable_recipient' };
          }
          emailResult = await mailchimpClient.messages.send({
            message: {
              from_email: fromEmailAddr,
              from_name: fromDisplayName,
              to: [{ email: mailableFriend, type: 'to' }],
              subject: finalSubject || subject,
              text: finalText || bodyText,
              html: finalHtml || bodyHtml,
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

              const isSelf = isSelfReferral({
                buyerEmail: normalizedFriendEmail,
                sponsorEmail: (referrerEmail && normalizeEmail(referrerEmail)) || null,
                buyerUserId: recipientUser.id,
                sponsorUserId: referrerUserId,
              });

              if (isSelf) {
                console.warn('[SELF_REFERRAL_GUARD] self_referral_blocked_at_creation', {
                  buyerUserId: recipientUser.id,
                  buyerEmail: normalizeIdentityEmail(normalizedFriendEmail),
                  sponsorUserId: referrerUserId,
                  sponsorEmail: normalizeIdentityEmail(referrerEmail || null),
                  source: 'referFriend.email_send',
                  referralCode: normalizeReferralCode(code),
                });
              } else {
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

