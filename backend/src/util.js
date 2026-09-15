// normalizeDescription used to live here, but description is encrypted
// client-side now (§10a) — the equivalent lives in
// app/src/categorize/defaults.js, the only place that ever sees plaintext.

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

module.exports = { currentMonth };
