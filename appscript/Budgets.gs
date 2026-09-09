function currentMonth_() {
  return new Date().toISOString().slice(0, 7);
}

function handleBudgetsGet_(user, payload) {
  const month = (payload && payload.month) || currentMonth_();
  const categories = readAll_("Categories").filter((c) => c.userId === user.id);
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

  const category = readAll_("Categories").find((c) => c.id === categoryId && c.userId === user.id);
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

function handleBudgetsImportQuickAdd_(user) {
  const parsed = parseQuickAddBudgets_();
  const categories = readAll_("Categories").filter((c) => c.userId === user.id);

  let applied = 0;
  let skippedUnknownCategory = 0;

  for (const b of parsed.budgets) {
    const category = categories.find((c) => c.name === b.category);
    if (!category) {
      skippedUnknownCategory++;
      continue;
    }
    handleBudgetsSet_(user, { categoryId: category.id, month: b.month, amount: b.amount });
    applied++;
  }

  return { applied, skippedUnknownCategory, parseErrors: parsed.errors };
}
