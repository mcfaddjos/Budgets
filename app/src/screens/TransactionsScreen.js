import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatAmount(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerTx, setPickerTx] = useState(null);

  const month = currentMonth();

  const load = useCallback(async () => {
    try {
      const [txs, cats] = await Promise.all([
        api.getTransactions({ month }),
        api.getCategories(),
      ]);
      setTransactions(txs);
      setCategories(cats);
    } catch (err) {
      Alert.alert("Couldn't load transactions", err.message);
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

  function categoryName(categoryId) {
    return categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
  }

  async function handleToggleReviewed(tx) {
    try {
      const updated = await api.updateTransaction(tx.id, { reviewed: !tx.reviewed });
      setTransactions((prev) => prev.map((t) => (t.id === tx.id ? updated : t)));
    } catch (err) {
      Alert.alert("Couldn't update transaction", err.message);
    }
  }

  async function handlePickCategory(category) {
    if (!pickerTx) return;
    try {
      const updated = await api.updateTransaction(pickerTx.id, {
        categoryId: category.id,
        applyRule: true,
      });
      setTransactions((prev) => prev.map((t) => (t.id === pickerTx.id ? updated : t)));
    } catch (err) {
      Alert.alert("Couldn't update category", err.message);
    } finally {
      setPickerTx(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{month}</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No transactions this month yet. Import a statement.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.description} numberOfLines={1}>
                {item.description}
              </Text>
              <Text style={styles.date}>{item.date}</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={[styles.amount, item.amount < 0 && styles.amountCredit]}>
                {formatAmount(item.amount)}
              </Text>
              <TouchableOpacity onPress={() => setPickerTx(item)}>
                <Text style={styles.category}>{categoryName(item.category_id)}</Text>
              </TouchableOpacity>
            </View>
            <Switch value={!!item.reviewed} onValueChange={() => handleToggleReviewed(item)} />
          </View>
        )}
      />

      <Modal visible={!!pickerTx} transparent animationType="slide" onRequestClose={() => setPickerTx(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerTx(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Categorize</Text>
            {categories.map((c) => (
              <TouchableOpacity key={c.id} style={styles.modalItem} onPress={() => handlePickCategory(c)}>
                <Text style={styles.modalItemText}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  header: { fontSize: 14, fontWeight: "600", color: "#888", padding: 16, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  rowMain: { flex: 1 },
  description: { fontSize: 15, fontWeight: "500" },
  date: { fontSize: 12, color: "#999", marginTop: 2 },
  rowSide: { alignItems: "flex-end" },
  amount: { fontSize: 15, fontWeight: "600" },
  amountCredit: { color: "#2a8a4a" },
  category: { fontSize: 12, color: "#1a6ed8", marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "60%" },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  modalItemText: { fontSize: 16 },
});
