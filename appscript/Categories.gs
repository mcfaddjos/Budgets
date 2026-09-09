function handleCategoriesList_(user) {
  return readAll_("Categories")
    .filter((c) => c.userId === user.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(stripRow_);
}

function handleCategoriesCreate_(user, payload) {
  const name = ((payload && payload.name) || "").trim();
  if (!name) throw new Error("name is required");

  const existing = readAll_("Categories").find((c) => c.userId === user.id && c.name === name);
  if (existing) throw new Error("category already exists");

  const category = { id: newId_(), userId: user.id, name };
  appendRow_("Categories", category);
  return stripRow_(category);
}
