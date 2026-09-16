// Categorization logic used to live server-side (backend/src/categorize.js)
// but had to move here entirely: it matches a transaction's description
// against household rules and a default keyword list, and description is
// encrypted client-side now (§10a) — the server never sees it to compare
// against anything. Direct port of the old appscript/Categorize.gs logic.

export const DEFAULT_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Utilities", "Entertainment",
  "Shopping", "Health", "Travel", "Payment", "Income", "Uncategorized",
];

export const DEFAULT_RULES = [
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

export function normalizeDescription(raw) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches household-defined rules first (a user's own corrections should
 * win over the shipped defaults), then falls back to DEFAULT_RULES.
 * `householdRules` is the household's already-decrypted CategoryRule list
 * (each with a plaintext `pattern`), `categoryIdByName` maps a category's
 * decrypted name to its id.
 */
export function categorize(normalizedDescription, householdRules, categoryIdByName) {
  for (const rule of householdRules) {
    if (normalizedDescription.includes(rule.pattern)) return rule.categoryId;
  }
  for (const rule of DEFAULT_RULES) {
    if (rule.keywords.some((kw) => normalizedDescription.includes(kw))) {
      const categoryId = categoryIdByName[rule.category];
      if (categoryId) return categoryId;
    }
  }
  return null;
}

/** Direct port of the old server-side saveRule_'s pattern derivation — first three words of the normalized description. */
export function derivePatternFromDescription(normalizedDescription) {
  return normalizedDescription.split(" ").slice(0, 3).join(" ");
}
