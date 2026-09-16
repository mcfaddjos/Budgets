import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useBudgetSummary } from "../data/queries";
import { useTheme } from "../theme/ThemeContext";
import { categoricalColor, otherColor, MAX_CATEGORICAL_SLOTS } from "../theme/chartColors";
import Bar from "./Bar";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(amount) {
  return `$${Math.abs(amount).toFixed(0)}`;
}

/**
 * Report settings live locally in this component (the month being
 * viewed) — each report owns its own filters rather than the screen
 * shell knowing about them, so a new report type never needs the shell
 * to change.
 */
export default function CategorySpendReport() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isPending } = useBudgetSummary(month);
  const { scheme, colors } = useTheme();

  const rows = useMemo(() => {
    const categories = (data?.categories ?? []).filter((c) => c.actual > 0).sort((a, b) => b.actual - a.actual);
    const top = categories.slice(0, MAX_CATEGORICAL_SLOTS - 1);
    const rest = categories.slice(MAX_CATEGORICAL_SLOTS - 1);
    const restTotal = rest.reduce((sum, c) => sum + c.actual, 0);
    const result = top.map((c, i) => ({ label: c.categoryName, value: c.actual, color: categoricalColor(i, scheme) }));
    if (restTotal > 0) result.push({ label: `Other (${rest.length})`, value: restTotal, color: otherColor(scheme) });
    return result;
  }, [data, scheme]);

  const maxValue = rows.reduce((max, r) => Math.max(max, r.value), 0);

  return (
    <View>
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{month}</Text>
        <TouchableOpacity onPress={() => setMonth((m) => shiftMonth(m, 1))} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.accent }]}>›</Text>
        </TouchableOpacity>
      </View>

      {isPending ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No spending recorded for {month}.</Text>
      ) : (
        rows.map((r) => (
          <Bar key={r.label} label={r.label} value={r.value} formattedValue={formatMoney(r.value)} maxValue={maxValue} color={r.color} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 20, gap: 20 },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 22, fontWeight: "700" },
  monthLabel: { fontSize: 15, fontWeight: "700", minWidth: 80, textAlign: "center" },
  empty: { textAlign: "center", marginTop: 40 },
});
