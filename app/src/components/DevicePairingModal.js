import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

const POLL_INTERVAL_MS = 3000;

/**
 * Granting side of device pairing (§10d) — the primary way to add a
 * device going forward, since it needs no pre-saved secret. Shown from
 * Settings → Add a device. Generates a short-lived code, polls for the
 * joining device to submit its key material, verifies it locally before
 * ever wrapping the real DEK (see AuthContext's pollDevicePairing), and
 * closes itself once access has actually been granted.
 */
export default function DevicePairingModal({ householdId, onClose }) {
  const { startDevicePairing, pollDevicePairing } = useAuth();
  const [state, setState] = useState("starting"); // "starting" | "showing" | "granted" | "error"
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const s = useThemedStyles(styles, darkStyles);
  const pollRef = useRef(null);
  const pairingRef = useRef(null);

  useEffect(() => {
    start();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    clearInterval(pollRef.current);
    setState("starting");
    setError(null);
    try {
      const pairing = await startDevicePairing(householdId);
      pairingRef.current = pairing;
      setCode(pairing.code);
      setState("showing");
      pollRef.current = setInterval(async () => {
        try {
          const { ready } = await pollDevicePairing(householdId, pairing.pairingId, pairing.secret);
          if (ready) {
            clearInterval(pollRef.current);
            setState("granted");
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setError(err.message);
          setState("error");
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          {state === "starting" ? (
            <>
              <Text style={s.title}>Starting…</Text>
              <ActivityIndicator style={s.spinner} />
            </>
          ) : null}

          {state === "showing" ? (
            <>
              <Text style={s.title}>Enter this code on your new device</Text>
              <Text style={s.body}>
                On the new device, at its unlock screen, tap "Pair with another device" and enter this code. Keep this
                screen open until it connects.
              </Text>
              <View style={s.codeBox}>
                <Text style={s.code} selectable>
                  {code}
                </Text>
              </View>
              <Text style={s.hint}>Read it aloud or hand over the phone — expires in a few minutes.</Text>
              <ActivityIndicator style={s.spinner} />
              <Text style={s.waitingText}>Waiting for the new device…</Text>
            </>
          ) : null}

          {state === "granted" ? (
            <>
              <Text style={s.title}>Device added</Text>
              <Text style={s.body}>That device now has access to this household.</Text>
              <TouchableOpacity style={s.button} onPress={onClose}>
                <Text style={s.buttonText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {state === "error" ? (
            <>
              <Text style={s.title}>Something went wrong</Text>
              <Text style={s.body}>{error}</Text>
              <TouchableOpacity style={s.button} onPress={start}>
                <Text style={s.buttonText}>Start a new code</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {state !== "granted" ? (
            <TouchableOpacity style={s.linkButton} onPress={onClose}>
              <Text style={s.linkText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 22 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  body: { fontSize: 14, color: "#444", lineHeight: 20, marginBottom: 16, textAlign: "center" },
  codeBox: { backgroundColor: "#f2f2f2", borderRadius: 8, padding: 18, marginBottom: 6 },
  code: { fontFamily: "monospace", fontSize: 28, fontWeight: "700", letterSpacing: 4, textAlign: "center" },
  hint: { fontSize: 12, color: "#999", textAlign: "center", marginBottom: 16 },
  spinner: { marginVertical: 12 },
  waitingText: { fontSize: 13, color: "#888", textAlign: "center" },
  button: { backgroundColor: "#1a1a1a", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#1a6ed8", fontSize: 14 },
});

const darkStyles = {
  card: { backgroundColor: dark.card },
  title: { color: dark.text },
  body: { color: dark.textMuted },
  codeBox: { backgroundColor: dark.bgAlt },
  code: { color: dark.text },
  hint: { color: dark.textFaint },
  waitingText: { color: dark.textMuted },
  button: { backgroundColor: dark.accent },
  linkText: { color: dark.accent },
};
