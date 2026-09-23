import { useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useReceiptImage } from "../data/queries";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

function formatAmount(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

/**
 * The itemized breakdown a scanned receipt produces (PRD §8.6) — items
 * only render when the transaction actually has them (a plain manual
 * entry never does). "View receipt" is a lazy, on-demand fetch (not
 * prefetched with the transaction list) since most transactions won't
 * have an image at all, and image bytes shouldn't load until someone
 * actually asks to see one.
 */
export default function TransactionDetailModal({ transaction, categoryName, onClose }) {
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptQuery = useReceiptImage(showReceipt ? transaction?.id : undefined);
  const s = useThemedStyles(styles, darkStyles);

  if (!transaction) return null;
  const items = Array.isArray(transaction.items) ? transaction.items : [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.title}>{transaction.description || "Transaction"}</Text>
            <Text style={s.amount}>{formatAmount(transaction.amount)}</Text>
            <Text style={s.meta}>
              {transaction.date} · {categoryName}
            </Text>

            {items.length > 0 ? (
              <View style={s.itemsBox}>
                <Text style={s.sectionLabel}>Items</Text>
                {items.map((item, i) => (
                  <View key={i} style={s.itemRow}>
                    <Text style={s.itemName}>{item.name}</Text>
                    <Text style={s.itemAmount}>{formatAmount(item.amount)}</Text>
                  </View>
                ))}
                {transaction.tax ? (
                  <View style={s.itemRow}>
                    <Text style={s.itemNameMuted}>Tax</Text>
                    <Text style={s.itemAmount}>{formatAmount(transaction.tax)}</Text>
                  </View>
                ) : null}
                {transaction.tip ? (
                  <View style={s.itemRow}>
                    <Text style={s.itemNameMuted}>Tip</Text>
                    <Text style={s.itemAmount}>{formatAmount(transaction.tip)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {!showReceipt ? (
              <TouchableOpacity style={s.button} onPress={() => setShowReceipt(true)}>
                <Text style={s.buttonText}>View receipt</Text>
              </TouchableOpacity>
            ) : receiptQuery.isPending ? (
              <ActivityIndicator style={s.receiptLoading} />
            ) : receiptQuery.data ? (
              <Image
                source={{ uri: `data:${receiptQuery.data.mimeType};base64,${receiptQuery.data.image}` }}
                style={s.receiptImage}
                resizeMode="contain"
              />
            ) : (
              <Text style={s.hint}>No receipt image was saved for this transaction.</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={s.closeButton} onPress={onClose}>
            <Text style={s.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "80%" },
  scroll: { paddingBottom: 8 },
  title: { fontSize: 17, fontWeight: "700" },
  amount: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  meta: { fontSize: 13, color: "#888", marginTop: 2, marginBottom: 16 },
  itemsBox: { backgroundColor: "#f7f7f8", borderRadius: 10, padding: 12, marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: 8 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  itemName: { fontSize: 14, color: "#1a1a1a", flex: 1 },
  itemNameMuted: { fontSize: 14, color: "#888", flex: 1 },
  itemAmount: { fontSize: 14, color: "#1a1a1a", fontWeight: "500" },
  button: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  hint: { color: "#999", fontSize: 13, textAlign: "center", marginTop: 8 },
  receiptLoading: { marginTop: 16 },
  receiptImage: { width: "100%", height: 320, marginTop: 8, borderRadius: 8, backgroundColor: "#eee" },
  closeButton: { alignItems: "center", paddingTop: 12 },
  closeButtonText: { color: "#666", fontWeight: "600" },
});

const darkStyles = {
  sheet: { backgroundColor: dark.card },
  title: { color: dark.text },
  amount: { color: dark.text },
  meta: { color: dark.textMuted },
  itemsBox: { backgroundColor: dark.bgAlt },
  sectionLabel: { color: dark.textMuted },
  itemName: { color: dark.text },
  itemNameMuted: { color: dark.textMuted },
  itemAmount: { color: dark.text },
  button: { backgroundColor: dark.accent },
  hint: { color: dark.textFaint },
  receiptImage: { backgroundColor: dark.bgAlt },
  closeButtonText: { color: dark.textMuted },
};
