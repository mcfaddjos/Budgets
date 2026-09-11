import { useState } from "react";
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import AccountsScreen from "./src/screens/AccountsScreen";
import TransactionsScreen from "./src/screens/TransactionsScreen";
import BudgetsScreen from "./src/screens/BudgetsScreen";
import TabBar from "./src/components/TabBar";
import DebugLogsModal from "./src/components/DebugLogsModal";

const SCREENS = {
  accounts: AccountsScreen,
  transactions: TransactionsScreen,
  budgets: BudgetsScreen,
};

function MainApp() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("budgets");
  const [logsVisible, setLogsVisible] = useState(false);
  const Screen = SCREENS[tab];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.greeting}>Hi, {user.username}</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity onPress={() => setLogsVisible(true)}>
            <Text style={styles.diagnostics}>Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.screen}>
        <Screen />
      </View>
      <TabBar active={tab} onChange={setTab} />
      <DebugLogsModal visible={logsVisible} onClose={() => setLogsVisible(false)} />
    </SafeAreaView>
  );
}

function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <View style={styles.container} />;
  return user ? <MainApp /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar barStyle="dark-content" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  greeting: { fontSize: 15, fontWeight: "600" },
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  diagnostics: { fontSize: 14, color: "#999" },
  logout: { fontSize: 14, color: "#c0392b" },
});
