import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

/** Compact prev/next month control, shared by every report that's scoped to one month at a time. */
export default function MonthNav({ month, onChange }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => onChange(-1)} style={styles.arrow} hitSlop={8}>
        <Text style={[styles.arrowText, { color: colors.accent }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[styles.label, { color: colors.text }]}>{month}</Text>
      <TouchableOpacity onPress={() => onChange(1)} style={styles.arrow} hitSlop={8}>
        <Text style={[styles.arrowText, { color: colors.accent }]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, gap: 14 },
  arrow: { padding: 4 },
  arrowText: { fontSize: 17, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "700", minWidth: 70, textAlign: "center" },
});
