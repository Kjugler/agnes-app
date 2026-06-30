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
const { normalizePhone } = require('../../src/lib/normalize.cjs');

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

function serializeReader(profile, user, lastActivity) {
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
    lastActivity,
    notes: profile.notes || '',
    smsConsentGranted: Boolean(profile.smsConsentGranted),
    smsConsentAt: profile.smsConsentAt ? profile.smsConsentAt.toISOString() : null,
    smsConsentSource: profile.smsConsentSource || '',
    smsConsentNotes: profile.smsConsentNotes || '',
    textAFriendUrl: buildTextAFriendUrl(referralCode, user.email),
    sampleChaptersUrl: buildSampleChaptersUrl(referralCode),
    userCreatedAt: user.createdAt.toISOString(),
  };
}

/** GET /api/admin/readers — list with search and filters */
router.get('/', async (req, res) => {
  try {
    ensureDatabaseUrl();
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const where = {};
    if (source && source !== 'all') {
      where.source = source;
    }
    if (status && status !== 'all') {
      where.status = status;
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
        return serializeReader(p, p.user, lastActivity);
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
    return res.json({
      ok: true,
      reader: serializeReader(profile, ensuredUser, lastActivity),
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
    const reader = serializeReader(profile, updatedUser, lastActivity);

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

module.exports = router;
