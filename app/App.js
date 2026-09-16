import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/theme/ThemeContext";
import { dark } from "./src/theme/palette";
import { queryClient, asyncStoragePersister } from "./src/data/queryClient";
import { usePrefetchHouseholdData } from "./src/data/queries";
import LoginScreen from "./src/screens/LoginScreen";
import UnlockScreen from "./src/screens/UnlockScreen";
import PendingAccessScreen from "./src/screens/PendingAccessScreen";
import AccountsScreen from "./src/screens/AccountsScreen";
import TransactionsScreen from "./src/screens/TransactionsScreen";
import BudgetsScreen from "./src/screens/BudgetsScreen";
import HouseholdScreen from "./src/screens/HouseholdScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import TabBar from "./src/components/TabBar";
import RecoveryCodeModal from "./src/components/RecoveryCodeModal";
import VersionFooter from "./src/components/VersionFooter";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const SCREENS = {
  accounts: AccountsScreen,
  transactions: TransactionsScreen,
  budgets: BudgetsScreen,
  household: HouseholdScreen,
};

function MainApp() {
  const { user } = useAuth();
  const [tab, setTab] = useState("budgets");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const s = useThemedStyles(styles, darkStyles);
  const Screen = SCREENS[tab];

  // §10b: warm the cache for every tab as soon as the household is
  // accessible, not just the one currently showing — switching tabs then
  // renders from cache instantly instead of waiting on each screen's own
  // first fetch.
  const prefetch = usePrefetchHouseholdData(currentMonth());
  useEffect(() => {
    prefetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <Text style={s.greeting}>Hi, {user.name || user.email || "there"}</Text>
        <TouchableOpacity onPress={() => setSettingsVisible(true)}>
          <Text style={s.gear}>⚙</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.screen}>
        <Screen />
      </View>
      <TabBar active={tab} onChange={setTab} />
      <RecoveryCodeModal />
      <Modal visible={settingsVisible} animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <SettingsScreen onClose={() => setSettingsVisible(false)} />
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Shown while AuthContext checks for an existing session — on the free
 * Render tier this can mean waiting out a cold-start wake (up to ~1
 * minute after 15 min idle), so this needs to say something rather than
 * sit blank the whole time.
 */
function LoadingScreen() {
  const [slow, setSlow] = useState(false);
  const { colors } = useTheme();
  const s = useThemedStyles(styles, darkStyles);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={s.loadingContainer}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={s.loadingText}>
        {slow ? "Waking up the server — this can take up to a minute…" : "Loading…"}
      </Text>
    </View>
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
  if (!ready) return <LoadingScreen />;
  if (!user) return <LoginScreen />;
  if (!unlocked) return <UnlockScreen />;
  if (!activeHouseholdId) return <PendingAccessScreen />;
  return <MainApp />;
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: asyncStoragePersister }}>
        <ThemeProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <Root />
            {/* Rendered once here, absolutely positioned, so it shows on every
                screen (auth screens included) without threading it through each one. */}
            <VersionFooter />
          </AuthProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  loadingContainer: { flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#888", fontSize: 13, paddingHorizontal: 32, textAlign: "center" },
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
  gear: { fontSize: 20, color: "#1a1a1a" },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
  loadingContainer: { backgroundColor: dark.bg },
  loadingText: { color: dark.textMuted },
  topBar: { backgroundColor: dark.card, borderBottomColor: dark.border },
  greeting: { color: dark.text },
  gear: { color: dark.text },
};
