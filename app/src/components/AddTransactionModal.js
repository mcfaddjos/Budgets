import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { shadowModal } from "../theme";

/**
 * Shared across TransactionsScreen and BudgetsScreen (both top-level
 * buttons, no account implied) — the account picker only shows when there's
 * more than one account to choose from. Loads its own accounts/categories
 * on open rather than trusting the parent screen's already-loaded state, so
 * it has an honest loading/error state instead of silently showing nothing
 * while data is in flight (indistinguishable from "no categories exist").
 */
export default function AddTransactionModal({ visible, initialAccountId, onClose, onSaved }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { accounts: accts, categories: cats } = await api.getTransactionFormOptions();
      setAccounts(accts);
      setCategories(cats);
      setAccountId(initialAccountId || accts[0]?.id || null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [initialAccountId]);

  useEffect(() => {
    if (visible) {
      setAmount("");
      setDescription("");
      setCategoryId(null);
      loadOptions();
    }
  }, [visible, loadOptions]);

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
    setSaving(true);
    try {
      await api.createTransaction(accountId, amt, categoryId, description.trim());
      Alert.alert("Transaction added", `${description.trim() || "(no description)"} — $${amt.toFixed(2)}`);
      onSaved();
    } catch (err) {
      Alert.alert("Couldn't add transaction", err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add transaction</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Loading accounts and categories…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.loadingBox}>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadOptions}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {accounts.length > 1 ? (
                <>
                  <Text style={styles.label}>Account</Text>
                  <View style={styles.chipRow}>
                    {accounts.map((a) => (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.chip, accountId === a.id && styles.chipActive]}
                        onPress={() => setAccountId(a.id)}
                      >
                        <Text style={[styles.chipText, accountId === a.id && styles.chipTextActive]}>
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="Amount (e.g. 12.50)"
              />
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Description (optional)"
              />

              <Text style={styles.label}>Category</Text>
              {categories.length === 0 ? (
                <Text style={styles.empty}>No categories yet.</Text>
              ) : (
                <View style={styles.chipRow}>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, categoryId === c.id && styles.chipActive]}
                      onPress={() => setCategoryId(c.id)}
                    >
                      <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSave}
              disabled={saving || loading || !!loadError}
            >
              <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, maxHeight: "80%", ...shadowModal },
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
});
