import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useThemedStyles, useTheme } from "../theme/ThemeContext";
import { dark } from "../theme/palette";
import appConfig from "../../app.json";

function notBuiltYet(feature) {
  Alert.alert("Not built yet", `${feature} isn't wired up yet — this is a placeholder for where it'll live.`);
}

export default function SettingsScreen({ onClose }) {
  const { user, memberships, activeHouseholdId, serverUrl, logout } = useAuth();
  const { scheme, setScheme } = useTheme();
  const s = useThemedStyles(styles, darkStyles);

  const role = memberships.find((m) => m.householdId === activeHouseholdId)?.role;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={s.closeText}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          <Text style={s.rowPrimary}>{user?.name || "—"}</Text>
          <Text style={s.rowSecondary}>{user?.email}</Text>
          <TouchableOpacity style={s.dangerButton} onPress={logout}>
            <Text style={s.dangerButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>This household</Text>
          <Text style={s.rowSecondary}>
            {role === "OWNER" ? "You created this household (Owner)." : "You're a member of this household."}
          </Text>
          <Text style={s.hint}>Invites and member access are managed on the Household tab.</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Appearance</Text>
          <View style={s.modeRow}>
            <TouchableOpacity
              style={[s.modeButton, scheme === "light" && s.modeButtonActive]}
              onPress={() => setScheme("light")}
            >
              <Text style={[s.modeButtonText, scheme === "light" && s.modeButtonTextActive]}>Light</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeButton, scheme === "dark" && s.modeButtonActive]}
              onPress={() => setScheme("dark")}
            >
              <Text style={[s.modeButtonText, scheme === "dark" && s.modeButtonTextActive]}>Dark</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Feedback</Text>
          <TouchableOpacity style={s.button} onPress={() => notBuiltYet("Sending feedback")}>
            <Text style={s.buttonText}>Send Feedback</Text>
          </TouchableOpacity>
          <Text style={s.hint}>Not wired up yet — tapping it just tells you that, for now.</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>App info</Text>
          <Text style={s.rowSecondary}>Version {appConfig.expo.version}</Text>
          <Text style={s.rowSecondary} numberOfLines={1}>
            Connected to: {serverUrl?.replace(/^https?:\/\//, "").replace(/\/api$/, "") || "—"}
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <Text style={s.hint}>
            Your household's data is end-to-end encrypted — it's decrypted only on your own devices, using a key
            the server never has access to.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  closeText: { fontSize: 15, color: "#1a6ed8", fontWeight: "600" },
  scroll: { padding: 16, paddingBottom: 40 },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: 10 },
  rowPrimary: { fontSize: 16, fontWeight: "600", color: "#1a1a1a" },
  rowSecondary: { fontSize: 14, color: "#555", marginTop: 2 },
  hint: { fontSize: 12, color: "#999", marginTop: 8, lineHeight: 17 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  modeButtonActive: { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" },
  modeButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  modeButtonTextActive: { color: "#fff" },
  button: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  dangerButton: { marginTop: 14, alignSelf: "flex-start" },
  dangerButtonText: { color: "#c0392b", fontWeight: "600", fontSize: 14 },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
  header: { backgroundColor: dark.card, borderBottomColor: dark.border },
  headerTitle: { color: dark.text },
  closeText: { color: dark.accent },
  section: { backgroundColor: dark.card },
  sectionTitle: { color: dark.textMuted },
  rowPrimary: { color: dark.text },
  rowSecondary: { color: dark.textMuted },
  hint: { color: dark.textFaint },
  modeButton: { borderColor: dark.border },
  modeButtonActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  modeButtonText: { color: dark.text },
  button: { backgroundColor: dark.accent },
  dangerButtonText: { color: dark.danger },
};
