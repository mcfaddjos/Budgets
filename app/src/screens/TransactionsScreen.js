import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCategories, useDeleteTransaction, useRecategorizeTransaction, useTransactions } from "../data/queries";
import AddTransactionModal from "../components/AddTransactionModal";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatAmount(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default function TransactionsScreen() {
  const month = currentMonth();
  const { data: transactions = [], isPending, isFetching, refetch } = useTransactions(month);
  const { data: categories = [] } = useCategories();
  const recategorize = useRecategorizeTransaction();
  const deleteTransaction = useDeleteTransaction();

  const [pickerTx, setPickerTx] = useState(null);
  const [addTxVisible, setAddTxVisible] = useState(false);
  const s = useThemedStyles(styles, darkStyles);

  function categoryName(categoryId) {
    return categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
  }

  async function handlePickCategory(category) {
    if (!pickerTx) return;
    try {
      await recategorize.mutateAsync({ tx: pickerTx, categoryId: category.id, applyRule: true });
    } catch (err) {
      Alert.alert("Couldn't update category", err.message);
    } finally {
      setPickerTx(null);
    }
  }

  function handleDelete(tx) {
    Alert.alert("Delete transaction?", `${tx.description} — ${formatAmount(tx.amount)}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTransaction.mutateAsync(tx.id);
          } catch (err) {
            Alert.alert("Couldn't delete transaction", err.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.header}>{month}</Text>
        <TouchableOpacity style={s.addButton} onPress={() => setAddTxVisible(true)}>
          <Text style={s.addButtonText}>+ Add Transaction</Text>
        </TouchableOpacity>
      </View>

      {isPending ? (
        <View style={s.loadingBox}>
          <ActivityIndicator />
          <Text style={s.loadingText}>Loading transactions…</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={s.empty}>No transactions this month yet. Add one to get started.</Text>}
          ListHeaderComponent={
            transactions.length > 0 ? <Text style={s.hint}>Long-press a transaction to delete it.</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onLongPress={() => handleDelete(item)}>
              <View style={s.rowMain}>
                <Text style={s.description} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={s.date}>{item.date}</Text>
              </View>
              <View style={s.rowSide}>
                <Text style={[s.amount, item.amount < 0 && s.amountCredit]}>{formatAmount(item.amount)}</Text>
                <TouchableOpacity onPress={() => setPickerTx(item)}>
                  <Text style={s.category}>{categoryName(item.categoryId)}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!pickerTx} transparent animationType="slide" onRequestClose={() => setPickerTx(null)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setPickerTx(null)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Categorize</Text>
            {categories.map((c) => (
              <TouchableOpacity key={c.id} style={s.modalItem} onPress={() => handlePickCategory(c)}>
                <Text style={s.modalItemText}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <AddTransactionModal
        visible={addTxVisible}
        onClose={() => setAddTxVisible(false)}
        onSaved={() => setAddTxVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  header: { fontSize: 14, fontWeight: "600", color: "#888" },
  addButton: {
    backgroundColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  loadingText: { color: "#888", fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  hint: { textAlign: "center", color: "#aaa", fontSize: 11, marginBottom: 8 },
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

const darkStyles = {
  container: { backgroundColor: dark.bg },
  header: { color: dark.textMuted },
  addButton: { backgroundColor: dark.accent },
  loadingText: { color: dark.textMuted },
  empty: { color: dark.textMuted },
  hint: { color: dark.textFaint },
  row: { backgroundColor: dark.card },
  description: { color: dark.text },
  date: { color: dark.textFaint },
  amount: { color: dark.text },
  amountCredit: { color: dark.success },
  category: { color: dark.accent },
  modalSheet: { backgroundColor: dark.card },
  modalTitle: { color: dark.text },
  modalItem: { borderBottomColor: dark.border },
  modalItemText: { color: dark.text },
};
