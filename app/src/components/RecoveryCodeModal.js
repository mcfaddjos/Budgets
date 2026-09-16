import { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

/**
 * Shown exactly once, right after a household DEK first becomes available
 * to this device (new household creation, or an existing member just
 * completed an access grant) — see PRD §10a's account-recovery decision.
 * Deliberately has no backdrop-dismiss or close button: losing this code
 * without ever having seen it defeats the entire point of it existing.
 */
export default function RecoveryCodeModal() {
  const { pendingRecoveryCode, acknowledgeRecoveryCode } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const s = useThemedStyles(styles, darkStyles);

  if (!pendingRecoveryCode) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>Save your recovery code</Text>
          <Text style={s.body}>
            If this device ever loses access to your household's data (a lost phone, reinstalling the app), this
            code is the only other way back in — nobody else can generate it for you, including us. Write it down
            or save it in a password manager now.
          </Text>

          <View style={s.codeBox}>
            <Text style={s.code} selectable>
              {pendingRecoveryCode.code}
            </Text>
          </View>
          <Text style={s.hint}>Long-press the code above to copy it.</Text>

          <TouchableOpacity style={s.checkboxRow} onPress={() => setConfirmed((v) => !v)}>
            <View style={[s.checkbox, confirmed && s.checkboxChecked]}>
              {confirmed ? <Text style={s.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={s.checkboxLabel}>I've saved this code somewhere safe</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.button, !confirmed && s.buttonDisabled]}
            onPress={acknowledgeRecoveryCode}
            disabled={!confirmed}
          >
            <Text style={s.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 22 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  body: { fontSize: 14, color: "#444", lineHeight: 20, marginBottom: 16 },
  codeBox: { backgroundColor: "#f2f2f2", borderRadius: 8, padding: 14, marginBottom: 6 },
  code: { fontFamily: "monospace", fontSize: 15, textAlign: "center" },
  hint: { fontSize: 12, color: "#999", textAlign: "center", marginBottom: 20 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#bbb",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#1a6ed8", borderColor: "#1a6ed8" },
  checkboxMark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  checkboxLabel: { fontSize: 14, color: "#333", flex: 1 },
  button: { backgroundColor: "#1a1a1a", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#ccc" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

const darkStyles = {
  card: { backgroundColor: dark.card },
  title: { color: dark.text },
  body: { color: dark.textMuted },
  codeBox: { backgroundColor: dark.bgAlt },
  code: { color: dark.text },
  hint: { color: dark.textFaint },
  checkbox: { borderColor: dark.border },
  checkboxChecked: { backgroundColor: dark.accent, borderColor: dark.accent },
  checkboxLabel: { color: dark.text },
  button: { backgroundColor: dark.accent },
};
