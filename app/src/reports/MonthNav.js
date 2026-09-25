import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import MonthYearPickerModal from "../components/MonthYearPickerModal";

/**
 * Compact prev/next month control, shared by every report (and Budgets)
 * that's scoped to one month at a time. Tapping the label opens the same
 * year+month jump picker Transactions uses — arrows alone made hopping
 * back several months at once take one tap per month.
 */
export default function MonthNav({ month, onChange, onSelect }) {
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => onChange(-1)} style={styles.arrow} hitSlop={8}>
        <Text style={[styles.arrowText, { color: colors.accent }]}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setPickerOpen(true)}>
        <Text style={[styles.label, { color: colors.text }]}>{month}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onChange(1)} style={styles.arrow} hitSlop={8}>
        <Text style={[styles.arrowText, { color: colors.accent }]}>›</Text>
      </TouchableOpacity>

      {pickerOpen ? (
        <MonthYearPickerModal
          month={month}
          onSelect={(m) => {
            onSelect(m);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, gap: 14 },
  arrow: { padding: 4 },
  arrowText: { fontSize: 17, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "700", minWidth: 70, textAlign: "center" },
});
