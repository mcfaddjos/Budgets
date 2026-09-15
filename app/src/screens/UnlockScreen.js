import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";

/**
 * Shown when there's a valid backend session but the vault isn't unlocked
 * — the private key is only ever held in memory (§10a), so it's gone
 * after any app restart even though the login itself is still valid.
 */
export default function UnlockScreen() {
  const { user, unlockVault, logout } = useAuth();
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    setError(null);
    setBusy(true);
    try {
      await unlockVault(vaultPassphrase);
    } catch (err) {
      setError("Wrong passphrase — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome back{user?.name ? `, ${user.name}` : ""}</Text>
        <Text style={styles.subtitle}>Enter your vault passphrase to unlock your household's data.</Text>

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={vaultPassphrase}
            onChangeText={setVaultPassphrase}
            placeholder="Vault passphrase"
            secureTextEntry={!showPassphrase}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          <TouchableOpacity style={styles.showButton} onPress={() => setShowPassphrase((v) => !v)}>
            <Text style={styles.showButtonText}>{showPassphrase ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleUnlock} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Unlocking…" : "Unlock"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={logout}>
          <Text style={styles.linkText}>Not you? Log out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8, marginBottom: 28 },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  passwordInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  showButton: { paddingHorizontal: 10, paddingVertical: 10 },
  showButtonText: { color: "#1a6ed8", fontWeight: "600", fontSize: 13 },
  error: { color: "#c0392b", marginTop: 16, textAlign: "center" },
  button: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 24,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 20, alignItems: "center" },
  linkText: { color: "#1a6ed8", fontSize: 14 },
});
