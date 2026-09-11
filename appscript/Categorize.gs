/**
 * Direct port of server/src/categorize.js. Keyword -> category rules,
 * checked when a user has no matching personal rule yet. Keywords are
 * matched against the normalized (uppercased, punctuation-stripped)
 * transaction description.
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

/**
 * Loads Categories + CategoryRules once and returns a categorizer closure —
 * used by importTransactionRows_, which categorizes many rows per call.
 * The old per-row version (a fresh readAll_ per transaction) was the main
 * cause of multi-second/minute imports: every additional row meant two more
 * full round-trips to the spreadsheet, on top of everything else in the loop.
 */
function buildCategorizer_(userId) {
  const categoryIdByName = {};
  getUserCategories_(userId).forEach((c) => {
    categoryIdByName[c.name] = c.id;
  });

  const userRules = getUserCategoryRules_(userId);

  return {
    uncategorizedId: categoryIdByName["Uncategorized"] || null,
    categorize(normalizedDescription) {
      for (const rule of userRules) {
        if (normalizedDescription.indexOf(rule.pattern) !== -1) return rule.categoryId;
      }
      for (const rule of DEFAULT_RULES) {
        if (rule.keywords.some((kw) => normalizedDescription.indexOf(kw) !== -1)) {
          const categoryId = categoryIdByName[rule.category];
          if (categoryId) return categoryId;
        }
      }
      return null;
    },
  };
}

/**
 * Saves a personal rule mapping a merchant keyword (derived from the
 * transaction's normalized description) to a category, so future imports
 * auto-categorize the same merchant the same way.
 */
function saveRule_(userId, normalizedDescription, categoryId) {
  const pattern = normalizedDescription.split(" ").slice(0, 3).join(" ");
  if (!pattern) return;

  const existing = getUserCategoryRules_(userId).find((r) => r.pattern === pattern);
  if (existing) {
    updateRow_("CategoryRules", existing._rowNumber, { categoryId });
  } else {
    appendRow_("CategoryRules", { id: newId_(), userId, pattern, categoryId });
  }
  invalidateUserCategoryRules_(userId);
}
