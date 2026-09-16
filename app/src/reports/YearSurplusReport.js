import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMonthlyBudgetSummaries } from "../data/queries";
import { useTheme } from "../theme/ThemeContext";
import { monthsOfYearSoFar, monthLabel } from "./months";

const CHART_HALF_HEIGHT = 70;

function formatMoney(amount) {
  const sign = amount < 0 ? "-" : amount > 0 ? "+" : "";
  return `${sign}$${Math.abs(amount).toFixed(0)}`;
}

/**
 * Diverging bars (surplus above a zero baseline, deficit below) — a
 * different shape than the simple 0-to-max Bar every other report uses,
 * since "how far above or below zero" is the whole point here. Built with
 * plain Views (height/position from the baseline), not a charting
 * library — see PRD §8.8 on that tradeoff.
 */
export default function YearSurplusReport() {
  const months = useMemo(() => monthsOfYearSoFar(), []);
  const results = useMonthlyBudgetSummaries(months);
  const { colors } = useTheme();

  const isPending = results.some((r) => r.isPending);
  const monthly = results.map((r, i) => {
    const totals = r.data?.totals ?? { budget: 0, actual: 0 };
    return { month: months[i], surplus: totals.budget - totals.actual };
  });

  const ytdTotal = monthly.reduce((sum, m) => sum + m.surplus, 0);
  const maxAbs = Math.max(...monthly.map((m) => Math.abs(m.surplus)), 1);

  return (
    <View>
      <View style={styles.hero}>
        <Text style={[styles.heroValue, { color: ytdTotal >= 0 ? colors.success : colors.danger }]}>
          {formatMoney(ytdTotal)}
        </Text>
        <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
          Year-to-date {ytdTotal >= 0 ? "surplus" : "deficit"} ({months[0].slice(0, 4)})
        </Text>
      </View>

      {isPending ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chart}>
            <View style={[styles.baseline, { top: CHART_HALF_HEIGHT, backgroundColor: colors.border }]} />
            {monthly.map((m) => {
              const barHeight = (Math.abs(m.surplus) / maxAbs) * CHART_HALF_HEIGHT;
              const isSurplus = m.surplus >= 0;
              return (
                <View key={m.month} style={styles.column}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: isSurplus ? colors.success : colors.danger,
                          top: isSurplus ? CHART_HALF_HEIGHT - barHeight : CHART_HALF_HEIGHT,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.columnLabel, { color: colors.textMuted }]}>{monthLabel(m.month)}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginBottom: 24 },
  heroValue: { fontSize: 32, fontWeight: "800" },
  heroLabel: { fontSize: 13, marginTop: 4 },
  chart: { flexDirection: "row", height: CHART_HALF_HEIGHT * 2 + 24, paddingHorizontal: 8 },
  baseline: { position: "absolute", left: 0, right: 0, height: 1 },
  column: { width: 40, alignItems: "center" },
  barTrack: { width: 18, height: CHART_HALF_HEIGHT * 2 },
  bar: { position: "absolute", width: 18, borderRadius: 4 },
  columnLabel: { fontSize: 11, marginTop: 6 },
});
