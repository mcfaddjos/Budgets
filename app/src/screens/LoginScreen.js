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
import MaskedPasswordInput from "../components/MaskedPasswordInput";

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

// __DEV__ is a React Native global — always false in a release/production
// build, so this relaxed length + prefilled value can never ship. Purely
// so re-testing the login flow repeatedly doesn't mean retyping a real
// passphrase every time.
const MIN_PASSPHRASE_LENGTH = __DEV__ ? 4 : 10;
const DEV_DEFAULT_PASSPHRASE = __DEV__ ? "1234" : "";

export default function LoginScreen() {
  const { login, registerNewHousehold, joinHousehold } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'create' | 'join'
  const [vaultPassphrase, setVaultPassphrase] = useState(DEV_DEFAULT_PASSPHRASE);
  const [confirmPassphrase, setConfirmPassphrase] = useState(DEV_DEFAULT_PASSPHRASE);
  const [inviteCode, setInviteCode] = useState("");
  // Now backed by MaskedPasswordInput's own overlay masking (not
  // secureTextEntry, which doesn't render on this device/RN combo — see
  // MaskedPasswordInput.js), so this can go back to the normal
  // secure-by-default behavior.
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (vaultPassphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(`Vault passphrase needs to be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    if (mode === "create" && vaultPassphrase !== confirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }
    if (mode === "join" && !inviteCode.trim()) {
      setError("Enter the invite code.");
      return;
    }

    setBusy(true);
    try {
      let result;
      if (mode === "login") result = await login(vaultPassphrase);
      else if (mode === "create") {
        const useDefaults = await askUseDefaultCategories();
        result = await registerNewHousehold(vaultPassphrase, useDefaults);
      } else result = await joinHousehold(inviteCode.trim(), vaultPassphrase);

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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Budgets</Text>
        <Text style={styles.subtitle}>Credit card spend, categorized and budgeted.</Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === "login" && styles.modeButtonActive]}
            onPress={() => setMode("login")}
          >
            <Text style={[styles.modeButtonText, mode === "login" && styles.modeButtonTextActive]}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "create" && styles.modeButtonActive]}
            onPress={() => setMode("create")}
          >
            <Text style={[styles.modeButtonText, mode === "create" && styles.modeButtonTextActive]}>
              New household
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "join" && styles.modeButtonActive]}
            onPress={() => setMode("join")}
          >
            <Text style={[styles.modeButtonText, mode === "join" && styles.modeButtonTextActive]}>
              Join with invite
            </Text>
          </TouchableOpacity>
        </View>

        {mode === "join" ? (
          <>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={styles.input}
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

        <Text style={styles.label}>Vault Passphrase</Text>
        <Text style={styles.helpText}>
          This is separate from your Google password — it's the only thing that can unlock your
          household's data, and we never send it anywhere.
          {mode === "create" ? " You'll also get a one-time recovery code after this — save it somewhere safe." : ""}
        </Text>
        <View style={styles.passwordRow}>
          <MaskedPasswordInput
            style={[styles.input, styles.passwordInput]}
            value={vaultPassphrase}
            onChangeText={(text) => {
              setVaultPassphrase(text);
              setError(null);
            }}
            hidden={!showPassphrase}
            placeholder="Vault passphrase"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
          />
          <TouchableOpacity style={styles.showButton} onPress={() => setShowPassphrase((v) => !v)}>
            <Text style={styles.showButtonText}>{showPassphrase ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        </View>

        {mode === "create" ? (
          <>
            <Text style={styles.label}>Confirm Passphrase</Text>
            <MaskedPasswordInput
              style={styles.input}
              value={confirmPassphrase}
              onChangeText={(text) => {
                setConfirmPassphrase(text);
                setError(null);
              }}
              hidden={!showPassphrase}
              placeholder="Confirm passphrase"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              textContentType="none"
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={busy}>
          <Text style={styles.buttonText}>
            {busy ? "Please wait…" : "Continue with Google"}
          </Text>
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
  helpText: { fontSize: 12, color: "#888", marginBottom: 8, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  passwordInput: { flex: 1 },
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
});
