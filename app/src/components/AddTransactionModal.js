import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useCategoryRules, useCreateManualTransaction, useTransactionFormOptions } from "../data/queries";
import { categorize, normalizeDescription } from "../categorize/defaults";
import FormModal from "./FormModal";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

function parseAmount(value) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Shared across TransactionsScreen and BudgetsScreen (both top-level
 * buttons, no account implied) — the account picker only shows when there's
 * more than one account to choose from.
 *
 * initialValues (optional, from a receipt/gas-pump/screenshot scan — PRD
 * §8.6): { description, amount, date, items, tax, tip }. `items` being
 * present at all (even []) is what turns on the itemized-breakdown editor
 * — a plain manual entry never has it, so the section stays hidden there.
 */
export default function AddTransactionModal({ visible, initialAccountId, initialValues, onClose, onSaved }) {
  const { data, isPending, isError, error, refetch } = useTransactionFormOptions();
  const { data: categoryRules = [] } = useCategoryRules();
  const createTransaction = useCreateManualTransaction();
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];

  const [accountId, setAccountId] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [items, setItems] = useState(undefined);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");
  const s = useThemedStyles(styles, darkStyles);

  useEffect(() => {
    if (visible) {
      setAmount(initialValues?.amount != null ? String(initialValues.amount) : "");
      setDescription(initialValues?.description || "");
      setCategoryId(null);
      setAccountId(initialAccountId || null);
      setItems(initialValues?.items ? initialValues.items.map((i) => ({ name: i.name, amount: String(i.amount) })) : undefined);
      setTax(initialValues?.tax != null ? String(initialValues.tax) : "");
      setTip(initialValues?.tip != null ? String(initialValues.tip) : "");
    }
  }, [visible, initialAccountId, initialValues]);

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

  function addItem() {
    setItems((prev) => [...(prev || []), { name: "", amount: "" }]);
  }
  function updateItem(index, field, value) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }
  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
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
    const category = categories.find((c) => c.id === categoryId);
    try {
      const created = await createTransaction.mutateAsync({
        accountId,
        categoryId,
        amount: amt,
        description: description.trim(),
        fallbackDescription: category?.name,
        date: initialValues?.date,
        items: items?.map((i) => ({ name: i.name.trim() || "Item", amount: parseAmount(i.amount), categoryId: null })),
        tax: items !== undefined ? parseAmount(tax) : undefined,
        tip: items !== undefined ? parseAmount(tip) : undefined,
      });
      Alert.alert("Transaction added", `${description.trim() || category?.name || "(no description)"} — $${amt.toFixed(2)}`);
      onSaved(created);
    } catch (err) {
      Alert.alert("Couldn't add transaction", err.message);
    }
  }

  return (
    <FormModal visible={visible} onClose={onClose}>
      <Text style={s.modalTitle}>Add transaction</Text>

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
                <View key={index} style={s.itemRow}>
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
          disabled={createTransaction.isPending || isPending || isError}
        >
          <Text style={s.primaryButtonText}>{createTransaction.isPending ? "Saving…" : "Save"}</Text>
        </TouchableOpacity>
      </View>
    </FormModal>
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
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemNameInput: { flex: 1 },
  itemAmountInput: { width: 80 },
  itemRemove: { paddingHorizontal: 4, paddingBottom: 10 },
  itemRemoveText: { fontSize: 20, color: "#c0392b" },
  addItemButton: { alignSelf: "flex-start", marginBottom: 16 },
  addItemButtonText: { color: "#1a6ed8", fontWeight: "600", fontSize: 13 },
  taxTipRow: { flexDirection: "row", gap: 10 },
  taxTipField: { flex: 1 },
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
  addItemButtonText: { color: dark.accent },
};
