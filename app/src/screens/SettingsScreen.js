import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useHouseholdSettings, useSetKeepReceiptImages } from "../data/queries";
import { useThemedStyles, useTheme } from "../theme/ThemeContext";
import { dark } from "../theme/palette";
import DevicePairingModal from "../components/DevicePairingModal";
import { seedSeptemberDemoData } from "../data/devSeed";
import appConfig from "../../app.json";

const INVITE_EXPIRES_IN_DAYS = 7;

function notBuiltYet(feature) {
  Alert.alert("Not built yet", `${feature} isn't wired up yet — this is a placeholder for where it'll live.`);
}

export default function SettingsScreen({ onClose }) {
  const {
    user,
    memberships,
    activeHouseholdId,
    isHouseholdOwner,
    serverUrl,
    logout,
    createInvite,
    listPendingKeyGrants,
    grantAccessTo,
  } = useAuth();
  const { scheme, setScheme } = useTheme();
  const s = useThemedStyles(styles, darkStyles);
  const queryClient = useQueryClient();
  const { data: householdSettings } = useHouseholdSettings();
  const setKeepReceiptImages = useSetKeepReceiptImages();

  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [invite, setInvite] = useState(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [grantingDeviceId, setGrantingDeviceId] = useState(null);
  const [pairingModalOpen, setPairingModalOpen] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const role = memberships.find((m) => m.householdId === activeHouseholdId)?.role;

  const loadPending = useCallback(async () => {
    try {
      setPending(await listPendingKeyGrants(activeHouseholdId));
    } catch (err) {
      Alert.alert("Couldn't load pending members", err.message);
    } finally {
      setLoadingPending(false);
    }
  }, [activeHouseholdId, listPendingKeyGrants]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function handleCreateInvite() {
    setCreatingInvite(true);
    try {
      const result = await createInvite(activeHouseholdId, INVITE_EXPIRES_IN_DAYS);
      setInvite(result);
    } catch (err) {
      Alert.alert("Couldn't create invite", err.message);
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleGrant(device) {
    setGrantingDeviceId(device.deviceId);
    try {
      await grantAccessTo(activeHouseholdId, device.deviceId, device.publicKey);
      setPending((prev) => prev.filter((d) => d.deviceId !== device.deviceId));
    } catch (err) {
      Alert.alert("Couldn't grant access", err.message);
    } finally {
      setGrantingDeviceId(null);
    }
  }

  async function handleSeedDemoData() {
    setSeeding(true);
    try {
      const result = await seedSeptemberDemoData(activeHouseholdId);
      await queryClient.invalidateQueries();
      Alert.alert(
        "Demo data seeded",
        `${result.categoriesCreated} categories, ${result.budgetsSet} budgets, ${result.transactionsCreated} transactions.` +
          (result.transactionsSkipped ? `\n\n${result.transactionsSkipped}` : "")
      );
    } catch (err) {
      Alert.alert("Couldn't seed demo data", err.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleToggleKeepReceiptImages(value) {
    try {
      await setKeepReceiptImages.mutateAsync(value);
    } catch (err) {
      Alert.alert("Couldn't update setting", err.message);
    }
  }

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
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Invite someone</Text>
          {invite ? (
            <View style={s.inviteBox}>
              <Text style={s.inviteCode} selectable>
                {invite.code}
              </Text>
              <Text style={s.hint}>Valid {INVITE_EXPIRES_IN_DAYS} days, one-time use. Long-press to copy.</Text>
            </View>
          ) : null}
          <TouchableOpacity style={s.button} onPress={handleCreateInvite} disabled={creatingInvite}>
            <Text style={s.buttonText}>{creatingInvite ? "Creating…" : "Create Invite Code"}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Waiting for access</Text>
          <Text style={s.hint}>
            A device — someone else's after redeeming an invite, or your own after device pairing (Settings → Add a
            device) — can't decrypt anything until you grant it access from here. See PRD §10a/§10d.
          </Text>
          {loadingPending ? (
            <ActivityIndicator style={{ marginTop: 12 }} />
          ) : (
            <FlatList
              data={pending}
              keyExtractor={(item) => item.deviceId}
              scrollEnabled={false}
              ListEmptyComponent={<Text style={s.rowSecondary}>Nobody waiting right now.</Text>}
              renderItem={({ item }) => (
                <View style={s.pendingRow}>
                  <Text style={s.rowPrimary}>
                    {item.name || item.email}
                    {item.deviceName ? ` (${item.deviceName})` : ""}
                  </Text>
                  <TouchableOpacity
                    style={s.grantButton}
                    onPress={() => handleGrant(item)}
                    disabled={grantingDeviceId === item.deviceId}
                  >
                    <Text style={s.grantButtonText}>
                      {grantingDeviceId === item.deviceId ? "Granting…" : "Grant access"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Devices</Text>
          <Text style={s.hint}>
            Add a new phone to your own account without needing a saved recovery code — this device (already
            unlocked) vouches for it directly.
          </Text>
          <TouchableOpacity style={s.button} onPress={() => setPairingModalOpen(true)}>
            <Text style={s.buttonText}>Add a device</Text>
          </TouchableOpacity>
        </View>

        {pairingModalOpen ? (
          <DevicePairingModal
            householdId={activeHouseholdId}
            onClose={() => {
              setPairingModalOpen(false);
              loadPending();
            }}
          />
        ) : null}

        {__DEV__ || isHouseholdOwner ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Admin tools</Text>
            <Text style={s.hint}>
              Only visible to this household's owner. Seeds this household with the real category names and
              confidently-parseable transactions from the September spreadsheet.
            </Text>
            <TouchableOpacity style={s.button} onPress={handleSeedDemoData} disabled={seeding}>
              <Text style={s.buttonText}>{seeding ? "Seeding…" : "Seed September Demo Data"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Receipts</Text>
          <View style={s.toggleRow}>
            <View style={s.toggleLabelBox}>
              <Text style={s.rowPrimary}>Keep receipt images</Text>
              <Text style={s.hint}>
                Saves the photo alongside each scanned transaction for tax records, household-wide. Off by default —
                without it, the photo is only used to fill in the transaction and then discarded.
              </Text>
            </View>
            <Switch
              value={!!householdSettings?.keepReceiptImages}
              onValueChange={handleToggleKeepReceiptImages}
              disabled={!householdSettings || setKeepReceiptImages.isPending}
            />
          </View>
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
  hint: { fontSize: 12, color: "#999", marginBottom: 8, lineHeight: 17 },
  inviteBox: { backgroundColor: "#f2f2f2", borderRadius: 8, padding: 12, marginBottom: 12 },
  inviteCode: { fontFamily: "monospace", fontSize: 16, textAlign: "center", letterSpacing: 1, marginBottom: 6 },
  pendingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  grantButton: { backgroundColor: "#1a1a1a", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  grantButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabelBox: { flex: 1 },
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
  inviteBox: { backgroundColor: dark.bgAlt },
  inviteCode: { color: dark.text },
  pendingRow: { borderBottomColor: dark.border },
  grantButton: { backgroundColor: dark.accent },
  modeButton: { borderColor: dark.border },
  modeButtonActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  modeButtonText: { color: dark.text },
  button: { backgroundColor: dark.accent },
  dangerButtonText: { color: dark.danger },
};
