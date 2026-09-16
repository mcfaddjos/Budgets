import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

/** Resolves true (use defaults) / false (start empty) — never rejects, "Add My Own" is a legitimate choice, not a cancellation. */
function askUseDefaultCategories() {
  return new Promise((resolve) => {
    Alert.alert(
      "Categories",
      "Start with a default category set, or add your own from scratch?",
      [
        { text: "Add My Own", style: "cancel", onPress: () => resolve(false) },
        { text: "Use Defaults", onPress: () => resolve(true) },
      ]
    );
  });
}

export default function LoginScreen() {
  const { login, registerNewHousehold, joinHousehold } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'create' | 'join'
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = useThemedStyles(styles, darkStyles);

  async function handleSubmit() {
    setError(null);

    if (mode === "join" && !inviteCode.trim()) {
      setError("Enter the invite code.");
      return;
    }

    setBusy(true);
    try {
      let result;
      if (mode === "login") result = await login();
      else if (mode === "create") {
        const useDefaults = await askUseDefaultCategories();
        result = await registerNewHousehold(useDefaults);
      } else result = await joinHousehold(inviteCode.trim());

      if (result === false) {
        // Google sign-in sheet was cancelled — not an error, just stop.
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Budgets</Text>
        <Text style={s.subtitle}>Credit card spend, categorized and budgeted.</Text>

        <View style={s.modeRow}>
          <TouchableOpacity
            style={[s.modeButton, mode === "login" && s.modeButtonActive]}
            onPress={() => setMode("login")}
          >
            <Text style={[s.modeButtonText, mode === "login" && s.modeButtonTextActive]}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeButton, mode === "create" && s.modeButtonActive]}
            onPress={() => setMode("create")}
          >
            <Text style={[s.modeButtonText, mode === "create" && s.modeButtonTextActive]}>New household</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeButton, mode === "join" && s.modeButtonActive]}
            onPress={() => setMode("join")}
          >
            <Text style={[s.modeButtonText, mode === "join" && s.modeButtonTextActive]}>Join with invite</Text>
          </TouchableOpacity>
        </View>

        {mode === "join" ? (
          <>
            <Text style={s.label}>Invite Code</Text>
            <TextInput
              style={s.input}
              value={inviteCode}
              onChangeText={(text) => {
                setInviteCode(text);
                setError(null);
              }}
              placeholder="Ask whoever set this up"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : null}

        <Text style={s.helpText}>
          {mode === "login"
            ? "Unlocks automatically using this device — no passphrase needed."
            : mode === "create"
              ? "Your household's data is end-to-end encrypted using a key generated and stored securely on this device — no passphrase to invent or remember."
              : "Your access is set up automatically using a key generated and stored securely on this device — no passphrase to invent or remember."}
        </Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={s.button} onPress={handleSubmit} disabled={busy}>
          <Text style={s.buttonText}>{busy ? "Please wait…" : "Continue with Google"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 28 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
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
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 6, marginTop: 14 },
  helpText: { fontSize: 12, color: "#888", marginTop: 14, marginBottom: 8, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: "#c0392b", marginTop: 16, textAlign: "center" },
  button: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 24,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

const darkStyles = {
  container: { backgroundColor: dark.bg },
  title: { color: dark.text },
  subtitle: { color: dark.textMuted },
  modeButton: { borderColor: dark.border },
  modeButtonActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  modeButtonText: { color: dark.text },
  label: { color: dark.text },
  helpText: { color: dark.textFaint },
  input: { borderColor: dark.border, color: dark.text, backgroundColor: dark.card },
  error: { color: dark.danger },
  button: { backgroundColor: dark.accent },
};
