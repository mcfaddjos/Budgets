import { useCallback, useEffect, useState } from "react";
import {
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

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMoney(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default function BudgetsScreen() {
  const [data, setData] = useState({ categories: [], totals: { budget: 0, actual: 0, variance: 0 } });
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [amountInput, setAmountInput] = useState("");
  const [syncing, setSyncing] = useState(false);

  const month = currentMonth();

  const load = useCallback(async () => {
    try {
      setData(await api.getBudgets(month));
    } catch (err) {
      Alert.alert("Couldn't load budgets", err.message);
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
  }

  async function handleSaveBudget() {
    const amount = parseFloat(amountInput);
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert("Invalid amount", "Enter a budget amount of 0 or more.");
      return;
    }
    try {
      await api.setBudget(editing.categoryId, month, amount);
      setEditing(null);
      load();
    } catch (err) {
      Alert.alert("Couldn't save budget", err.message);
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
        <TouchableOpacity style={styles.syncButton} onPress={handleSyncQuickAdd} disabled={syncing}>
          <Text style={styles.syncButtonText}>{syncing ? "Syncing…" : "Sync Quick Add"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data.categories}
        keyExtractor={(item) => String(item.categoryId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
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

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing?.categoryName} budget</Text>
            <TextInput
              style={styles.input}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditing(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveBudget}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  syncButton: {
    marginTop: 12,
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
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
