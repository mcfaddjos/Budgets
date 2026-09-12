const db = require("../db");
const { getActiveHouseholdId } = require("../household");

async function list(user) {
  const householdId = await getActiveHouseholdId(user);
  return db.category.findMany({ where: { householdId }, orderBy: { name: "asc" } });
}

async function create(user, payload) {
  const name = ((payload && payload.name) || "").trim();
  if (!name) throw new Error("name is required");
  const householdId = await getActiveHouseholdId(user);

  const existing = await db.category.findUnique({ where: { householdId_name: { householdId, name } } });
  if (existing) throw new Error("category already exists");

  return db.category.create({ data: { householdId, name } });
}

async function update(user, payload) {
  const { id, name } = payload || {};
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("name is required");
  const householdId = await getActiveHouseholdId(user);

  const category = await db.category.findFirst({ where: { id, householdId } });
  if (!category) throw new Error("category not found");

  const clash = await db.category.findUnique({ where: { householdId_name: { householdId, name: trimmed } } });
  if (clash && clash.id !== id) throw new Error("category already exists");

  return db.category.update({ where: { id }, data: { name: trimmed } });
}

module.exports = { list, create, update };
