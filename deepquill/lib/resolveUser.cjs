// deepquill/lib/resolveUser.cjs
// Resolve user by email from cookies/headers

const { prisma } = require('../server/prisma.cjs');
const { normalizeEmail } = require('../src/lib/normalize.cjs');

function getEmailFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const contestMatch = cookieHeader.match(/contest_email=([^;]+)/);
  const userMatch = cookieHeader.match(/user_email=([^;]+)/);
  const mockMatch = cookieHeader.match(/mockEmail=([^;]+)/);
  const associateMatch = cookieHeader.match(/associate_email=([^;]+)/);

  const cookieEmail =
    (contestMatch?.[1] && decodeURIComponent(contestMatch[1])) ||
    (userMatch?.[1] && decodeURIComponent(userMatch[1])) ||
    (mockMatch?.[1] && decodeURIComponent(mockMatch[1])) ||
    (associateMatch?.[1] && decodeURIComponent(associateMatch[1])) ||
    null;

  const headerEmail = req.headers['x-user-email'];
  return headerEmail || cookieEmail;
}

async function resolveUserByEmail(req) {
  const emailRaw = getEmailFromRequest(req);
  const email = normalizeEmail(emailRaw);
  if (!email) return null;

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, points: true },
  });
  return user;
}

module.exports = {
  getEmailFromRequest,
  resolveUserByEmail,
};
