import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";

const HEIGHT = 160;
const PADDING = 10;

/**
 * A real connected line (react-native-svg Polyline), not a bar-per-point
 * substitute — points is [{ x: label, y: number }], x rendered as sparse
 * axis labels (every `labelEvery`th point) to avoid crowding a month's
 * worth of days. Draws a zero baseline since day-to-day net spend can go
 * negative (a refund day).
 */
export default function LineChart({ points, color, labelEvery = 5, formatValue = (v) => v.toFixed(0) }) {
  const { colors } = useTheme();
  const width = Math.max(points.length * 14, 260);

  const values = points.map((p) => p.y);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const plotHeight = HEIGHT - PADDING * 2;
  const stepX = points.length > 1 ? (width - PADDING * 2) / (points.length - 1) : 0;
  const yFor = (v) => PADDING + plotHeight - ((v - minVal) / range) * plotHeight;
  const zeroY = yFor(0);

  const coords = points.map((p, i) => ({ x: PADDING + i * stepX, y: yFor(p.y) }));
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <View>
      <Svg width={width} height={HEIGHT}>
        <Line x1={PADDING} y1={zeroY} x2={width - PADDING} y2={zeroY} stroke={colors.border} strokeWidth={1} />
        <Polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={2.5} fill={color} />
        ))}
      </Svg>
      <View style={[styles.labelRow, { width }]}>
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <Text key={i} style={[styles.label, { color: colors.textFaint, left: PADDING + i * stepX - 10 }]}>
              {p.x}
            </Text>
          ) : null
        )}
      </View>
      <Text style={[styles.rangeHint, { color: colors.textMuted }]}>
        {formatValue(minVal)} to {formatValue(maxVal)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { height: 16, position: "relative" },
  label: { position: "absolute", fontSize: 10, width: 20, textAlign: "center" },
  rangeHint: { fontSize: 11, marginTop: 4 },
});
