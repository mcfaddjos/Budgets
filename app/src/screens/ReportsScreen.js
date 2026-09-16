import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";
import { REPORTS } from "../reports/registry";

/**
 * Shows exactly one report at a time (a picker chip row, not a dashboard
 * of everything at once) — each report owns its own settings/filters
 * internally (see registry.js), so this screen only ever needs to know
 * which one is selected.
 */
export default function ReportsScreen() {
  const [selectedId, setSelectedId] = useState(REPORTS[0].id);
  const s = useThemedStyles(styles, darkStyles);
  const selected = REPORTS.find((r) => r.id === selectedId) ?? REPORTS[0];
  const SelectedReport = selected.Component;

  return (
    <View style={s.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pickerRow}>
        {REPORTS.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[s.chip, selectedId === r.id && s.chipActive]}
            onPress={() => setSelectedId(r.id)}
          >
            <Text style={[s.chipText, selectedId === r.id && s.chipTextActive]}>{r.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.body}>
        <SelectedReport />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  pickerRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#ddd", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#333" },
  chipTextActive: { color: "#fff" },
  body: { padding: 16, paddingTop: 12 },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
  chip: { borderColor: dark.border, backgroundColor: dark.chipBg },
  chipActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  chipText: { color: dark.text },
};
