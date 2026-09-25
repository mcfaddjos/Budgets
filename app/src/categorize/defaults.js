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

// Item-name keywords for scanned-receipt line items (PRD §8.6's "choose a
// category per item" flow) — a different vocabulary than DEFAULT_RULES,
// which is merchant/vendor names ("KROGER", "STARBUCKS"). An item name is
// a product noun ("Bananas", "6oz Lone Birch Syrah"), so it needs its own
// dictionary. Deliberately a starting point, not exhaustive — household
// rules (learned from whatever category you actually pick, same as
// today's transaction-level recategorization) are what carries this the
// rest of the way for whatever you actually buy.
export const ITEM_DEFAULT_RULES = [
  {
    category: "Groceries",
    keywords: [
      "BANANA", "BANANAS", "APPLE", "APPLES", "ORANGE", "ORANGES", "AVOCADO", "AVOCADOS", "TOMATO", "TOMATOES",
      "LETTUCE", "ONION", "ONIONS", "POTATO", "POTATOES", "CARROT", "CARROTS", "BROCCOLI", "SPINACH", "GARLIC",
      "BERRIES", "STRAWBERRIES", "BLUEBERRIES", "GRAPES", "LEMON", "LIME",
      "MILK", "EGGS", "BUTTER", "CHEESE", "YOGURT", "CREAM",
      "CHICKEN", "BEEF", "GROUND BEEF", "PORK", "BACON", "SAUSAGE", "TURKEY", "SALMON", "SHRIMP", "FISH",
      "BREAD", "BAGEL", "BAGELS", "TORTILLA", "TORTILLAS", "CEREAL", "RICE", "PASTA", "FLOUR", "SUGAR", "OATS",
      "COFFEE", "TEA BAGS", "JUICE", "WATER", "SODA",
      "CHIPS", "CRACKERS", "COOKIES", "GRANOLA", "PEANUT BUTTER", "JAM", "CANDY", "SNACK",
      "FROZEN", "ICE CREAM",
      "OLIVE OIL", "VEGETABLE OIL", "SALT", "PEPPER", "SPICE", "SAUCE", "KETCHUP", "MUSTARD", "MAYO",
    ],
  },
  {
    category: "Dining",
    keywords: [
      "WINE", "ROSE", "SYRAH", "CABERNET", "CHARDONNAY", "PINOT", "MERLOT", "SAUVIGNON",
      "BEER", "IPA", "LAGER", "COCKTAIL", "MARGARITA",
      "APPETIZER", "ENTREE", "FLATBREAD", "FLATBREADS", "BURGER", "SANDWICH", "SALAD", "SOUP",
      "DESSERT", "GRATUITY", "CORKAGE", "TASTING",
    ],
  },
  {
    category: "Health",
    keywords: [
      "IBUPROFEN", "ACETAMINOPHEN", "ASPIRIN", "VITAMIN", "VITAMINS", "SUPPLEMENT", "BANDAGE", "BANDAGES",
      "COUGH", "ALLERGY", "PRESCRIPTION",
    ],
  },
  {
    category: "Shopping",
    keywords: [
      "PAPER TOWEL", "PAPER TOWELS", "TOILET PAPER", "DETERGENT", "SOAP", "SHAMPOO", "CONDITIONER",
      "TRASH BAG", "TRASH BAGS", "FOIL", "PLASTIC WRAP", "BATTERIES", "LIGHT BULB",
    ],
  },
  {
    category: "Transport",
    keywords: ["UNLEADED", "PREMIUM GAS", "DIESEL", "REGULAR GAS", "FUEL"],
  },
];

export function normalizeDescription(raw) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if `phrase` appears as whole word(s) in `text` — not just anywhere
 * as a substring. Plain .includes() would match "HAM" inside "SHAMPOO" or
 * "TEA" inside "STEAK", which gets worse the shorter and more common the
 * keywords are (exactly the case for item names like "TEA" or "RICE").
 * Both strings are already normalizeDescription'd (only A-Z0-9 and single
 * spaces), so padding each side with a space and comparing as a substring
 * is a complete, cheap word-boundary check — no regex needed, and it
 * handles multi-word phrases ("OLIVE OIL") for free since the boundary
 * only has to line up at the phrase's outer edges.
 */
function includesPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

function categorizeWithRules(normalizedText, householdRules, categoryIdByName, defaultRules) {
  for (const rule of householdRules) {
    if (includesPhrase(normalizedText, rule.pattern)) return rule.categoryId;
  }
  for (const rule of defaultRules) {
    if (rule.keywords.some((kw) => includesPhrase(normalizedText, kw))) {
      const categoryId = categoryIdByName[rule.category];
      if (categoryId) return categoryId;
    }
  }
  return null;
}

/**
 * Matches household-defined rules first (a user's own corrections should
 * win over the shipped defaults), then falls back to DEFAULT_RULES.
 * `householdRules` is the household's already-decrypted CategoryRule list
 * (each with a plaintext `pattern`), `categoryIdByName` maps a category's
 * decrypted name to its id.
 */
export function categorize(normalizedDescription, householdRules, categoryIdByName) {
  return categorizeWithRules(normalizedDescription, householdRules, categoryIdByName, DEFAULT_RULES);
}

/**
 * Same lookup as categorize(), against ITEM_DEFAULT_RULES instead —
 * household rules are shared with categorize() rather than kept in a
 * separate store, since a learned pattern ("this text → this category")
 * is meaningful regardless of whether it came from a transaction
 * description or an item name.
 */
export function categorizeItem(normalizedItemName, householdRules, categoryIdByName) {
  return categorizeWithRules(normalizedItemName, householdRules, categoryIdByName, ITEM_DEFAULT_RULES);
}

/** Direct port of the old server-side saveRule_'s pattern derivation — first three words of the normalized description. */
export function derivePatternFromDescription(normalizedDescription) {
  return normalizedDescription.split(" ").slice(0, 3).join(" ");
}
