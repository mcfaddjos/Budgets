import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useCreateManualTransaction, useTransactionFormOptions } from "../data/queries";

/**
 * Shared across TransactionsScreen and BudgetsScreen (both top-level
 * buttons, no account implied) — the account picker only shows when there's
 * more than one account to choose from.
 */
export default function AddTransactionModal({ visible, initialAccountId, onClose, onSaved }) {
  const { data, isPending, isError, error, refetch } = useTransactionFormOptions();
  const createTransaction = useCreateManualTransaction();
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];

  const [accountId, setAccountId] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(null);

  useEffect(() => {
    if (visible) {
      setAmount("");
      setDescription("");
      setCategoryId(null);
      setAccountId(initialAccountId || null);
    }
  }, [visible, initialAccountId]);

  useEffect(() => {
    if (visible && !accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [visible, accountId, accounts]);

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
      await createTransaction.mutateAsync({
        accountId,
        categoryId,
        amount: amt,
        description: description.trim(),
        fallbackDescription: category?.name,
      });
      Alert.alert("Transaction added", `${description.trim() || category?.name || "(no description)"} — $${amt.toFixed(2)}`);
      onSaved();
    } catch (err) {
      Alert.alert("Couldn't add transaction", err.message);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add transaction</Text>

          {isPending ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Loading accounts and categories…</Text>
            </View>
          ) : isError ? (
            <View style={styles.loadingBox}>
              <Text style={styles.errorText}>{error.message}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={refetch}>
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
              disabled={createTransaction.isPending || isPending || isError}
            >
              <Text style={styles.primaryButtonText}>{createTransaction.isPending ? "Saving…" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, maxHeight: "80%" },
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
