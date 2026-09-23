import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

const POLL_INTERVAL_MS = 3000;

/**
 * §10c/§10d: unlocking is automatic now (this device's own stored secret,
 * no typing) — AuthContext already attempts it once on cold start, before
 * this screen could even render. Two distinct reasons this screen shows
 * at all, told apart via deviceNeedsSetup:
 *   - This device has never been added to this account (deviceNeedsSetup)
 *     — nothing to retry; route straight to recovery-code or device-
 *     pairing.
 *   - This device HAS key material but decrypting it still failed (a real
 *     anomaly) — "Try again" is meaningful here, recovery code is the
 *     fallback.
 */
export default function UnlockScreen() {
  const { user, unlockError, deviceNeedsSetup, unlockVault, recoverAccess, joinViaPairingCode, checkDeviceAccess, logout } =
    useAuth();
  const [mode, setMode] = useState("default"); // "default" | "recovering" | "pairing" | "pairingWaiting"
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryError, setRecoveryError] = useState(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState(null);
  const { colors } = useTheme();
  const s = useThemedStyles(styles, darkStyles);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

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

  async function handleRecover() {
    if (!recoveryCode.trim()) return;
    setRecoveryError(null);
    setBusy(true);
    try {
      await recoverAccess(recoveryCode.trim());
    } catch (err) {
      setRecoveryError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinPairing() {
    if (!pairingCode.trim()) return;
    setPairingError(null);
    setBusy(true);
    try {
      await joinViaPairingCode(pairingCode.trim());
      setMode("pairingWaiting");
      pollRef.current = setInterval(async () => {
        try {
          const ready = await checkDeviceAccess();
          if (ready) clearInterval(pollRef.current);
        } catch {
          // a transient network blip while waiting is not worth surfacing —
          // the interval just tries again next tick.
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setPairingError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "recovering") {
    return (
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.content}>
          <Text style={s.title}>Enter your recovery code</Text>
          <Text style={s.helpText}>
            This is the code you were shown once when this household's access was first set up — on this device or
            another one.
          </Text>

          <TextInput
            style={s.input}
            value={recoveryCode}
            onChangeText={(text) => {
              setRecoveryCode(text);
              setRecoveryError(null);
            }}
            placeholder="Recovery code"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />

          {recoveryError ? <Text style={s.error}>{recoveryError}</Text> : null}

          <TouchableOpacity style={s.button} onPress={handleRecover} disabled={busy || !recoveryCode.trim()}>
            <Text style={s.buttonText}>{busy ? "Recovering…" : "Recover access"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.linkButton} onPress={() => setMode("default")} disabled={busy}>
            <Text style={s.linkText}>Back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (mode === "pairing") {
    return (
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.content}>
          <Text style={s.title}>Enter the pairing code</Text>
          <Text style={s.helpText}>
            On your other, already-unlocked device: Settings → Add a device. Type or paste the code it shows here.
          </Text>

          <TextInput
            style={[s.input, s.pairingInput]}
            value={pairingCode}
            onChangeText={(text) => {
              setPairingCode(text.toUpperCase());
              setPairingError(null);
            }}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            editable={!busy}
          />

          {pairingError ? <Text style={s.error}>{pairingError}</Text> : null}

          <TouchableOpacity style={s.button} onPress={handleJoinPairing} disabled={busy || !pairingCode.trim()}>
            <Text style={s.buttonText}>{busy ? "Submitting…" : "Continue"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.linkButton} onPress={() => setMode("default")} disabled={busy}>
            <Text style={s.linkText}>Back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (mode === "pairingWaiting") {
    return (
      <View style={s.container}>
        <View style={s.content}>
          <Text style={s.title}>Waiting for the other device</Text>
          <ActivityIndicator size="large" color={colors.accent} style={s.spinner} />
          <Text style={s.helpText}>
            On your other device, keep the pairing screen open until it grants this device access — this updates
            automatically once it does.
          </Text>

          <TouchableOpacity style={s.linkButton} onPress={() => setMode("default")}>
            <Text style={s.linkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.content}>
        <Text style={s.title}>Welcome back{user?.name ? `, ${user.name}` : ""}</Text>

        {deviceNeedsSetup ? (
          <Text style={s.helpText}>This device hasn't been added to your account yet.</Text>
        ) : busy ? (
          <ActivityIndicator size="large" color={colors.accent} style={s.spinner} />
        ) : (
          <Text style={s.error}>{retryError || unlockError}</Text>
        )}

        {deviceNeedsSetup ? null : (
          <TouchableOpacity style={s.button} onPress={handleRetry} disabled={busy}>
            <Text style={s.buttonText}>{busy ? "Unlocking…" : "Try again"}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={deviceNeedsSetup ? s.button : s.linkButton}
          onPress={() => setMode("pairing")}
          disabled={busy}
        >
          <Text style={deviceNeedsSetup ? s.buttonText : s.linkText}>Pair with another device</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.linkButton} onPress={() => setMode("recovering")} disabled={busy}>
          <Text style={s.linkText}>Use recovery code instead</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.linkButton} onPress={logout}>
          <Text style={s.linkText}>Not you? Log out</Text>
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
  helpText: { fontSize: 13, color: "#888", textAlign: "center", lineHeight: 18, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  pairingInput: {
    fontFamily: "monospace",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 4,
    textAlign: "center",
  },
  error: { color: "#c0392b", textAlign: "center", fontSize: 14, lineHeight: 20, marginTop: 14 },
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

const darkStyles = {
  container: { backgroundColor: dark.bg },
  title: { color: dark.text },
  helpText: { color: dark.textMuted },
  input: { borderColor: dark.border, color: dark.text, backgroundColor: dark.card },
  error: { color: dark.danger },
  button: { backgroundColor: dark.accent },
  linkText: { color: dark.accent },
};
