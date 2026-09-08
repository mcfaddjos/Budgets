const crypto = require("node:crypto");
const db = require("./db");

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

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function seedDefaultCategories(userId) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO categories (user_id, name) VALUES (?, ?)"
  );
  for (const name of DEFAULT_CATEGORIES) {
    insert.run(userId, name);
  }
}

function createUser(username, password) {
  const passwordHash = hashPassword(password);
  const result = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, passwordHash);
  const userId = Number(result.lastInsertRowid);
  seedDefaultCategories(userId);
  return userId;
}

function findUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(
    token,
    userId
  );
  return token;
}

function getUserByToken(token) {
  return db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .get(token);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: "Invalid or expired token" });

  req.user = user;
  next();
}

module.exports = {
  DEFAULT_CATEGORIES,
  hashPassword,
  verifyPassword,
  createUser,
  findUserByUsername,
  createSession,
  getUserByToken,
  requireAuth,
};
