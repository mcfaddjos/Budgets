import { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Jumping to a specific month straight from prev/next arrows meant a
 * scanned receipt from, say, January took 8 taps to find — this lets a
 * user pick a year and month directly instead. `month` is the currently
 * selected "YYYY-MM"; the year stepper starts on that month's year each
 * time this mounts (a fresh component instance per open, same pattern as
 * TransactionDetailModal — no need for a useEffect reset).
 */
export default function MonthYearPickerModal({ month, onSelect, onClose }) {
  const selectedYear = Number(month.slice(0, 4));
  const selectedMonthIndex = Number(month.slice(5, 7)) - 1;
  const [year, setYear] = useState(selectedYear);
  const s = useThemedStyles(styles, darkStyles);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <Text style={s.title}>Jump to month</Text>

          <View style={s.yearRow}>
            <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={10}>
              <Text style={s.yearArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={s.year}>{year}</Text>
            <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={10}>
              <Text style={s.yearArrow}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={s.grid}>
            {MONTH_LABELS.map((label, i) => {
              const active = year === selectedYear && i === selectedMonthIndex;
              return (
                <TouchableOpacity
                  key={label}
                  style={[s.cell, active && s.cellActive]}
                  onPress={() => onSelect(`${year}-${String(i + 1).padStart(2, "0")}`)}
                >
                  <Text style={[s.cellText, active && s.cellTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={s.closeButton} onPress={onClose}>
            <Text style={s.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 16 },
  yearArrow: { fontSize: 24, color: "#1a6ed8", fontWeight: "700", paddingHorizontal: 8 },
  year: { fontSize: 18, fontWeight: "700", minWidth: 70, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 8 },
  cell: {
    width: "30%",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cellActive: { backgroundColor: "#1a6ed8", borderColor: "#1a6ed8" },
  cellText: { fontSize: 14, color: "#333", fontWeight: "500" },
  cellTextActive: { color: "#fff" },
  closeButton: { alignItems: "center", paddingTop: 12 },
  closeButtonText: { color: "#666", fontWeight: "600" },
});

const darkStyles = {
  sheet: { backgroundColor: dark.card },
  title: { color: dark.text },
  yearArrow: { color: dark.accent },
  year: { color: dark.text },
  cell: { borderColor: dark.border, backgroundColor: dark.chipBg },
  cellActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  cellText: { color: dark.text },
  closeButtonText: { color: dark.textMuted },
};
