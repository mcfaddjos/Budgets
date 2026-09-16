import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

const TABS = [
  { key: "accounts", label: "Accounts" },
  { key: "transactions", label: "Transactions" },
  { key: "budgets", label: "Budgets" },
  { key: "reports", label: "Reports" },
];

export default function TabBar({ active, onChange }) {
  const s = useThemedStyles(styles, darkStyles);
  return (
    <View style={s.container}>
      {TABS.map((tab) => (
        <TouchableOpacity key={tab.key} style={s.tab} onPress={() => onChange(tab.key)}>
          <Text style={[s.label, active === tab.key && s.labelActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingBottom: 10,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  label: { fontSize: 13, color: "#999", fontWeight: "600" },
  labelActive: { color: "#1a6ed8" },
});

const darkStyles = {
  container: { backgroundColor: dark.card, borderTopColor: dark.border },
  label: { color: dark.textFaint },
  labelActive: { color: dark.accent },
};
