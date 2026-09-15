import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";

const INVITE_EXPIRES_IN_DAYS = 7;

/**
 * Fills a gap the new invite model creates that the old app never had:
 * the appscript backend used one global INVITE_CODE, so there was nothing
 * to manage in the UI. Household-scoped, one-time invites (§5b) plus the
 * DEK access-grant handshake (§10a) both need somewhere for an existing
 * member to actually act from.
 */
export default function HouseholdScreen() {
  const { user, activeHouseholdId, createInvite, listPendingKeyGrants, grantAccessTo } = useAuth();
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [invite, setInvite] = useState(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [grantingUserId, setGrantingUserId] = useState(null);

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

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Signed in as</Text>
        <Text style={styles.identity}>{user?.name || user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite someone</Text>
        {invite ? (
          <View style={styles.inviteBox}>
            <Text style={styles.inviteCode} selectable>
              {invite.code}
            </Text>
            <Text style={styles.inviteHint}>
              Valid {INVITE_EXPIRES_IN_DAYS} days, one-time use. Long-press to copy.
            </Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={handleCreateInvite} disabled={creatingInvite}>
          <Text style={styles.buttonText}>{creatingInvite ? "Creating…" : "Create Invite Code"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Waiting for access</Text>
        <Text style={styles.sectionHint}>
          Someone who joined with an invite can't decrypt anything until you grant them access from
          here — see PRD §10a.
        </Text>
        {loadingPending ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : (
          <FlatList
            data={pending}
            keyExtractor={(item) => item.userId}
            ListEmptyComponent={<Text style={styles.empty}>Nobody waiting right now.</Text>}
            renderItem={({ item }) => (
              <View style={styles.pendingRow}>
                <Text style={styles.pendingName}>{item.name || item.email}</Text>
                <TouchableOpacity
                  style={styles.grantButton}
                  onPress={() => handleGrant(item)}
                  disabled={grantingUserId === item.userId}
                >
                  <Text style={styles.grantButtonText}>
                    {grantingUserId === item.userId ? "Granting…" : "Grant access"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
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
