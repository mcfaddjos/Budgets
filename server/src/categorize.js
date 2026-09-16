const db = require("./db");

/**
 * Default keyword -> category rules, checked when a user has no matching
 * personal rule yet. Keywords are matched against the normalized
 * (uppercased, punctuation-stripped) transaction description.
 */
const DEFAULT_RULES = [
  { category: "Groceries", keywords: ["KROGER", "SAFEWAY", "TRADER JOE", "WHOLE FOODS", "ALDI", "PUBLIX", "WEGMANS", "COSTCO"] },
  { category: "Dining", keywords: ["STARBUCKS", "CHIPOTLE", "MCDONALD", "DOORDASH", "UBER EATS", "GRUBHUB", "RESTAURANT", "COFFEE", "PIZZA"] },
  { category: "Transport", keywords: ["UBER", "LYFT", "SHELL", "CHEVRON", "EXXON", "PARKING", "TRANSIT", "DELTA", "SOUTHWEST", "UNITED AIR"] },
  { category: "Utilities", keywords: ["ELECTRIC", "GAS COMPANY", "WATER UTIL", "COMCAST", "XFINITY", "VERIZON", "AT&T", "T-MOBILE", "INTERNET"] },
  { category: "Entertainment", keywords: ["NETFLIX", "SPOTIFY", "HULU", "DISNEY+", "HBO", "AMC", "STEAM", "PRIME VIDEO"] },
  { category: "Shopping", keywords: ["AMAZON", "TARGET", "WALMART", "BEST BUY", "EBAY"] },
  { category: "Health", keywords: ["PHARMACY", "CVS", "WALGREENS", "MEDICAL", "DENTAL", "CLINIC"] },
  { category: "Travel", keywords: ["HOTEL", "AIRBNB", "MARRIOTT", "HILTON", "EXPEDIA"] },
  { category: "Payment", keywords: ["PAYMENT THANK YOU", "AUTOPAY", "ONLINE PAYMENT", "CARD PAYMENT"] },
  { category: "Income", keywords: ["PAYROLL", "DIRECT DEPOSIT", "DEPOSIT"] },
];

function getCategoryIdByName(userId, name) {
  const row = db
    .prepare("SELECT id FROM categories WHERE user_id = ? AND name = ?")
    .get(userId, name);
  return row ? row.id : null;
}

function getUncategorizedId(userId) {
  return getCategoryIdByName(userId, "Uncategorized");
}

/** Returns a category_id for a normalized description, or null if no rule matches. */
function categorize(userId, normalizedDescription) {
  const userRules = db
    .prepare("SELECT pattern, category_id FROM category_rules WHERE user_id = ?")
    .all(userId);

  for (const rule of userRules) {
    if (normalizedDescription.includes(rule.pattern)) {
      return rule.category_id;
    }
  }

  for (const rule of DEFAULT_RULES) {
    if (rule.keywords.some((kw) => normalizedDescription.includes(kw))) {
      const categoryId = getCategoryIdByName(userId, rule.category);
      if (categoryId) return categoryId;
    }
  }

  return null;
}

/**
 * Saves a personal rule mapping a merchant keyword (derived from the
 * transaction's normalized description) to a category, so future imports
 * auto-categorize the same merchant the same way.
 */
function saveRule(userId, normalizedDescription, categoryId) {
  const pattern = normalizedDescription.split(" ").slice(0, 3).join(" ");
  if (!pattern) return;
  db.prepare(
    `INSERT INTO category_rules (user_id, pattern, category_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, pattern) DO UPDATE SET category_id = excluded.category_id`
  ).run(userId, pattern, categoryId);
}

module.exports = { DEFAULT_RULES, categorize, getUncategorizedId, saveRule };
