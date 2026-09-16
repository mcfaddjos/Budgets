/**
 * Username/password auth, ported from server/src/auth.js. Node's
 * crypto.scryptSync isn't available in Apps Script, so passwords are hashed
 * with salted, iterated HMAC-SHA256 instead (slow enough to resist brute
 * force at this scale). A failed-login lockout is added on top of the
 * original design, since this Web App URL is internet-reachable rather than
 * LAN-only.
 */

const DEFAULT_CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Health",
  "Travel",
  "Payment",
  "Income",
  "Uncategorized",
];

const HASH_ITERATIONS = 10000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function bytesToHex_(bytes) {
  return bytes.map((b) => ("0" + ((b + 256) % 256).toString(16)).slice(-2)).join("");
}

function hashPassword_(password, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, "");
  let value = password;
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    value = bytesToHex_(Utilities.computeHmacSha256Signature(value, salt));
  }
  return `${salt}:${HASH_ITERATIONS}:${value}`;
}

function verifyPassword_(password, stored) {
  const parts = String(stored).split(":");
  const salt = parts[0];
  const hash = parts[2];
  if (!salt || !hash) return false;
  const candidateHash = hashPassword_(password, salt).split(":")[2];
  if (candidateHash.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidateHash.length; i++) {
    diff |= candidateHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

function seedDefaultCategories_(userId) {
  DEFAULT_CATEGORIES.forEach((name) => {
    appendRow_("Categories", { id: newId_(), userId, name });
  });
}

function createSession_(userId) {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  appendRow_("Sessions", { token, userId, createdAt: new Date().toISOString() });
  return token;
}

function requireAuth_(token) {
  if (!token) throw new Error("Missing auth token");
  const session = readAll_("Sessions").find((s) => s.token === token);
  if (!session) throw new Error("Invalid or expired token");
  const user = readAll_("Users").find((u) => u.id === session.userId);
  if (!user) throw new Error("Invalid or expired token");
  return user;
}

/**
 * Registration is invite-only: the caller must supply the code set as the
 * INVITE_CODE script property (Project Settings > Script Properties in the
 * Apps Script editor). This is a stopgap until Google Sign-In restricts
 * the Web App to specific accounts directly — for now the deployment stays
 * open to "Anyone" so the app can call it with a plain fetch(), and this is
 * what stops a stranger who finds the /exec URL from creating an account.
 */
function checkInviteCode_(inviteCode) {
  const expected = PropertiesService.getScriptProperties().getProperty("INVITE_CODE");
  if (!expected) throw new Error("Registration is not configured yet (no INVITE_CODE set)");
  if (inviteCode !== expected) throw new Error("Invalid invite code");
}

function handleRegister_(payload) {
  const { username, password, inviteCode } = payload || {};
  if (!username || !password) throw new Error("username and password are required");
  checkInviteCode_(inviteCode);
  if (readAll_("Users").find((u) => u.username === username)) {
    throw new Error("username already taken");
  }

  const id = newId_();
  appendRow_("Users", {
    id,
    username,
    passwordHash: hashPassword_(password),
    failedAttempts: 0,
    lockedUntil: "",
    createdAt: new Date().toISOString(),
  });
  seedDefaultCategories_(id);

  const token = createSession_(id);
  return { token, user: { id, username } };
}

function handleMe_(user) {
  return { id: user.id, username: user.username };
}

function handleLogin_(payload) {
  const { username, password } = payload || {};
  if (!username || !password) throw new Error("username and password are required");

  const user = readAll_("Users").find((u) => u.username === username);
  if (!user) throw new Error(`No account found for username "${username}"`);

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    throw new Error("Account temporarily locked after repeated failed logins. Try again later.");
  }

  if (!verifyPassword_(password, user.passwordHash)) {
    const attempts = (Number(user.failedAttempts) || 0) + 1;
    const patch = { failedAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      patch.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      patch.failedAttempts = 0;
    }
    updateRow_("Users", user._rowNumber, patch);
    throw new Error("Incorrect password");
  }

  updateRow_("Users", user._rowNumber, { failedAttempts: 0, lockedUntil: "" });
  const token = createSession_(user.id);
  return { token, user: { id: user.id, username: user.username } };
}
