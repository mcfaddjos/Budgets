import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useCategories, useMonthlyBudgetSummaries } from "../data/queries";
import { useTheme } from "../theme/ThemeContext";
import { lastNMonths, monthLabel } from "./months";
import Bar from "./Bar";

const MONTHS_SHOWN = 6;

function formatMoney(amount) {
  return `$${amount.toFixed(0)}`;
}

/**
 * This report's "setting" is which category to drill into — a chip
 * picker, same interaction pattern used for account/category pickers
 * elsewhere in the app (AddTransactionModal, AccountsScreen's owner
 * picker), rather than a bespoke control.
 */
export default function CategoryTrendReport() {
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState(null);
  const months = useMemo(() => lastNMonths(MONTHS_SHOWN), []);
  const results = useMonthlyBudgetSummaries(months);
  const { colors } = useTheme();

  useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id);
  }, [categoryId, categories]);

  const isPending = results.some((r) => r.isPending);
  const rows = months.map((month, i) => {
    const categoryRow = results[i]?.data?.categories?.find((c) => c.categoryId === categoryId);
    return { month, value: categoryRow?.actual ?? 0 };
  });
  const maxValue = Math.max(...rows.map((r) => r.value), 1);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, { borderColor: colors.border }, categoryId === c.id && { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={() => setCategoryId(c.id)}
          >
            <Text style={[styles.chipText, { color: categoryId === c.id ? "#fff" : colors.text }]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isPending ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : !categoryId ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>Add a category first.</Text>
      ) : (
        <View style={styles.bars}>
          {rows.map((r) => (
            <Bar
              key={r.month}
              label={monthLabel(r.month)}
              value={r.value}
              formattedValue={formatMoney(r.value)}
              maxValue={maxValue}
              color={colors.accent}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 20, paddingBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: "600" },
  bars: { marginTop: 4 },
  empty: { textAlign: "center", marginTop: 40 },
});
