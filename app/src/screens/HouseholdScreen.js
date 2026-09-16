import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { seedSeptemberDemoData } from "../data/devSeed";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

const INVITE_EXPIRES_IN_DAYS = 7;

/**
 * Fills a gap the new invite model creates that the old app never had:
 * the appscript backend used one global INVITE_CODE, so there was nothing
 * to manage in the UI. Household-scoped, one-time invites (§5b) plus the
 * DEK access-grant handshake (§10a) both need somewhere for an existing
 * member to actually act from.
 */
export default function HouseholdScreen() {
  const { user, activeHouseholdId, isHouseholdOwner, createInvite, listPendingKeyGrants, grantAccessTo } = useAuth();
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [invite, setInvite] = useState(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [grantingUserId, setGrantingUserId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const queryClient = useQueryClient();
  const s = useThemedStyles(styles, darkStyles);

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

  async function handleGrant(member) {
    setGrantingUserId(member.userId);
    try {
      await grantAccessTo(activeHouseholdId, member.userId, member.publicKey);
      setPending((prev) => prev.filter((m) => m.userId !== member.userId));
    } catch (err) {
      Alert.alert("Couldn't grant access", err.message);
    } finally {
      setGrantingUserId(null);
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

  return (
    <View style={s.container}>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Signed in as</Text>
        <Text style={s.identity}>{user?.name || user?.email}</Text>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Invite someone</Text>
        {invite ? (
          <View style={s.inviteBox}>
            <Text style={s.inviteCode} selectable>
              {invite.code}
            </Text>
            <Text style={s.inviteHint}>Valid {INVITE_EXPIRES_IN_DAYS} days, one-time use. Long-press to copy.</Text>
          </View>
        ) : null}
        <TouchableOpacity style={s.button} onPress={handleCreateInvite} disabled={creatingInvite}>
          <Text style={s.buttonText}>{creatingInvite ? "Creating…" : "Create Invite Code"}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Waiting for access</Text>
        <Text style={s.sectionHint}>
          Someone who joined with an invite can't decrypt anything until you grant them access from here — see PRD
          §10a.
        </Text>
        {loadingPending ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : (
          <FlatList
            data={pending}
            keyExtractor={(item) => item.userId}
            ListEmptyComponent={<Text style={s.empty}>Nobody waiting right now.</Text>}
            renderItem={({ item }) => (
              <View style={s.pendingRow}>
                <Text style={s.pendingName}>{item.name || item.email}</Text>
                <TouchableOpacity
                  style={s.grantButton}
                  onPress={() => handleGrant(item)}
                  disabled={grantingUserId === item.userId}
                >
                  <Text style={s.grantButtonText}>
                    {grantingUserId === item.userId ? "Granting…" : "Grant access"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>

      {__DEV__ || isHouseholdOwner ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Admin tools</Text>
          <Text style={s.sectionHint}>
            Only visible to this household's owner. Seeds this household with the real category names and
            confidently-parseable transactions from the September spreadsheet.
          </Text>
          <TouchableOpacity style={s.button} onPress={handleSeedDemoData} disabled={seeding}>
            <Text style={s.buttonText}>{seeding ? "Seeding…" : "Seed September Demo Data"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8", padding: 16 },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: 8 },
  sectionHint: { fontSize: 12, color: "#999", marginBottom: 4, lineHeight: 17 },
  identity: { fontSize: 16, fontWeight: "600" },
  inviteBox: { backgroundColor: "#f2f2f2", borderRadius: 8, padding: 12, marginBottom: 12 },
  inviteCode: { fontFamily: "monospace", fontSize: 16, textAlign: "center", letterSpacing: 1 },
  inviteHint: { fontSize: 11, color: "#999", textAlign: "center", marginTop: 6 },
  button: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  empty: { color: "#888", fontSize: 13, marginTop: 8 },
  pendingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  pendingName: { fontSize: 14, fontWeight: "500" },
  grantButton: { backgroundColor: "#1a1a1a", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  grantButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
  section: { backgroundColor: dark.card },
  sectionTitle: { color: dark.textMuted },
  sectionHint: { color: dark.textFaint },
  identity: { color: dark.text },
  inviteBox: { backgroundColor: dark.bgAlt },
  inviteCode: { color: dark.text },
  inviteHint: { color: dark.textFaint },
  button: { backgroundColor: dark.accent },
  empty: { color: dark.textMuted },
  pendingRow: { borderBottomColor: dark.border },
  pendingName: { color: dark.text },
  grantButton: { backgroundColor: dark.accent },
};
