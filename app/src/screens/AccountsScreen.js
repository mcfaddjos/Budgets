import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAccounts, useCreateAccount, useDeleteAccount } from "../data/queries";

const ACCOUNT_TYPES = ["credit", "checking", "savings"];

export default function AccountsScreen() {
  const { data: accounts = [], isPending, isFetching, refetch } = useAccounts();
  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState("credit"); // primary spending source per PRD §1
  const [deletingId, setDeletingId] = useState(null);

  async function handleAddAccount() {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the account a name, e.g. \"Amex Gold\".");
      return;
    }
    try {
      await createAccount.mutateAsync({ name: name.trim(), type, institution: institution.trim() || null });
      setName("");
      setInstitution("");
      setType("credit");
      setShowForm(false);
    } catch (err) {
      Alert.alert("Couldn't add account", err.message);
    }
  }

  function handleDelete(account) {
    Alert.alert(
      "Delete account?",
      `"${account.name}" and all of its transactions will be permanently deleted. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(account.id);
            try {
              await deleteAccount.mutateAsync(account.id);
            } catch (err) {
              Alert.alert("Couldn't delete account", err.message);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {isPending ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading accounts…</Text>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No accounts yet. Add your first account below.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={styles.cardHeaderRight}>
                  <Text style={styles.badge}>{item.type}</Text>
                  <TouchableOpacity onPress={() => handleDelete(item)} disabled={deletingId === item.id}>
                    <Text style={styles.deleteText}>{deletingId === item.id ? "…" : "Delete"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {item.institution ? <Text style={styles.cardSubtitle}>{item.institution}</Text> : null}
            </View>
          )}
        />
      )}

      {showForm ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Account name (e.g. Amex Gold)"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Institution (optional)"
            value={institution}
            onChangeText={setInstitution}
          />
          <View style={styles.typeRow}>
            {ACCOUNT_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeButton, type === t && styles.typeButtonActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeButtonText, type === t && styles.typeButtonTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowForm(false)}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleAddAccount}>
              <Text style={styles.primaryButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Text style={styles.addButtonText}>+ Add Account</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f7f8" },
  list: { padding: 16, paddingBottom: 8 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  cardSubtitle: { color: "#888", marginTop: 2 },
  deleteText: { color: "#c0392b", fontSize: 13, fontWeight: "600" },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  loadingText: { color: "#888", fontSize: 13 },
  badge: {
    fontSize: 12,
    color: "#1a6ed8",
    backgroundColor: "#eaf2fd",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: "hidden",
    textTransform: "uppercase",
  },
  addButton: {
    margin: 16,
    marginTop: 8,
    backgroundColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  form: { margin: 16, marginTop: 0, backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  typeButtonActive: { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" },
  typeButtonText: { color: "#333", textTransform: "capitalize" },
  typeButtonTextActive: { color: "#fff" },
  formActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  primaryButton: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#666" },
});
