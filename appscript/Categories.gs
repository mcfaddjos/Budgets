function handleCategoriesList_(user) {
  return getUserCategories_(user.id)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(stripRow_);
}

function handleCategoriesCreate_(user, payload) {
  const name = ((payload && payload.name) || "").trim();
  if (!name) throw new Error("name is required");

  const existing = getUserCategories_(user.id).find((c) => c.name === name);
  if (existing) throw new Error("category already exists");

  const category = { id: newId_(), userId: user.id, name };
  appendRow_("Categories", category);
  invalidateUserCategories_(user.id);
  return stripRow_(category);
}

function handleCategoriesUpdate_(user, payload) {
  const { id, name } = payload || {};
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("name is required");

  const category = getUserCategories_(user.id).find((c) => c.id === id);
  if (!category) throw new Error("category not found");

  const clash = getUserCategories_(user.id).find((c) => c.id !== id && c.name === trimmed);
  if (clash) throw new Error("category already exists");

  updateRow_("Categories", category._rowNumber, { name: trimmed });
  invalidateUserCategories_(user.id);
  return stripRow_(Object.assign({}, category, { name: trimmed }));
}
