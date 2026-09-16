import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../theme/ThemeContext";

/** Shared compact pill button for every report picker/filter — one place to tune size instead of each report re-styling its own. */
export default function Chip({ label, active, onPress }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { borderColor: colors.border, backgroundColor: colors.chipBg },
        active && { backgroundColor: colors.accent, borderColor: colors.accent },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.text, { color: active ? "#fff" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontSize: 12, fontWeight: "600" },
});
