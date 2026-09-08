import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { api } from "../api/client";

const ACCOUNT_TYPES = ["credit", "checking", "savings"];

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState("credit");
  const [importingId, setImportingId] = useState(null);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.getAccounts());
    } catch (err) {
      Alert.alert("Couldn't load accounts", err.message);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  }

  async function handleAddAccount() {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the account a name, e.g. \"Amex Gold\".");
      return;
    }
    try {
      await api.createAccount({ name: name.trim(), type, institution: institution.trim() || null });
      setName("");
      setInstitution("");
      setType("credit");
      setShowForm(false);
      loadAccounts();
    } catch (err) {
      Alert.alert("Couldn't add account", err.message);
    }
  }

  async function handleImport(account) {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets?.[0];
    if (!file) return;

    setImportingId(account.id);
    try {
      const summary = await api.importStatement(account.id, file);
      Alert.alert(
        "Statement imported",
        `${summary.imported} new transaction(s), ${summary.duplicates} already imported, ${summary.uncategorized} uncategorized.`
      );
    } catch (err) {
      Alert.alert("Import failed", err.message);
    } finally {
      setImportingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No accounts yet. Add your first credit card below.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.badge}>{item.type}</Text>
            </View>
            {item.institution ? <Text style={styles.cardSubtitle}>{item.institution}</Text> : null}
            <TouchableOpacity
              style={styles.importButton}
              onPress={() => handleImport(item)}
              disabled={importingId === item.id}
            >
              <Text style={styles.importButtonText}>
                {importingId === item.id ? "Importing…" : "Import Statement (CSV)"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

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
  cardTitle: { fontSize: 17, fontWeight: "600" },
  cardSubtitle: { color: "#888", marginTop: 2 },
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
  importButton: {
    marginTop: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  importButtonText: { color: "#fff", fontWeight: "600" },
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
