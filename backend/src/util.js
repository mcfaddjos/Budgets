/** Direct port of appscript/Csv.gs's normalizeDescription_. */
function normalizeDescription(raw) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

module.exports = { normalizeDescription, currentMonth };
