import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  useCategoryRules,
  useCreateManualTransaction,
  useSaveCategoryRule,
  useTransactionFormOptions,
  useUpdateTransaction,
} from "../data/queries";
import { categorize, categorizeItem, normalizeDescription } from "../categorize/defaults";
import FormModal from "./FormModal";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

function parseAmount(value) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shared across TransactionsScreen and BudgetsScreen (both top-level
 * buttons, no account implied) — the account picker only shows when there's
 * more than one account to choose from.
 *
 * initialValues (optional, from a receipt/gas-pump/screenshot scan — PRD
 * §8.6): { description, amount, date, items, tax, tip }. `items` being
 * present at all (even []) is what turns on the itemized-breakdown editor
 * — a plain manual entry never has it, so the section stays hidden there.
 *
 * editingTransaction (optional): a full decrypted transaction object,
 * turns this into an edit form instead of an add form — the only way to
 * fix a transaction's amount/description/date/category/items after the
 * fact, since TransactionDetailModal is read-only. Takes priority over
 * initialValues (the two are mutually exclusive in practice: a scan
 * always opens in add mode, editing always opens from an existing row).
 */
export default function AddTransactionModal({ visible, initialAccountId, initialValues, editingTransaction, onClose, onSaved }) {
  const { data, isPending, isError, error, refetch } = useTransactionFormOptions();
  const { data: categoryRules = [] } = useCategoryRules();
  const createTransaction = useCreateManualTransaction();
  const updateTransaction = useUpdateTransaction();
  const saveCategoryRule = useSaveCategoryRule();
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];

  const [accountId, setAccountId] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState(null);
  const [items, setItems] = useState(undefined);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");
  const [itemCategoryPickerIndex, setItemCategoryPickerIndex] = useState(null);
  const s = useThemedStyles(styles, darkStyles);

  useEffect(() => {
    if (!visible) return;
    const source = editingTransaction || initialValues;
    setAmount(source?.amount != null ? String(source.amount) : "");
    setDescription(source?.description || "");
    setDate(DATE_RE.test(source?.date) ? source.date : todayIso());
    setCategoryId(editingTransaction?.categoryId || null);
    setAccountId(editingTransaction?.accountId || initialAccountId || null);
    setItems(
      source?.items ? source.items.map((i) => ({ name: i.name, amount: String(i.amount), categoryId: i.categoryId })) : undefined
    );
    setTax(source?.tax != null ? String(source.tax) : "");
    setTip(source?.tip != null ? String(source.tip) : "");
  }, [visible, initialAccountId, initialValues, editingTransaction]);

  useEffect(() => {
    if (visible && !accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [visible, accountId, accounts]);

  /** Category guess for a scanned transaction (PRD §8.6) — reuses the same categorizer statement import uses, only runs once the categories/rules are actually loaded and only pre-fills, never overrides a choice the user already made. */
  useEffect(() => {
    if (!visible || !initialValues?.description || categoryId || categories.length === 0) return;
    const categoryIdByName = Object.fromEntries(categories.map((c) => [c.name, c.id]));
    const guess = categorize(normalizeDescription(initialValues.description), categoryRules, categoryIdByName);
    if (guess) setCategoryId(guess);
  }, [visible, initialValues, categories, categoryRules, categoryId]);

  /**
   * Per-item category guess (PRD §8.6) — same cheap keyword-dictionary
   * approach as the whole-transaction guess above, against
   * ITEM_DEFAULT_RULES (product keywords) instead of DEFAULT_RULES
   * (merchant keywords) since an item name is a different vocabulary than
   * a transaction description. `categoryId === undefined` is the "not yet
   * guessed" sentinel (vs `null`, an attempted guess that found nothing,
   * or a real id, picked/loaded) — that's what keeps this from re-running
   * every render: once every item has a definite value, the mapped array
   * is reference-identical to the last one it produced (nothing to change,
   * so `setItems` isn't even called), so the effect has nothing left to
   * react to. A blank name (just-added item, before typing) stays
   * undefined on purpose so it gets guessed once a name actually exists.
   */
  useEffect(() => {
    if (!visible || !items || categories.length === 0) return;
    const categoryIdByName = Object.fromEntries(categories.map((c) => [c.name, c.id]));
    setItems((prev) => {
      if (!prev) return prev;
      let changed = false;
      const next = prev.map((item) => {
        if (item.categoryId !== undefined || !item.name?.trim()) return item;
        changed = true;
        return { ...item, categoryId: categorizeItem(normalizeDescription(item.name), categoryRules, categoryIdByName) };
      });
      return changed ? next : prev;
    });
  }, [visible, items, categories, categoryRules]);

  function addItem() {
    setItems((prev) => [...(prev || []), { name: "", amount: "" }]);
  }
  function updateItem(index, field, value) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }
  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Picking a category for an item also saves a household rule for it
   * (same always-on learning as TransactionsScreen's whole-transaction
   * recategorize) — best-effort: a failed rule save shouldn't block the
   * pick itself, the category is already applied locally either way.
   */
  function handlePickItemCategory(category) {
    const index = itemCategoryPickerIndex;
    setItemCategoryPickerIndex(null);
    if (index === null) return;
    const itemName = items[index]?.name?.trim();
    updateItem(index, "categoryId", category.id);
    if (itemName) saveCategoryRule.mutateAsync({ normalizedDescription: normalizeDescription(itemName), categoryId: category.id }).catch(() => {});
  }

  async function handleSave() {
    const amt = parseFloat(amount);
    if (Number.isNaN(amt)) {
      Alert.alert("Invalid amount", "Enter a number, e.g. 12.50.");
      return;
    }
    if (!accountId) {
      Alert.alert("Account required", "Add an account first — there's nothing to attach this transaction to yet.");
      return;
    }
    if (!categoryId) {
      Alert.alert("Category required", "Pick a category.");
      return;
    }
    if (!DATE_RE.test(date)) {
      Alert.alert("Invalid date", "Enter a date as YYYY-MM-DD, e.g. 2026-09-23.");
      return;
    }
    const category = categories.find((c) => c.id === categoryId);
    const payload = {
      accountId,
      categoryId,
      amount: amt,
      description: description.trim(),
      fallbackDescription: category?.name,
      date,
      items: items?.map((i) => ({ name: i.name.trim() || "Item", amount: parseAmount(i.amount), categoryId: i.categoryId ?? null })),
      tax: items !== undefined ? parseAmount(tax) : undefined,
      tip: items !== undefined ? parseAmount(tip) : undefined,
    };
    try {
      const saved = editingTransaction
        ? await updateTransaction.mutateAsync({ tx: editingTransaction, updates: payload })
        : await createTransaction.mutateAsync(payload);
      Alert.alert(
        editingTransaction ? "Transaction updated" : "Transaction added",
        `${description.trim() || category?.name || "(no description)"} — $${amt.toFixed(2)}`
      );
      onSaved(saved);
    } catch (err) {
      Alert.alert(editingTransaction ? "Couldn't update transaction" : "Couldn't add transaction", err.message);
    }
  }

  return (
    <>
    <FormModal visible={visible} onClose={onClose}>
      <Text style={s.modalTitle}>{editingTransaction ? "Edit transaction" : "Add transaction"}</Text>

      {isPending ? (
        <View style={s.loadingBox}>
          <ActivityIndicator />
          <Text style={s.loadingText}>Loading accounts and categories…</Text>
        </View>
      ) : isError ? (
        <View style={s.loadingBox}>
          <Text style={s.errorText}>{error.message}</Text>
          <TouchableOpacity style={s.retryButton} onPress={refetch}>
            <Text style={s.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {accounts.length > 1 ? (
            <>
              <Text style={s.label}>Account</Text>
              <View style={s.chipRow}>
                {accounts.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[s.chip, accountId === a.id && s.chipActive]}
                    onPress={() => setAccountId(a.id)}
                  >
                    <Text style={[s.chipText, accountId === a.id && s.chipTextActive]}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          <TextInput
            style={s.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Amount (e.g. 12.50)"
          />
          <TextInput
            style={s.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
          />
          <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

          <Text style={s.label}>Category</Text>
          {categories.length === 0 ? (
            <Text style={s.empty}>No categories yet.</Text>
          ) : (
            <View style={s.chipRow}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.chip, categoryId === c.id && s.chipActive]}
                  onPress={() => setCategoryId(c.id)}
                >
                  <Text style={[s.chipText, categoryId === c.id && s.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {items !== undefined ? (
            <>
              <Text style={s.label}>Items</Text>
              {items.map((item, index) => (
                <View key={index} style={s.itemCard}>
                  <View style={s.itemRow}>
                    <TextInput
                      style={[s.input, s.itemNameInput]}
                      value={item.name}
                      onChangeText={(v) => updateItem(index, "name", v)}
                      placeholder="Item"
                    />
                    <TextInput
                      style={[s.input, s.itemAmountInput]}
                      value={item.amount}
                      onChangeText={(v) => updateItem(index, "amount", v)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                    <TouchableOpacity onPress={() => removeItem(index)} style={s.itemRemove}>
                      <Text style={s.itemRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={s.itemCategoryButton} onPress={() => setItemCategoryPickerIndex(index)}>
                    <Text style={s.itemCategoryButtonText} numberOfLines={1}>
                      {categories.find((c) => c.id === item.categoryId)?.name || "Pick a category"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={addItem} style={s.addItemButton}>
                <Text style={s.addItemButtonText}>+ Add item</Text>
              </TouchableOpacity>

              <View style={s.taxTipRow}>
                <View style={s.taxTipField}>
                  <Text style={s.label}>Tax</Text>
                  <TextInput style={s.input} value={tax} onChangeText={setTax} keyboardType="decimal-pad" placeholder="0.00" />
                </View>
                <View style={s.taxTipField}>
                  <Text style={s.label}>Tip</Text>
                  <TextInput style={s.input} value={tip} onChangeText={setTip} keyboardType="decimal-pad" placeholder="0.00" />
                </View>
              </View>
            </>
          ) : null}
        </>
      )}

      <View style={s.formActions}>
        <TouchableOpacity style={s.secondaryButton} onPress={onClose}>
          <Text style={s.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.primaryButton}
          onPress={handleSave}
          disabled={createTransaction.isPending || updateTransaction.isPending || isPending || isError}
        >
          <Text style={s.primaryButtonText}>
            {createTransaction.isPending || updateTransaction.isPending ? "Saving…" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>
    </FormModal>

    <Modal
      visible={itemCategoryPickerIndex !== null}
      transparent
      animationType="slide"
      onRequestClose={() => setItemCategoryPickerIndex(null)}
    >
      <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setItemCategoryPickerIndex(null)}>
        <View style={s.modalSheet}>
          <Text style={s.modalSheetTitle}>Category</Text>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={s.modalItem} onPress={() => handlePickItemCategory(c)}>
              <Text style={s.modalItemText}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextActive: { color: "#fff" },
  empty: { color: "#888", fontSize: 13, marginBottom: 16 },
  loadingBox: { alignItems: "center", paddingVertical: 24, gap: 8 },
  loadingText: { color: "#888", fontSize: 13 },
  errorText: { color: "#c0392b", fontSize: 13, textAlign: "center" },
  retryButton: { marginTop: 4, paddingVertical: 8, paddingHorizontal: 16 },
  retryButtonText: { color: "#1a6ed8", fontWeight: "600" },
  formActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  primaryButton: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#666" },
  itemCard: { marginBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemNameInput: { flex: 1, marginBottom: 6 },
  itemAmountInput: { width: 80, marginBottom: 6 },
  itemRemove: { paddingHorizontal: 4, paddingBottom: 16 },
  itemRemoveText: { fontSize: 20, color: "#c0392b" },
  itemCategoryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  itemCategoryButtonText: { fontSize: 12, color: "#1a6ed8", fontWeight: "600" },
  addItemButton: { alignSelf: "flex-start", marginBottom: 16 },
  addItemButtonText: { color: "#1a6ed8", fontWeight: "600", fontSize: 13 },
  taxTipRow: { flexDirection: "row", gap: 10 },
  taxTipField: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "70%" },
  modalSheetTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalItemText: { fontSize: 15, color: "#1a1a1a" },
});

const darkStyles = {
  modalTitle: { color: dark.text },
  label: { color: dark.text },
  input: { borderColor: dark.border, color: dark.text, backgroundColor: dark.bgAlt },
  chip: { borderColor: dark.border, backgroundColor: dark.chipBg },
  chipActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  chipText: { color: dark.text },
  empty: { color: dark.textMuted },
  loadingText: { color: dark.textMuted },
  errorText: { color: dark.danger },
  retryButtonText: { color: dark.accent },
  primaryButton: { backgroundColor: dark.accent },
  secondaryButtonText: { color: dark.textMuted },
  itemRemoveText: { color: dark.danger },
  itemCategoryButton: { borderColor: dark.border, backgroundColor: dark.chipBg },
  itemCategoryButtonText: { color: dark.accent },
  addItemButtonText: { color: dark.accent },
  modalSheet: { backgroundColor: dark.card },
  modalSheetTitle: { color: dark.text },
  modalItem: { borderBottomColor: dark.border },
  modalItemText: { color: dark.text },
};
