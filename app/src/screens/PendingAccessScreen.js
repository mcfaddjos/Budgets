import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

/**
 * Shown after joining via invite (§10a): the account exists and is
 * Google-authenticated, but nobody can seal the household DEK to this
 * device's public key until it exists — an existing member has to
 * complete that from their own device. There's nothing to poll
 * automatically in the background (no push infrastructure yet), so this
 * is a manual "check now" rather than silent polling.
 */
export default function PendingAccessScreen() {
  const { refreshMemberships, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const s = useThemedStyles(styles, darkStyles);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    try {
      await refreshMemberships();
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={s.container}>
      <ActivityIndicator size="large" />
      <Text style={s.title}>Waiting for access</Text>
      <Text style={s.subtitle}>
        You're signed in, but another household member still needs to let you in from their own device — this is a
        one-time step. Ask them to open the app and grant your access.
      </Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <TouchableOpacity style={s.button} onPress={handleCheck} disabled={checking}>
        <Text style={s.buttonText}>{checking ? "Checking…" : "Check now"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.linkButton} onPress={logout}>
        <Text style={s.linkText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", padding: 32 },
  title: { fontSize: 20, fontWeight: "700", marginTop: 20, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 10, lineHeight: 20 },
  error: { color: "#c0392b", marginTop: 16, textAlign: "center" },
  button: {
    backgroundColor: "#1a6ed8",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 28,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 20 },
  linkText: { color: "#999", fontSize: 14 },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
  title: { color: dark.text },
  subtitle: { color: dark.textMuted },
  error: { color: dark.danger },
  button: { backgroundColor: dark.accent },
  linkText: { color: dark.textFaint },
};
