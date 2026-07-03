// deepquill/server/routes/adminReaders.cjs — Reader Manager Phase I (CRM foundation)

const express = require('express');
const { prisma } = require('../prisma.cjs');
const { ensureDatabaseUrl } = require('../prisma.cjs');
const {
  READER_SOURCES,
  READER_TYPE_LABELS,
  READER_STATUS_LABELS,
  SMS_CONSENT_SOURCES,
  isValidReaderSource,
  isValidReaderType,
  isValidReaderStatus,
  isValidSmsConsentSource,
} = require('../../lib/readers/readerConstants.cjs');
const {
  ensureReaderContact,
  backfillUserCodes,
  validateReaderIdentifier,
  appendNotes,
  displayName,
} = require('../../lib/readers/readerUser.cjs');
const { displayReaderEmail, deriveContactKind } = require('../../lib/readers/readerSyntheticEmail.cjs');
const { buildTextAFriendUrl, buildSampleChaptersUrl } = require('../../lib/readers/readerUrls.cjs');
const { normalizePhone, isSyntheticReaderEmail } = require('../../src/lib/normalize.cjs');
const { validateAdminReaderEmail } = require('../../lib/readers/readerEmailValidation.cjs');
const { buildSyntheticEmailForPhone } = require('../../lib/readers/readerSyntheticEmail.cjs');

const router = express.Router();

const userSelect = {
  id: true,
  email: true,
  phone: true,
  fname: true,
  lname: true,
  firstName: true,
  code: true,
  referralCode: true,
  createdAt: true,
};

function isAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.use((req, res, next) => {
  if (!isAdminAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden - x-admin-key required in production' });
  }
  next();
});

async function resolveMailingAddress(user) {
  const customer =
    (await prisma.customer.findFirst({ where: { userId: user.id } })) ||
    (user.email
      ? await prisma.customer.findUnique({ where: { email: user.email } })
      : null);

  if (!customer) return null;

  const street = (customer.shippingStreet || '').trim();
  const city = (customer.shippingCity || '').trim();
  const state = (customer.shippingState || '').trim();
  const zip = (customer.shippingZip || '').trim();
  const country = (customer.shippingCountry || '').trim();

  if (!street && !city && !state && !zip && !country) return null;

  return {
    customerId: customer.id,
    street,
    city,
    state,
    zip,
    country,
    formatted: [street, city, state, zip, country].filter(Boolean).join(', '),
  };
}

function serializeMailingAddress(address) {
  if (!address) return null;
  return {
    customerId: address.customerId,
    street: address.street,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    formatted: address.formatted,
  };
}

async function resolveLastActivity(userId) {
  const [latestPurchase, latestEvent] = await Promise.all([
    prisma.purchase.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.event.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const candidates = [
    latestPurchase?.createdAt,
    latestEvent?.createdAt,
  ].filter(Boolean);

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime()))).toISOString();
}

function serializeReader(profile, user, lastActivity, mailingAddress) {
  const referralCode = (user.referralCode || user.code || '').trim();
  const name = displayName(user);
  const displayEmail = displayReaderEmail(user.email);
  const phone = (user.phone || '').trim();
  const contactKind = deriveContactKind({
    email: user.email,
    phone,
    firstName: user.firstName || user.fname,
    lastName: user.lname,
    notes: profile.notes,
  });

  return {
    id: profile.id,
    userId: user.id,
    name,
    firstName: user.firstName || user.fname || '',
    lastName: user.lname || '',
    email: displayEmail || '',
    displayEmail,
    hasRealEmail: Boolean(displayEmail),
    phone,
    contactKind,
    source: profile.source || '',
    readerType: profile.readerType || '',
    readerTypeLabel: profile.readerType ? READER_TYPE_LABELS[profile.readerType] || profile.readerType : '',
    status: profile.status || 'active',
    statusLabel: READER_STATUS_LABELS[profile.status] || profile.status,
    referralCode,
    dateAdded: profile.createdAt.toISOString(),
    lastUpdated: profile.updatedAt.toISOString(),
    lastActivity,
    notes: profile.notes || '',
    smsConsentGranted: Boolean(profile.smsConsentGranted),
    smsConsentAt: profile.smsConsentAt ? profile.smsConsentAt.toISOString() : null,
    smsConsentSource: profile.smsConsentSource || '',
    smsConsentNotes: profile.smsConsentNotes || '',
    textAFriendUrl: buildTextAFriendUrl(referralCode, user.email),
    sampleChaptersUrl: buildSampleChaptersUrl(referralCode),
    userCreatedAt: user.createdAt.toISOString(),
    mailingAddress: serializeMailingAddress(mailingAddress),
  };
}

/** GET /api/admin/readers — list with search and filters */
router.get('/', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const includeArchived =
      req.query.includeArchived === '1' || req.query.includeArchived === 'true';

    const where = {};
    if (source && source !== 'all') {
      where.source = source;
    }
    if (status && status !== 'all') {
      where.status = status;
    } else if (!includeArchived) {
      where.status = { not: 'archived' };
    }

    const profiles = await prisma.readerProfile.findMany({
      where,
      include: {
        user: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    let rows = profiles;

    if (q) {
      rows = profiles.filter((p) => {
        const u = p.user;
        const name = displayName(u).toLowerCase();
        const phoneDigits = (u.phone || '').replace(/\D/g, '');
        const displayEmail = displayReaderEmail(u.email)?.toLowerCase() || '';
        const haystack = [
          name,
          displayEmail,
          phoneDigits,
          u.phone?.toLowerCase() || '',
          p.source?.toLowerCase() || '',
          p.notes?.toLowerCase() || '',
          p.smsConsentSource?.toLowerCase() || '',
          p.smsConsentNotes?.toLowerCase() || '',
          u.referralCode?.toLowerCase() || '',
          u.code?.toLowerCase() || '',
        ].join(' ');
        return haystack.includes(q);
      });
    }

    const readers = await Promise.all(
      rows.map(async (p) => {
        const lastActivity = await resolveLastActivity(p.userId);
        const mailingAddress = await resolveMailingAddress(p.user);
        return serializeReader(p, p.user, lastActivity, mailingAddress);
      }),
    );

    return res.json({
      ok: true,
      readers,
      meta: {
        count: readers.length,
        sources: READER_SOURCES,
        statuses: Object.keys(READER_STATUS_LABELS),
        smsConsentSources: SMS_CONSENT_SOURCES,
      },
    });
  } catch (err) {
    console.error('[admin/readers] list error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to list readers' });
  }
});

/** GET /api/admin/readers/:id */
router.get('/:id', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const profile = await prisma.readerProfile.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: userSelect },
      },
    });

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'Reader not found' });
    }

    let ensuredUser = await backfillUserCodes(prisma, profile.user);
    const lastActivity = await resolveLastActivity(profile.userId);
    const mailingAddress = await resolveMailingAddress(ensuredUser);
    return res.json({
      ok: true,
      reader: serializeReader(profile, ensuredUser, lastActivity, mailingAddress),
    });
  } catch (err) {
    console.error('[admin/readers] get error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to load reader' });
  }
});

/** POST /api/admin/readers — create or update reader CRM record */
router.post('/', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const body = req.body || {};
    const emailRaw = body.email;
    const phoneRaw = body.phone;
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    const readerType = typeof body.readerType === 'string' ? body.readerType.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : 'active';
    const smsConsentGranted = Boolean(body.smsConsentGranted);
    const smsConsentSource =
      typeof body.smsConsentSource === 'string' ? body.smsConsentSource.trim() : '';
    const smsConsentNotes =
      typeof body.smsConsentNotes === 'string' ? body.smsConsentNotes.trim() : '';

    const identifier = validateReaderIdentifier({
      email: emailRaw,
      phone: phoneRaw,
      firstName,
      lastName,
      notes,
    });
    if (!identifier.ok) {
      return res.status(400).json({ ok: false, error: identifier.error });
    }

    if (typeof emailRaw === 'string' && emailRaw.trim()) {
      const emailCheck = validateAdminReaderEmail(emailRaw);
      if (!emailCheck.ok) {
        return res.status(400).json({ ok: false, error: emailCheck.error });
      }
    }

    const normalizedPhone = identifier.normalizedPhone;

    if (smsConsentGranted && !normalizedPhone) {
      return res.status(400).json({
        ok: false,
        error: 'SMS consent requires a valid phone number.',
      });
    }
    if (smsConsentGranted && smsConsentSource && !isValidSmsConsentSource(smsConsentSource)) {
      return res.status(400).json({ ok: false, error: 'Invalid SMS consent source' });
    }
    if (smsConsentGranted && !smsConsentSource) {
      return res.status(400).json({
        ok: false,
        error: 'SMS consent source is required when consent is granted.',
      });
    }

    if (source && !isValidReaderSource(source)) {
      return res.status(400).json({ ok: false, error: 'Invalid reader source' });
    }
    if (readerType && !isValidReaderType(readerType)) {
      return res.status(400).json({ ok: false, error: 'Invalid reader type' });
    }
    if (status && !isValidReaderStatus(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    let user;
    let userCreated = false;
    try {
      const result = await ensureReaderContact(prisma, {
        email: emailRaw,
        phone: phoneRaw,
        firstName,
        lastName,
        notes,
      });
      user = result.user;
      userCreated = result.created;
    } catch (contactErr) {
      if (contactErr?.code === 'P2002') {
        return res.status(409).json({
          ok: false,
          error: 'A reader with this phone number already exists.',
        });
      }
      throw contactErr;
    }

    const nameUpdates = {};
    if (firstName && !(user.firstName || user.fname)) {
      nameUpdates.firstName = firstName;
      nameUpdates.fname = firstName;
    }
    if (lastName && !user.lname) {
      nameUpdates.lname = lastName;
    }
    if (normalizedPhone && !(user.phone || '').trim()) {
      nameUpdates.phone = normalizedPhone;
    }
    let updatedUser = user;
    if (Object.keys(nameUpdates).length > 0) {
      try {
        updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: nameUpdates,
        });
      } catch (updateErr) {
        if (updateErr?.code === 'P2002') {
          return res.status(409).json({
            ok: false,
            error: 'A reader with this phone number already exists.',
          });
        }
        throw updateErr;
      }
    }

    const smsData = {};
    if (smsConsentGranted) {
      smsData.smsConsentGranted = true;
      smsData.smsConsentAt = new Date();
      smsData.smsConsentSource = smsConsentSource;
      smsData.smsConsentNotes = smsConsentNotes || null;
    }

    let profile = await prisma.readerProfile.findUnique({ where: { userId: user.id } });
    const profileCreated = !profile;

    if (!profile) {
      profile = await prisma.readerProfile.create({
        data: {
          userId: user.id,
          source: source || null,
          readerType: readerType || null,
          notes: notes ? appendNotes(null, notes) : null,
          status: status || 'active',
          ...smsData,
        },
      });
    } else {
      const data = {
        status: status || profile.status,
        ...smsData,
      };
      if (readerType) {
        data.readerType = readerType;
      }
      if (source && !profile.source) {
        data.source = source;
      }
      if (notes) {
        data.notes = appendNotes(profile.notes, notes);
      }
      profile = await prisma.readerProfile.update({
        where: { id: profile.id },
        data,
      });
    }

    const lastActivity = await resolveLastActivity(user.id);
    const mailingAddress = await resolveMailingAddress(updatedUser);
    const reader = serializeReader(profile, updatedUser, lastActivity, mailingAddress);

    return res.json({
      ok: true,
      created: userCreated || profileCreated,
      message: profileCreated ? 'Reader created successfully.' : 'Reader updated successfully.',
      reader,
    });
  } catch (err) {
    console.error('[admin/readers] save error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to save reader' });
  }
});

/** PATCH /api/admin/readers/:id — edit reader contact info (does not touch referral codes or purchases) */
router.patch('/:id', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const profile = await prisma.readerProfile.findUnique({
      where: { id: req.params.id },
      include: { user: { select: userSelect } },
    });

    if (!profile) {
      return res.status(404).json({ ok: false, error: 'Reader not found' });
    }

    const body = req.body || {};
    const user = profile.user;
    const hadRealEmail = !isSyntheticReaderEmail(user.email);

    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const emailRaw = typeof body.email === 'string' ? body.email : undefined;
    const phoneRaw = typeof body.phone === 'string' ? body.phone : undefined;
    const source = typeof body.source === 'string' ? body.source.trim() : undefined;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
    const smsConsentGranted =
      body.smsConsentGranted === undefined ? undefined : Boolean(body.smsConsentGranted);
    const smsConsentSource =
      typeof body.smsConsentSource === 'string' ? body.smsConsentSource.trim() : '';
    const smsConsentNotes =
      typeof body.smsConsentNotes === 'string' ? body.smsConsentNotes.trim() : '';
    const archive = body.archive === true || body.status === 'archived';
    const restore = body.restore === true || (body.status === 'active' && body.restore !== false);

    const contactFieldPresent =
      body.firstName !== undefined ||
      body.lastName !== undefined ||
      body.email !== undefined ||
      body.phone !== undefined ||
      body.source !== undefined ||
      body.notes !== undefined ||
      body.smsConsentGranted !== undefined ||
      body.smsConsentSource !== undefined ||
      body.smsConsentNotes !== undefined ||
      body.mailingAddress !== undefined;

    if ((archive && !restore && !contactFieldPresent) || (restore && !archive && !contactFieldPresent)) {
      const updatedProfile = await prisma.readerProfile.update({
        where: { id: profile.id },
        data: { status: restore ? 'active' : 'archived' },
      });
      const updatedUser = await backfillUserCodes(prisma, user);
      const lastActivity = await resolveLastActivity(updatedUser.id);
      const mailingAddress = await resolveMailingAddress(updatedUser);
      return res.json({
        ok: true,
        message: restore
          ? 'Reader restored to active.'
          : 'Reader archived. Their referral history and purchases are preserved.',
        reader: serializeReader(updatedProfile, updatedUser, lastActivity, mailingAddress),
      });
    }

    const normalizedPhone =
      phoneRaw !== undefined ? normalizePhone(phoneRaw) : normalizePhone(user.phone);
    const effectivePhone = phoneRaw !== undefined ? normalizedPhone : user.phone;

    const trimmedNotes = notes !== undefined ? notes : profile.notes || '';
    const hasNameAndNotes =
      Boolean(firstName || lastName || user.firstName || user.fname || user.lname) &&
      trimmedNotes.trim().length >= 3;

    let normalizedEmail = null;
    if (emailRaw !== undefined) {
      const emailCheck = validateAdminReaderEmail(emailRaw, {
        hadRealEmail,
        hasPhone: Boolean(effectivePhone),
        hasNameAndNotes,
      });
      if (!emailCheck.ok) {
        return res.status(400).json({ ok: false, error: emailCheck.error });
      }
      normalizedEmail = emailCheck.normalizedEmail;
    } else if (hadRealEmail) {
      normalizedEmail = user.email;
    }

    const willHaveEmail = Boolean(normalizedEmail);
    const willHavePhone = Boolean(effectivePhone);
    if (!willHaveEmail && !willHavePhone && !hasNameAndNotes) {
      return res.status(400).json({
        ok: false,
        error:
          'Each reader needs an email address, a phone number, or a name plus notes (at least 3 characters).',
      });
    }

    if (source !== undefined && source && !isValidReaderSource(source)) {
      return res.status(400).json({ ok: false, error: 'Invalid reader source' });
    }

    if (smsConsentGranted === true && !effectivePhone) {
      return res.status(400).json({
        ok: false,
        error: 'SMS consent requires a valid phone number.',
      });
    }
    if (smsConsentGranted === true && !smsConsentSource) {
      return res.status(400).json({
        ok: false,
        error: 'Select how SMS consent was obtained.',
      });
    }
    if (smsConsentGranted === true && smsConsentSource && !isValidSmsConsentSource(smsConsentSource)) {
      return res.status(400).json({ ok: false, error: 'Invalid SMS consent source' });
    }

    const userUpdates = {};
    if (typeof body.firstName === 'string') {
      const v = body.firstName.trim();
      userUpdates.firstName = v || null;
      userUpdates.fname = v || null;
    }
    if (typeof body.lastName === 'string') {
      userUpdates.lname = body.lastName.trim() || null;
    }

    if (phoneRaw !== undefined) {
      userUpdates.phone = normalizedPhone || null;
    }

    if (emailRaw !== undefined) {
      let nextEmail = normalizedEmail;
      if (!nextEmail) {
        if (effectivePhone) {
          nextEmail = buildSyntheticEmailForPhone(effectivePhone);
        } else if (hasNameAndNotes) {
          nextEmail = user.email;
        }
      }
      if (nextEmail && nextEmail !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email: nextEmail } });
        if (existing && existing.id !== user.id) {
          return res.status(409).json({
            ok: false,
            error: 'Another reader already uses that email address.',
          });
        }
        userUpdates.email = nextEmail;
      }
    }

    const profileUpdates = {};
    if (source !== undefined) {
      profileUpdates.source = source || null;
    }
    if (notes !== undefined) {
      profileUpdates.notes = notes || null;
    }
    if (archive && !restore) {
      profileUpdates.status = 'archived';
    } else if (restore) {
      profileUpdates.status = 'active';
    }

    if (smsConsentGranted === true) {
      profileUpdates.smsConsentGranted = true;
      if (!profile.smsConsentAt) {
        profileUpdates.smsConsentAt = new Date();
      }
      profileUpdates.smsConsentSource = smsConsentSource;
      profileUpdates.smsConsentNotes = smsConsentNotes || null;
    } else if (smsConsentGranted === false) {
      profileUpdates.smsConsentGranted = false;
      profileUpdates.smsConsentSource = null;
      profileUpdates.smsConsentNotes = null;
    }

    let updatedUser = user;
    if (Object.keys(userUpdates).length > 0) {
      try {
        updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: userUpdates,
        });
      } catch (updateErr) {
        if (updateErr?.code === 'P2002') {
          const target = updateErr?.meta?.target;
          const field = Array.isArray(target) ? target.join(', ') : 'contact info';
          return res.status(409).json({
            ok: false,
            error:
              field.includes('phone')
                ? 'Another reader already uses that phone number.'
                : 'Another reader already uses that email address.',
          });
        }
        throw updateErr;
      }

      if (userUpdates.email && userUpdates.email !== user.email) {
        const customer =
          (await prisma.customer.findFirst({ where: { userId: user.id } })) ||
          (user.email
            ? await prisma.customer.findUnique({ where: { email: user.email } })
            : null);
        if (customer) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: { email: userUpdates.email },
          });
        }
      }
    }

    let updatedProfile = profile;
    if (Object.keys(profileUpdates).length > 0) {
      updatedProfile = await prisma.readerProfile.update({
        where: { id: profile.id },
        data: profileUpdates,
      });
    }

    const mailing = body.mailingAddress;
    if (mailing && typeof mailing === 'object') {
      const existingAddress = await resolveMailingAddress(updatedUser);
      if (existingAddress?.customerId) {
        const customerData = {};
        if (typeof mailing.street === 'string') {
          customerData.shippingStreet = mailing.street.trim() || null;
        }
        if (typeof mailing.city === 'string') {
          customerData.shippingCity = mailing.city.trim() || null;
        }
        if (typeof mailing.state === 'string') {
          customerData.shippingState = mailing.state.trim() || null;
        }
        if (typeof mailing.zip === 'string') {
          customerData.shippingZip = mailing.zip.trim() || null;
        }
        if (typeof mailing.country === 'string') {
          customerData.shippingCountry = mailing.country.trim() || null;
        }
        if (Object.keys(customerData).length > 0) {
          await prisma.customer.update({
            where: { id: existingAddress.customerId },
            data: customerData,
          });
        }
      }
    }

    updatedUser = await backfillUserCodes(prisma, updatedUser);
    const lastActivity = await resolveLastActivity(updatedUser.id);
    const mailingAddress = await resolveMailingAddress(updatedUser);

    let message = 'Reader updated successfully.';
    if (archive && !restore) {
      message = 'Reader archived. Their referral history and purchases are preserved.';
    } else if (restore) {
      message = 'Reader restored to active.';
    }

    return res.json({
      ok: true,
      message,
      reader: serializeReader(updatedProfile, updatedUser, lastActivity, mailingAddress),
    });
  } catch (err) {
    console.error('[admin/readers] patch error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to update reader' });
  }
});

module.exports = router;
