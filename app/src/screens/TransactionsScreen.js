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
import {
  useCategories,
  useDeleteTransaction,
  useHouseholdSettings,
  useRecategorizeTransaction,
  useSaveReceiptImage,
  useTransactions,
} from "../data/queries";
import AddTransactionModal from "../components/AddTransactionModal";
import TransactionDetailModal from "../components/TransactionDetailModal";
import MonthYearPickerModal from "../components/MonthYearPickerModal";
import { captureReceiptPhoto } from "../receipts/capture";
import { extractFromImage } from "../receipts/extractReceipt";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

const SCAN_KINDS = [
  { kind: "receipt", label: "Receipt" },
  { kind: "gas_pump", label: "Gas pump" },
  { kind: "payment_screenshot", label: "Payment screenshot" },
];

function initialValuesFromExtraction(kind, extracted) {
  if (kind === "receipt") {
    return {
      description: extracted.vendor || "",
      amount: extracted.total != null ? extracted.total : "",
      date: extracted.date || undefined,
      items: extracted.items,
      tax: extracted.tax,
      tip: extracted.tip,
    };
  }
  return {
    description: extracted.description || extracted.vendor || "",
    amount: extracted.amount != null ? extracted.amount : "",
    date: extracted.date || undefined,
  };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** month is a "YYYY-MM" string; delta is +1/-1. Going through Date (not string math) handles year rollover for free. */
function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatAmount(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default function TransactionsScreen() {
  const [month, setMonth] = useState(currentMonth());
  const { data: transactions = [], isPending, isFetching, refetch } = useTransactions(month);
  const { data: categories = [] } = useCategories();
  const recategorize = useRecategorizeTransaction();
  const deleteTransaction = useDeleteTransaction();
  const { data: householdSettings } = useHouseholdSettings();
  const saveReceiptImage = useSaveReceiptImage();

  const [pickerTx, setPickerTx] = useState(null);
  const [addTxVisible, setAddTxVisible] = useState(false);
  const [scanInitialValues, setScanInitialValues] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [pendingReceiptPhoto, setPendingReceiptPhoto] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [detailTx, setDetailTx] = useState(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
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

  function handleScanPress() {
    Alert.alert(
      "Scan",
      "What are you scanning?",
      SCAN_KINDS.map(({ kind, label }) => ({ text: label, onPress: () => runScan(kind) })).concat({
        text: "Cancel",
        style: "cancel",
      })
    );
  }

  async function runScan(kind) {
    setScanning(true);
    try {
      const photo = await captureReceiptPhoto();
      if (!photo) return; // cancelled, or camera permission denied
      const extracted = await extractFromImage(photo.base64, photo.mimeType, kind);
      setPendingReceiptPhoto(householdSettings?.keepReceiptImages ? photo : null);
      setScanInitialValues(initialValuesFromExtraction(kind, extracted));
      setAddTxVisible(true);
    } catch (err) {
      Alert.alert("Couldn't scan that", err.message);
    } finally {
      setScanning(false);
    }
  }

  function handleAddTxClose() {
    setAddTxVisible(false);
    setScanInitialValues(null);
    setPendingReceiptPhoto(null);
    setEditingTx(null);
  }

  function handleEditTx(tx) {
    setDetailTx(null);
    setEditingTx(tx);
    setAddTxVisible(true);
  }

  async function handleAddTxSaved(created) {
    setAddTxVisible(false);
    const photo = pendingReceiptPhoto;
    setScanInitialValues(null);
    setPendingReceiptPhoto(null);
    setEditingTx(null);
    // A scanned receipt can carry a real date from any month — jump the
    // view there so the transaction that was just added is actually
    // visible, instead of silently landing outside the current filter.
    if (created?.date && created.date.slice(0, 7) !== month) setMonth(created.date.slice(0, 7));
    if (photo && created?.id) {
      try {
        await saveReceiptImage.mutateAsync({ transactionId: created.id, image: photo.base64, mimeType: photo.mimeType });
      } catch (err) {
        Alert.alert("Transaction saved, but the receipt image failed to upload", err.message);
      }
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
        <View style={s.monthNavRow}>
          <View style={s.monthNav}>
            <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={8}>
              <Text style={s.monthNavArrow}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMonthPickerOpen(true)}>
              <Text style={s.header}>{formatMonthLabel(month)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} hitSlop={8}>
              <Text style={s.monthNavArrow}>›</Text>
            </TouchableOpacity>
          </View>
          {month !== currentMonth() ? (
            <TouchableOpacity onPress={() => setMonth(currentMonth())}>
              <Text style={s.todayLink}>Today</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.headerButtons}>
          <TouchableOpacity style={s.scanButton} onPress={handleScanPress} disabled={scanning}>
            <Text style={s.scanButtonText}>{scanning ? "Scanning…" : "Scan"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addButton} onPress={() => setAddTxVisible(true)}>
            <Text style={s.addButtonText}>+ Add Transaction</Text>
          </TouchableOpacity>
        </View>
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
            transactions.length > 0 ? (
              <Text style={s.hint}>Tap a transaction for details, long-press to delete it.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => setDetailTx(item)} onLongPress={() => handleDelete(item)}>
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
        initialValues={scanInitialValues}
        editingTransaction={editingTx}
        onClose={handleAddTxClose}
        onSaved={handleAddTxSaved}
      />

      {detailTx ? (
        <TransactionDetailModal
          transaction={detailTx}
          categoryName={categoryName(detailTx.categoryId)}
          onClose={() => setDetailTx(null)}
          onEdit={handleEditTx}
        />
      ) : null}

      {monthPickerOpen ? (
        <MonthYearPickerModal
          month={month}
          onSelect={(m) => {
            setMonth(m);
            setMonthPickerOpen(false);
          }}
          onClose={() => setMonthPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  monthNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  header: { fontSize: 15, fontWeight: "600", color: "#888" },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthNavArrow: { fontSize: 20, color: "#1a6ed8", fontWeight: "700", paddingHorizontal: 2 },
  todayLink: { fontSize: 12, color: "#1a6ed8", fontWeight: "600" },
  headerButtons: { flexDirection: "row", gap: 8 },
  scanButton: {
    borderWidth: 1,
    borderColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  scanButtonText: { color: "#1a6ed8", fontWeight: "600", fontSize: 13 },
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
  monthNavArrow: { color: dark.accent },
  todayLink: { color: dark.accent },
  scanButton: { borderColor: dark.accent },
  scanButtonText: { color: dark.accent },
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
