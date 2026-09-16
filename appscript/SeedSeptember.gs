/**
 * ONE-OFF, throwaway: run manually from the editor (pick SeedSeptember.gs in
 * the file list so seedSeptemberData shows in the function dropdown, click
 * Run) to backfill September's budgets/transactions from a manual tally.
 * Writes directly via the same Db.gs helpers the app uses — no network call,
 * no auth token, so it isn't subject to the Web App's redirect flakiness.
 * Delete this file (or ask Claude to) once it's run successfully.
 *
 * Deliberately mapped onto the existing default categories rather than
 * creating new ones — the original tally's "Wellness" folds into "Health",
 * and "Pets"/"Cleaning" fold into "Shopping" (budgets summed for any
 * category fed by more than one tally column). requireCategory_ throws
 * rather than creating anything if one of these is somehow missing.
 */

const SEED_MONTH = "2026-09";

const SEED_DATA = [
  { category: "Groceries", budget: 919, spends: [70, 11] }, // Home Fud
  { category: "Dining", budget: 370, spends: [60, 70] }, // Outside Fud
  { category: "Travel", budget: 485, spends: [15] },
  { category: "Entertainment", budget: 230, spends: [110, 100, 60] }, // Partying
  { category: "Utilities", budget: 0, spends: [3300] }, // Bills
  { category: "Health", budget: 580, spends: [120] }, // Health (300) + Wellness (280)
  { category: "Shopping", budget: 800, spends: [100] }, // Pets (200) + Shopping (500) + Cleaning (100)
  { category: "Transport", budget: 205, spends: [65, 730] }, // Car
];

function requireCategory_(userId, name) {
  const category = readAll_("Categories").find((c) => c.userId === userId && c.name === name);
  if (!category) throw new Error(`Category "${name}" doesn't exist for this user — not creating it, per instructions.`);
  return category;
}

function seedSeptemberData() {
  const users = readAll_("Users");
  if (users.length !== 1) {
    throw new Error(
      "Expected exactly 1 user, found " + users.length + ": " +
        users.map((u) => u.username).join(", ") +
        " — edit this function to pick the right one explicitly."
    );
  }
  const user = users[0];

  const accounts = readAll_("Accounts").filter((a) => a.userId === user.id);
  if (accounts.length !== 1) {
    throw new Error(
      "Expected exactly 1 account for " + user.username + ", found " + accounts.length + ": " +
        accounts.map((a) => a.name).join(", ") +
        " — edit this function to pick the right one explicitly."
    );
  }
  const account = accounts[0];

  SEED_DATA.forEach((row) => {
    const category = requireCategory_(user.id, row.category);

    const existingBudget = readAll_("Budgets").find(
      (b) => b.userId === user.id && b.categoryId === category.id && b.month === SEED_MONTH
    );
    if (existingBudget) {
      updateRow_("Budgets", existingBudget._rowNumber, { amount: row.budget });
    } else {
      appendRow_("Budgets", {
        id: newId_(),
        userId: user.id,
        categoryId: category.id,
        month: SEED_MONTH,
        amount: row.budget,
      });
    }

    row.spends.forEach((amount) => {
      const id = newId_();
      appendRow_("Transactions", {
        id,
        userId: user.id,
        accountId: account.id,
        date: SEED_MONTH + "-15",
        description: row.category,
        normalizedDescription: normalizeDescription_(row.category),
        amount,
        categoryId: category.id,
        reviewed: false,
        dedupKey: "seed:" + id,
        createdAt: new Date().toISOString(),
      });
    });
  });

  Logger.log("Seeded September data for " + user.username + " / account " + account.name);
}
