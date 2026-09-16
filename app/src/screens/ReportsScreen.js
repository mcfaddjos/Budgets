import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";
import { REPORTS } from "../reports/registry";
import Chip from "../reports/Chip";

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
          <Chip key={r.id} label={r.title} active={selectedId === r.id} onPress={() => setSelectedId(r.id)} />
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
  pickerRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  body: { padding: 16, paddingTop: 12 },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
};
