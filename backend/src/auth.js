const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const db = require("./db");

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — appscript backend's sessions never expired at all (PRD §10 gap)

const googleClient = new OAuth2Client();

/**
 * The entire login-auth check (§10a): verifies the ID token's signature,
 * audience, and expiry against Google's own public keys. There is no
 * local password to check at all — a vault passphrase exists (see
 * app/src/crypto/keys.js) but it's for the encryption key chain, never
 * sent to or checked by the server.
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken) throw new Error("Missing Google ID token");
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured on the server");

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) throw new Error("Invalid Google ID token");

  return { googleId: payload.sub, email: payload.email, name: payload.name || null };
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

module.exports = {
  verifyGoogleIdToken,
  newToken,
  createSession,
  requireAuth,
};
