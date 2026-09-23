const { requireAuth } = require("./auth");
const authHandlers = require("./handlers/auth");
const accountsHandlers = require("./handlers/accounts");
const categoriesHandlers = require("./handlers/categories");
const categoryRulesHandlers = require("./handlers/categoryRules");
const transactionsHandlers = require("./handlers/transactions");
const budgetsHandlers = require("./handlers/budgets");
const householdHandlers = require("./handlers/household");
const receiptsHandlers = require("./handlers/receipts");

// Same action-envelope protocol the app already speaks to the appscript
// backend ({action, token, payload} -> {ok, data|error}) — deliberately
// kept identical so pointing the existing client at this backend later is
// a one-line serverUrl change, not a rewrite. Worth revisiting for a more
// idiomatic REST shape once the client itself gets updated.
const PUBLIC_ACTIONS = new Set(["auth.registerNewHousehold", "auth.joinHouseholdViaInvite", "auth.login"]);

const ROUTES = {
  "auth.registerNewHousehold": (user, payload) => authHandlers.registerNewHousehold(payload),
  "auth.joinHouseholdViaInvite": (user, payload) => authHandlers.joinHouseholdViaInvite(payload),
  "auth.login": (user, payload) => authHandlers.login(payload),
  "auth.me": (user, payload) => authHandlers.me(user, payload),
  "auth.createInvite": (user, payload) => authHandlers.createInvite(user, payload),
  "auth.listPendingKeyGrants": (user, payload) => authHandlers.listPendingKeyGrants(user, payload),
  "auth.listMembers": (user, payload) => authHandlers.listMembers(user, payload),
  "auth.grantAccess": (user, payload) => authHandlers.grantAccess(user, payload),
  "auth.setRecoveryKey": (user, payload) => authHandlers.setRecoveryKey(user, payload),
  "auth.addDeviceViaRecoveryCode": (user, payload) => authHandlers.addDeviceViaRecoveryCode(user, payload),
  "auth.createPairingSession": (user, payload) => authHandlers.createPairingSession(user, payload),
  "auth.submitPairingDevice": (user, payload) => authHandlers.submitPairingDevice(user, payload),
  "auth.getPairingStatus": (user, payload) => authHandlers.getPairingStatus(user, payload),
  "auth.isPairingComplete": (user, payload) => authHandlers.isPairingComplete(user, payload),

  "accounts.list": (user) => accountsHandlers.list(user),
  "accounts.create": (user, payload) => accountsHandlers.create(user, payload),
  "accounts.delete": (user, payload) => accountsHandlers.remove(user, payload),

  "categories.list": (user) => categoriesHandlers.list(user),
  "categories.create": (user, payload) => categoriesHandlers.create(user, payload),
  "categories.createMany": (user, payload) => categoriesHandlers.createMany(user, payload),
  "categories.update": (user, payload) => categoriesHandlers.update(user, payload),

  "categoryRules.list": (user) => categoryRulesHandlers.list(user),
  "categoryRules.create": (user, payload) => categoryRulesHandlers.create(user, payload),

  "transactions.list": (user, payload) => transactionsHandlers.list(user, payload),
  "transactions.create": (user, payload) => transactionsHandlers.create(user, payload),
  "transactions.update": (user, payload) => transactionsHandlers.update(user, payload),
  "transactions.delete": (user, payload) => transactionsHandlers.remove(user, payload),
  "transactions.formOptions": (user) => transactionsHandlers.formOptions(user),

  "budgets.get": (user, payload) => budgetsHandlers.get(user, payload),
  "budgets.set": (user, payload) => budgetsHandlers.set(user, payload),

  "household.getSettings": (user) => householdHandlers.getSettings(user),
  "household.setKeepReceiptImages": (user, payload) => householdHandlers.setKeepReceiptImages(user, payload),

  "receipts.upload": (user, payload) => receiptsHandlers.upload(user, payload),
  "receipts.get": (user, payload) => receiptsHandlers.get(user, payload),
};

async function dispatch(action, token, payload) {
  if (!action) throw new Error("action is required");
  const route = ROUTES[action];
  if (!route) throw new Error(`Unknown action: ${action}`);

  const user = PUBLIC_ACTIONS.has(action) ? null : await requireAuth(token);
  return route(user, payload || {});
}

module.exports = { dispatch, PUBLIC_ACTIONS };
