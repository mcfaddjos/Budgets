const db = require("./db");

/** Direct port of appscript/Categorize.gs's DEFAULT_RULES. */
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

const DEFAULT_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Utilities", "Entertainment",
  "Shopping", "Health", "Travel", "Payment", "Income", "Uncategorized",
];

async function seedDefaultCategories(householdId) {
  await db.category.createMany({
    data: DEFAULT_CATEGORIES.map((name) => ({ householdId, name })),
    skipDuplicates: true,
  });
}

/** Loads a household's categories + rules once, returns a categorizer closure — same shape as appscript's buildCategorizer_, for the same reason (avoid one query per transaction in an import loop). */
async function buildCategorizer(householdId) {
  const categories = await db.category.findMany({ where: { householdId } });
  const categoryIdByName = {};
  categories.forEach((c) => {
    categoryIdByName[c.name] = c.id;
  });

  const rules = await db.categoryRule.findMany({ where: { householdId } });

  return {
    uncategorizedId: categoryIdByName["Uncategorized"] || null,
    categorize(normalizedDescription) {
      for (const rule of rules) {
        if (normalizedDescription.includes(rule.pattern)) return rule.categoryId;
      }
      for (const rule of DEFAULT_RULES) {
        if (rule.keywords.some((kw) => normalizedDescription.includes(kw))) {
          const categoryId = categoryIdByName[rule.category];
          if (categoryId) return categoryId;
        }
      }
      return null;
    },
  };
}

/** Direct port of appscript/Categorize.gs's saveRule_. */
async function saveRule(householdId, normalizedDescription, categoryId) {
  const pattern = normalizedDescription.split(" ").slice(0, 3).join(" ");
  if (!pattern) return;

  await db.categoryRule.upsert({
    where: { householdId_pattern: { householdId, pattern } },
    update: { categoryId },
    create: { householdId, pattern, categoryId },
  });
}

module.exports = { DEFAULT_CATEGORIES, DEFAULT_RULES, seedDefaultCategories, buildCategorizer, saveRule };
