// One-time demo data seeding — not a real app feature, just a convenience
// for populating a dev/demo household with realistic-looking data instead
// of an empty one. Triggered from SettingsScreen's "Seed September Demo
// Data" button, visible in `__DEV__` or to a household's OWNER (§5a role,
// first put to use here). This can't run from a backend script:
// category/transaction content is only ever encrypted client-side with
// the household DEK (§10a), which never leaves the device, so seeding has
// to happen through the app's own live session.
//
// Sourced directly from the "Spend Less" Google Sheet (jak.mcfadden@gmail.com,
// shared into this household's Drive — read via the Drive connector, both
// the "Master" and "Sept 2026" tabs). The September tab's structure: one
// pair of columns per category (an amount column + a paired notes column),
// each row down a pair is one transaction — categories don't share rows,
// each column just has however many entries it has, so "row 4" in one
// category's column has nothing to do with "row 4" in another's beyond
// both being an approximate point in the month (used below as a rough,
// shared placeholder date across categories, since the sheet itself
// doesn't record real dates — the exception is where a date is already
// embedded in a description, e.g. "Smith brothers 9/4").
import * as repo from "./repo";

const SEPTEMBER = "2026-09";

export const SEPTEMBER_CATEGORY_NAMES = [
  "Home Fud",
  "Outside Fud",
  "Travel",
  "Partying",
  "Pets",
  "Bills",
  "Health",
  "Wellness",
  "Shopping",
  "Cleaning",
  "Home",
  "Car",
];

// From the "Master" tab (row 3) — its own Total cell (9000) is the sum of
// all 12 of these, confirming this is the right, authoritative source
// (the September tab's own header row is a running "remaining budget"
// figure, not the budget itself, and shouldn't be used for this).
const SEPTEMBER_BUDGETS = {
  "Home Fud": 1000,
  "Outside Fud": 500,
  Travel: 500,
  Partying: 500,
  Pets: 200,
  Bills: 3300,
  Health: 400,
  Wellness: 400,
  Shopping: 500,
  Cleaning: 200,
  Home: 500,
  Car: 1000,
};

const SEPTEMBER_TRANSACTIONS = [
  // ~week 1
  { category: "Home Fud", amount: -70, date: "2026-09-03" },
  { category: "Outside Fud", amount: -60, date: "2026-09-03" },
  { category: "Travel", amount: -15, date: "2026-09-03" },
  { category: "Partying", amount: -110, date: "2026-09-03" },
  { category: "Pets", amount: -72.87, description: "food +  2 dog toys", date: "2026-09-03" },
  { category: "Bills", amount: -3300, description: "Standard mortgage, tv, phone, electric, water, trash", date: "2026-09-03" },
  { category: "Wellness", amount: -120, date: "2026-09-03" },
  { category: "Shopping", amount: -20, description: "Flowers", date: "2026-09-03" },
  { category: "Cleaning", amount: -105, date: "2026-09-03" },
  { category: "Home", amount: -30.58, description: "kitchen mats", date: "2026-09-03" },
  { category: "Car", amount: -65, description: "Gas", date: "2026-09-03" },

  // ~week 2
  { category: "Home Fud", amount: -11, date: "2026-09-10" },
  { category: "Outside Fud", amount: -70, date: "2026-09-10" },
  { category: "Partying", amount: -100, date: "2026-09-10" },
  { category: "Pets", amount: -36.93, description: "chicken feed", date: "2026-09-10" },
  { category: "Wellness", amount: -840, description: "Gym membership", date: "2026-09-10" },
  { category: "Shopping", amount: -13, description: "Gua sha", date: "2026-09-10" },
  { category: "Cleaning", amount: -280, description: "tree clean", date: "2026-09-10" },
  { category: "Home", amount: -42.18, description: "tree limb dump", date: "2026-09-10" },
  { category: "Car", amount: -730, description: "Gas", date: "2026-09-10" },

  // ~week 3
  { category: "Home Fud", amount: -14, date: "2026-09-17" },
  { category: "Outside Fud", amount: -40, date: "2026-09-17" },
  { category: "Partying", amount: -60, description: "Alcohol", date: "2026-09-17" },
  { category: "Wellness", amount: -840, description: "Gym membership", date: "2026-09-17" },
  { category: "Shopping", amount: -218.59, description: "airpods", date: "2026-09-17" },
  { category: "Home", amount: -36, description: "dish lids and SS chicken butt blug", date: "2026-09-17" },

  { category: "Home Fud", amount: -127, description: "Co-op groceries", date: "2026-09-06" },
  { category: "Outside Fud", amount: -44, date: "2026-09-06" },
  { category: "Partying", amount: -12.56, date: "2026-09-06" },
  { category: "Wellness", amount: -30, date: "2026-09-06" },
  { category: "Shopping", amount: -169, description: "J chest protector", date: "2026-09-06" },
  { category: "Home", amount: -1353, description: "sauna wood", date: "2026-09-06" },

  { category: "Home Fud", amount: -135, description: "Co-op groceries", date: "2026-09-20" },
  { category: "Outside Fud", amount: -7, date: "2026-09-20" },
  { category: "Partying", amount: -15, date: "2026-09-20" },
  { category: "Wellness", amount: -45, description: "rim tape and sealant", date: "2026-09-20" },
  { category: "Shopping", amount: -25, description: "over ear headphone covers", date: "2026-09-20" },

  { category: "Home Fud", amount: -48, description: "Smith brothers 9/4", date: "2026-09-04" },
  { category: "Outside Fud", amount: -54, date: "2026-09-04" },
  { category: "Partying", amount: -31, description: "Ccc sauna", date: "2026-09-04" },

  { category: "Home Fud", amount: -55, description: "Smith brothers 9/11", date: "2026-09-11" },
  { category: "Outside Fud", amount: -20, description: "bikes fud", date: "2026-09-11" },
  { category: "Partying", amount: -18, description: "bikes marg", date: "2026-09-11" },

  { category: "Home Fud", amount: -255.08, date: "2026-09-24" },
  { category: "Outside Fud", amount: -35, description: "Co-op lunch 9/24", date: "2026-09-24" },
  { category: "Partying", amount: -76, description: "snoq travel", date: "2026-09-24" },

  { category: "Home Fud", amount: -98, date: "2026-09-27" },

  { category: "Home Fud", amount: -54, description: "Smith brothers", date: "2026-09-29" },
];

export async function seedSeptemberDemoData(householdId) {
  const accounts = await repo.listAccounts(householdId);
  if (accounts.length === 0) {
    throw new Error("Add an account first — there's nothing to attach transactions to yet.");
  }
  const accountId = accounts[0].id;

  const existingCategories = await repo.listCategories(householdId);
  const categoryIdByName = {};
  for (const c of existingCategories) categoryIdByName[c.name] = c.id;

  for (const name of SEPTEMBER_CATEGORY_NAMES) {
    if (categoryIdByName[name]) continue; // already seeded, don't duplicate on a re-run
    const created = await repo.createCategory(householdId, name);
    categoryIdByName[name] = created.id;
  }

  for (const [name, amount] of Object.entries(SEPTEMBER_BUDGETS)) {
    // A budget is always a positive allowance — the sheet's own sign
    // convention (some rows negative) doesn't carry over here. setBudget
    // is an upsert (one row per category+month), so re-running this is
    // always safe and just corrects the amount in place.
    await repo.setBudget(householdId, categoryIdByName[name], SEPTEMBER, Math.abs(amount));
  }

  // Unlike categories/budgets, manual transactions have no dedup
  // check (by design — two genuinely separate $5 coffees on the same day
  // are both real, see backend/src/handlers/transactions.js) — so
  // tapping this button twice would silently double every transaction.
  // Guard against that explicitly instead.
  const existingTransactions = await repo.listTransactions(householdId, { month: SEPTEMBER });
  if (existingTransactions.length > 0) {
    return {
      categoriesCreated: SEPTEMBER_CATEGORY_NAMES.length,
      budgetsSet: Object.keys(SEPTEMBER_BUDGETS).length,
      transactionsCreated: 0,
      transactionsSkipped: `${existingTransactions.length} September transactions already exist — not re-seeding to avoid duplicates. Delete them first (long-press each in Transactions) if you want a clean re-seed.`,
    };
  }

  for (const tx of SEPTEMBER_TRANSACTIONS) {
    await repo.createManualTransaction(householdId, {
      accountId,
      categoryId: categoryIdByName[tx.category],
      // This app's convention is the opposite of the source sheet's:
      // positive = expense, negative = credit/refund (confirmed by
      // TransactionsScreen.js coloring negative amounts green as
      // "credit"). The sheet uses negative for money spent, so every
      // entry here needs the sign flipped, same as the budget fix above.
      amount: Math.abs(tx.amount),
      description: tx.description,
      fallbackDescription: tx.category,
      date: tx.date,
    });
  }

  return {
    categoriesCreated: SEPTEMBER_CATEGORY_NAMES.length,
    budgetsSet: Object.keys(SEPTEMBER_BUDGETS).length,
    transactionsCreated: SEPTEMBER_TRANSACTIONS.length,
  };
}
