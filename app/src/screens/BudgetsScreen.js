import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";
import AddTransactionModal from "../components/AddTransactionModal";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMoney(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default function BudgetsScreen() {
  const [data, setData] = useState({ categories: [], totals: { budget: 0, actual: 0, variance: 0 } });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [amountInput, setAmountInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [addTxVisible, setAddTxVisible] = useState(false);
  const [addCategoryVisible, setAddCategoryVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const month = currentMonth();

  const load = useCallback(async () => {
    try {
      setData(await api.getBudgets(month));
    } catch (err) {
      Alert.alert("Couldn't load budgets", err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openEditor(category) {
    setEditing(category);
    setAmountInput(category.budgetAmount ? String(category.budgetAmount) : "");
    setNameInput(category.categoryName);
  }

  async function handleSaveBudget() {
    const amount = parseFloat(amountInput);
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert("Invalid amount", "Enter a budget amount of 0 or more.");
      return;
    }
    const name = nameInput.trim();
    if (!name) {
      Alert.alert("Name required", "Category name can't be empty.");
      return;
    }
    setSavingBudget(true);
    try {
      if (name !== editing.categoryName) {
        await api.updateCategory(editing.categoryId, name);
      }
      await api.setBudget(editing.categoryId, month, amount);
      setEditing(null);
      load();
    } catch (err) {
      Alert.alert("Couldn't save", err.message);
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert("Name required", "Give the category a name, e.g. \"Presents\".");
      return;
    }
    setSavingCategory(true);
    try {
      await api.createCategory(name);
      setNewCategoryName("");
      setAddCategoryVisible(false);
      load();
    } catch (err) {
      Alert.alert("Couldn't add category", err.message);
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleSyncQuickAdd() {
    setSyncing(true);
    try {
      const summary = await api.importQuickAddBudgets();
      Alert.alert(
        "Quick Add synced",
        `${summary.applied} budget(s) applied, ${summary.skippedUnknownCategory} skipped (unknown category).`
      );
      load();
    } catch (err) {
      Alert.alert("Sync failed", err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>{month}</Text>
        <View style={styles.summaryRow}>
          <SummaryStat label="Budgeted" value={formatMoney(data.totals.budget)} />
          <SummaryStat label="Spent" value={formatMoney(data.totals.actual)} />
          <SummaryStat
            label="Left"
            value={formatMoney(data.totals.variance)}
            color={data.totals.variance < 0 ? "#c0392b" : "#2a8a4a"}
          />
        </View>
        <View style={styles.summaryActions}>
          <TouchableOpacity style={styles.addButton} onPress={() => setAddTxVisible(true)}>
            <Text style={styles.addButtonText}>+ Add Transaction</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.syncButton} onPress={handleSyncQuickAdd} disabled={syncing}>
            <Text style={styles.syncButtonText}>{syncing ? "Syncing…" : "Sync Quick Add"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading budgets…</Text>
        </View>
      ) : (
        <FlatList
          data={data.categories}
          keyExtractor={(item) => String(item.categoryId)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <TouchableOpacity style={styles.addCategoryButton} onPress={() => setAddCategoryVisible(true)}>
              <Text style={styles.addCategoryButtonText}>+ Add Category</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => {
            const pct = item.budgetAmount > 0 ? Math.min(item.actual / item.budgetAmount, 1) : 0;
            const over = item.budgetAmount > 0 && item.actual > item.budgetAmount;
            return (
              <TouchableOpacity style={styles.card} onPress={() => openEditor(item)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.categoryName}</Text>
                  <Text style={styles.cardAmounts}>
                    {formatMoney(item.actual)} / {formatMoney(item.budgetAmount)}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${pct * 100}%`, backgroundColor: over ? "#c0392b" : "#1a6ed8" },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit category</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={nameInput} onChangeText={setNameInput} placeholder="Category name" />
            <Text style={styles.label}>Budget</Text>
            <TextInput
              style={styles.input}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditing(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveBudget} disabled={savingBudget}>
                <Text style={styles.primaryButtonText}>{savingBudget ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={addCategoryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddCategoryVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New category</Text>
            <TextInput
              style={styles.input}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="e.g. Presents"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setAddCategoryVisible(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleAddCategory} disabled={savingCategory}>
                <Text style={styles.primaryButtonText}>{savingCategory ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AddTransactionModal
        visible={addTxVisible}
        onClose={() => setAddTxVisible(false)}
        onSaved={() => {
          setAddTxVisible(false);
          load();
        }}
      />
    </View>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  summary: { backgroundColor: "#fff", padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  summaryLabel: { fontSize: 13, color: "#888", marginBottom: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  loadingText: { color: "#888", fontSize: 13 },
  addButton: {
    flex: 1,
    backgroundColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "600" },
  syncButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  syncButtonText: { color: "#1a6ed8", fontWeight: "600" },
  stat: { alignItems: "center", flex: 1 },
  statLabel: { fontSize: 12, color: "#999" },
  statValue: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  list: { padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardAmounts: { fontSize: 13, color: "#666" },
  progressTrack: { height: 6, backgroundColor: "#eee", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  addCategoryButton: {
    borderWidth: 1,
    borderColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  addCategoryButtonText: { color: "#1a6ed8", fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryButton: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#666" },
});
