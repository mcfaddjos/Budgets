import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const TABS = [
  { key: "accounts", label: "Accounts" },
  { key: "transactions", label: "Transactions" },
  { key: "budgets", label: "Budgets" },
];

export default function TabBar({ active, onChange }) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => (
        <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
          <Text style={[styles.label, active === tab.key && styles.labelActive]}>{tab.label}</Text>
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
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  label: { fontSize: 13, color: "#999", fontWeight: "600" },
  labelActive: { color: "#1a6ed8" },
});
