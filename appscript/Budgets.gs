function currentMonth_() {
  return new Date().toISOString().slice(0, 7);
}

function handleBudgetsGet_(user, payload) {
  const month = (payload && payload.month) || currentMonth_();
  const categories = getUserCategories_(user.id);
  const budgets = readAll_("Budgets").filter((b) => b.userId === user.id && b.month === month);
  const transactions = readAll_("Transactions").filter(
    (t) => t.userId === user.id && String(t.date).indexOf(month) === 0
  );

  const categoryRows = categories
    .map((c) => {
      const budget = budgets.find((b) => b.categoryId === c.id);
      const budgetAmount = budget ? Number(budget.amount) : 0;
      const actual = transactions
        .filter((t) => t.categoryId === c.id)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return {
        categoryId: c.id,
        categoryName: c.name,
        budgetAmount,
        actual,
        variance: budgetAmount - actual,
      };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  const totals = categoryRows.reduce(
    (acc, c) => ({ budget: acc.budget + c.budgetAmount, actual: acc.actual + c.actual }),
    { budget: 0, actual: 0 }
  );
  totals.variance = totals.budget - totals.actual;

  return { month, categories: categoryRows, totals };
}

function handleBudgetsSet_(user, payload) {
  const { categoryId, month, amount } = payload || {};
  if (!categoryId || !month || amount == null) {
    throw new Error("categoryId, month (YYYY-MM), and amount are required");
  }

  const category = getUserCategories_(user.id).find((c) => c.id === categoryId);
  if (!category) throw new Error("category not found");

  const existing = readAll_("Budgets").find(
    (b) => b.userId === user.id && b.categoryId === categoryId && b.month === month
  );
  if (existing) {
    updateRow_("Budgets", existing._rowNumber, { amount });
    return stripRow_(Object.assign({}, existing, { amount }));
  }

  const budget = { id: newId_(), userId: user.id, categoryId, month, amount };
  appendRow_("Budgets", budget);
  return stripRow_(budget);
}

/**
 * Reads Categories/Budgets once (not once per row — that was the original
 * cause of a "Sync Quick Add" taking close to a minute: N rows meant N full
 * spreadsheet round-trips via handleBudgetsSet_). Existing budgets are
 * updated in place; new ones are appended and tracked in-memory so a second
 * QuickAdd row for the same category+month within the same sync upserts
 * against it instead of creating a duplicate row.
 */
function handleBudgetsImportQuickAdd_(user) {
  const parsed = parseQuickAddBudgets_();

  const categoryIdByName = {};
  getUserCategories_(user.id).forEach((c) => {
    categoryIdByName[c.name] = c.id;
  });

  const budgetByKey = {};
  readAll_("Budgets")
    .filter((b) => b.userId === user.id)
    .forEach((b) => {
      budgetByKey[`${b.categoryId}|${b.month}`] = b;
    });

  let applied = 0;
  let skippedUnknownCategory = 0;

  for (const b of parsed.budgets) {
    const categoryId = categoryIdByName[b.category];
    if (!categoryId) {
      skippedUnknownCategory++;
      continue;
    }

    const key = `${categoryId}|${b.month}`;
    const existing = budgetByKey[key];
    if (existing) {
      updateRow_("Budgets", existing._rowNumber, { amount: b.amount });
      existing.amount = b.amount;
    } else {
      const budget = { id: newId_(), userId: user.id, categoryId, month: b.month, amount: b.amount };
      appendRow_("Budgets", budget);
      budget._rowNumber = getSheet_("Budgets").getLastRow();
      budgetByKey[key] = budget;
    }
    applied++;
  }

  return { applied, skippedUnknownCategory, parseErrors: parsed.errors };
}
