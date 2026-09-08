import { useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import AccountsScreen from "./src/screens/AccountsScreen";
import TransactionsScreen from "./src/screens/TransactionsScreen";
import BudgetsScreen from "./src/screens/BudgetsScreen";
import TabBar from "./src/components/TabBar";

const SCREENS = {
  accounts: AccountsScreen,
  transactions: TransactionsScreen,
  budgets: BudgetsScreen,
};

function MainApp() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("accounts");
  const Screen = SCREENS[tab];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.greeting}>Hi, {user.username}</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.screen}>
        <Screen />
      </View>
      <TabBar active={tab} onChange={setTab} />
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
    <AuthProvider>
      <StatusBar barStyle="dark-content" />
      <Root />
    </AuthProvider>
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
  logout: { fontSize: 14, color: "#c0392b" },
});
