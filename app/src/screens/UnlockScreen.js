import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";

/**
 * §10c: unlocking is automatic now (this device's own stored secret, no
 * typing) — AuthContext already attempts it once on cold start, before
 * this screen could even render. So by the time this screen shows at all,
 * that attempt already failed (unlockError is set) — this is an error/
 * retry screen, not an entry form.
 */
export default function UnlockScreen() {
  const { user, unlockError, unlockVault, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState(null);

  async function handleRetry() {
    setRetryError(null);
    setBusy(true);
    try {
      await unlockVault();
    } catch (err) {
      setRetryError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome back{user?.name ? `, ${user.name}` : ""}</Text>
        {busy ? (
          <ActivityIndicator size="large" color="#1a6ed8" style={styles.spinner} />
        ) : (
          <Text style={styles.error}>{retryError || unlockError}</Text>
        )}

        <TouchableOpacity style={styles.button} onPress={handleRetry} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Unlocking…" : "Try again"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={logout}>
          <Text style={styles.linkText}>Not you? Log out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  spinner: { marginVertical: 16 },
  error: { color: "#c0392b", textAlign: "center", fontSize: 14, lineHeight: 20 },
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
