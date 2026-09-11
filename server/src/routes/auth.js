const express = require("express");
const {
  createUser,
  findUserByUsername,
  verifyPassword,
  createSession,
} = require("../auth");

const router = express.Router();

router.post("/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({ error: "username already taken" });
  }

  const userId = createUser(username, password);
  const token = createSession(userId);
  res.status(201).json({ token, user: { id: userId, username } });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid username or password" });
  }

  const token = createSession(user.id);
  res.json({ token, user: { id: user.id, username: user.username } });
});

module.exports = router;
