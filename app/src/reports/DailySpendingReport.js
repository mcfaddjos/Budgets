import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCategories, useTransactions } from "../data/queries";
import { useTheme } from "../theme/ThemeContext";
import { currentMonth, daysInMonth, shiftMonth } from "./months";
import Chip from "./Chip";
import MonthNav from "./MonthNav";
import LineChart from "./LineChart";

function formatMoney(v) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(0)}`;
}

/**
 * Two settings, both filters on the same underlying data: which month,
 * and whether to look at the whole budget's net daily spend or drill into
 * one category — a "Whole Budget" chip alongside the usual category
 * chips, same picker pattern as CategoryTrendReport.
 */
export default function DailySpendingReport() {
  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState(null); // null = whole budget
  const { data: categories = [] } = useCategories();
  const { data: transactions = [], isPending } = useTransactions(month);
  const { colors } = useTheme();

  const points = useMemo(() => {
    const days = daysInMonth(month);
    const totals = Array.from({ length: days }, () => 0);
    for (const t of transactions) {
      if (categoryId && t.categoryId !== categoryId) continue;
      const day = parseInt(t.date.slice(8, 10), 10);
      if (day >= 1 && day <= days) totals[day - 1] += t.amount;
    }
    return totals.map((y, i) => ({ x: i + 1, y }));
  }, [transactions, categoryId, month]);

  const total = points.reduce((sum, p) => sum + p.y, 0);
  const categoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name : null;

  return (
    <View>
      <MonthNav month={month} onChange={(delta) => setMonth((m) => shiftMonth(m, delta))} onSelect={setMonth} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Whole Budget" active={!categoryId} onPress={() => setCategoryId(null)} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
        ))}
      </ScrollView>

      {isPending ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <>
          <Text style={[styles.total, { color: colors.text }]}>
            {formatMoney(total)}
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              {" "}
              net for {categoryName || "whole budget"}
            </Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart points={points} color={colors.accent} formatValue={formatMoney} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", gap: 6, marginBottom: 18, paddingBottom: 4 },
  total: { fontSize: 20, fontWeight: "800", marginBottom: 12 },
  totalLabel: { fontSize: 13, fontWeight: "600" },
});
