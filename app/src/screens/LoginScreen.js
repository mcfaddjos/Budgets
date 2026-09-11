import { useEffect, useState } from "react";
import {
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
import { onStatus } from "../api/client";
import DebugLogsModal from "../components/DebugLogsModal";

export default function LoginScreen() {
  const { serverUrl, updateServerUrl, login, register } = useAuth();
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [logsVisible, setLogsVisible] = useState(false);

  useEffect(() => onStatus(setStatus), []);

  async function handleSubmit() {
    setError(null);
    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }
    if (mode === "register" && !inviteCode.trim()) {
      setError("Enter the invite code.");
      return;
    }
    setBusy(true);
    try {
      await updateServerUrl(serverUrlInput.trim());
      if (mode === "login") await login(username.trim(), password);
      else await register(username.trim(), password, inviteCode.trim());
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

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrlInput}
          onChangeText={setServerUrlInput}
          placeholder="https://script.google.com/macros/s/.../exec"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.showButton} onPress={() => setShowPassword((v) => !v)}>
            <Text style={styles.showButtonText}>{showPassword ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        </View>

        {mode === "register" ? (
          <>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Ask whoever set this up"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : null}

        {status ? <Text style={styles.status}>{status}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={busy}>
          <Text style={styles.buttonText}>
            {busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => setMode(mode === "login" ? "register" : "login")}
        >
          <Text style={styles.linkText}>
            {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => setLogsVisible(true)}>
          <Text style={styles.diagnosticsText}>View recent errors</Text>
        </TouchableOpacity>
      </ScrollView>

      <DebugLogsModal visible={logsVisible} onClose={() => setLogsVisible(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 32 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 6, marginTop: 14 },
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
  status: { color: "#888", marginTop: 12, textAlign: "center", fontSize: 13 },
  error: { color: "#c0392b", marginTop: 12, textAlign: "center" },
  button: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 24,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#1a6ed8", fontSize: 14 },
  diagnosticsText: { color: "#999", fontSize: 12 },
});
