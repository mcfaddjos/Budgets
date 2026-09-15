import { useState } from "react";
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import UnlockScreen from "./src/screens/UnlockScreen";
import PendingAccessScreen from "./src/screens/PendingAccessScreen";
import AccountsScreen from "./src/screens/AccountsScreen";
import TransactionsScreen from "./src/screens/TransactionsScreen";
import BudgetsScreen from "./src/screens/BudgetsScreen";
import HouseholdScreen from "./src/screens/HouseholdScreen";
import TabBar from "./src/components/TabBar";
import RecoveryCodeModal from "./src/components/RecoveryCodeModal";

const SCREENS = {
  accounts: AccountsScreen,
  transactions: TransactionsScreen,
  budgets: BudgetsScreen,
  household: HouseholdScreen,
};

function MainApp() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("budgets");
  const Screen = SCREENS[tab];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.greeting}>Hi, {user.name || user.email}</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.screen}>
        <Screen />
      </View>
      <TabBar active={tab} onChange={setTab} />
      <RecoveryCodeModal />
    </SafeAreaView>
  );
}

/**
 * Four distinct states, not two — see PRD §10a. `unlocked` and
 * `activeHouseholdId` are independent: joining via invite unlocks your
 * own identity (you have a private key) without unlocking any
 * household's data (nobody's sealed the DEK to you yet).
 */
function Root() {
  const { ready, user, unlocked, activeHouseholdId } = useAuth();
  if (!ready) return <View style={styles.container} />;
  if (!user) return <LoginScreen />;
  if (!unlocked) return <UnlockScreen />;
  if (!activeHouseholdId) return <PendingAccessScreen />;
  return <MainApp />;
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
  logout: { fontSize: 14, color: "#c0392b" },
});
