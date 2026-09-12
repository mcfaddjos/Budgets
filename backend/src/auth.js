const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — appscript backend's sessions never expired at all (PRD §10 gap)
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(userId) {
  const token = newToken();
  await db.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

/** Returns the authenticated User row, or throws. Expired sessions are deleted on the way out, not just rejected. */
async function requireAuth(token) {
  if (!token) throw new Error("Missing auth token");

  const session = await db.session.findUnique({ where: { token } });
  if (!session) throw new Error("Invalid or expired token");

  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token } }).catch(() => {});
    throw new Error("Invalid or expired token");
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new Error("Invalid or expired token");
  return user;
}

async function recordFailedLogin(user) {
  const attempts = user.failedAttempts + 1;
  const data = { failedAttempts: attempts };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    data.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    data.failedAttempts = 0;
  }
  await db.user.update({ where: { id: user.id }, data });
}

async function clearFailedLogins(userId) {
  await db.user.update({ where: { id: userId }, data: { failedAttempts: 0, lockedUntil: null } });
}

function isLocked(user) {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  hashPassword,
  verifyPassword,
  newToken,
  createSession,
  requireAuth,
  recordFailedLogin,
  clearFailedLogins,
  isLocked,
};
