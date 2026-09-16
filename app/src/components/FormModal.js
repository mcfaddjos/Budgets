import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useThemedStyles } from "../theme/ThemeContext";
import { dark } from "../theme/palette";

/**
 * Shared shell for every popup/form in the app — a dimmed backdrop
 * (matching what TransactionsScreen's category picker already looked
 * like), a KeyboardAvoidingView so an open keyboard never covers an
 * input, and a ScrollView so content that doesn't fit in the remaining
 * space (e.g. many category chips once the keyboard shrinks it) scrolls
 * instead of overflowing the card. Screens should reach for this instead
 * of hand-rolling Modal + KeyboardAvoidingView each time — that's how the
 * dimming and keyboard behavior ended up inconsistent across screens in
 * the first place.
 *
 * variant: "dialog" (default) centers a rounded card, matching
 * AddTransactionModal/BudgetsScreen's edit dialogs. "sheet" slides a
 * bottom sheet up instead, matching TransactionsScreen's category picker.
 *
 * No "height" behavior on Android: the app's windowSoftInputMode is
 * already "adjustResize" (AndroidManifest.xml), which shrinks the
 * Modal's window for the keyboard on its own — layering
 * KeyboardAvoidingView's own height-shrinking on top of that resized it
 * twice, leaving a gap at the bottom of the dimmed backdrop where the
 * screen behind the modal showed through, right above the keyboard.
 */
export default function FormModal({ visible, onClose, children, variant = "dialog" }) {
  const isSheet = variant === "sheet";
  const s = useThemedStyles(styles, darkStyles);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[s.scrollContent, isSheet && s.scrollContentSheet]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[s.card, isSheet && s.cardSheet]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  scrollContentSheet: { flexGrow: 1, justifyContent: "flex-end", padding: 0 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  cardSheet: { borderRadius: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
});

const darkStyles = {
  card: { backgroundColor: dark.card },
  cardSheet: { backgroundColor: dark.card },
};
