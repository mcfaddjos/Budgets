import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

/**
 * One horizontal bar mark, shared by every report: a track (baseline-
 * anchored, rounded ends per the dataviz skill's mark spec) plus a direct
 * label — the label makes color never the sole carrier of identity, which
 * also covers the "below 3:1 contrast" categorical slots (the skill's
 * relief rule).
 */
export default function Bar({ label, value, formattedValue, maxValue, color }) {
  const { colors } = useTheme();
  const pct = maxValue > 0 ? Math.min(Math.max(value / maxValue, 0), 1) : 0;
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.value, { color: colors.textMuted }]}>{formattedValue}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 14 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 13, fontWeight: "600", flexShrink: 1, marginRight: 8 },
  value: { fontSize: 13 },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
});
