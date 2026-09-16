import { StyleSheet, Text, TextInput, View } from "react-native";

/**
 * Custom masking instead of secureTextEntry — confirmed as a genuine
 * native rendering bug on this device/RN combination (toggling to hidden
 * mode showed nothing at all, not even bullet characters; ruled out
 * autofill-overlay interference separately). JS always receives the real
 * typed text regardless of secureTextEntry — masking is purely a visual
 * effect the native layer applies on top — so this sidesteps native
 * masking entirely: the real TextInput behaves completely normally
 * (fully reliable typing/cursor/paste), just with its text color made
 * transparent when hidden, with a plain Text overlay showing bullet
 * characters drawn on top using the exact same box (border/padding) so
 * it lines up pixel-for-pixel.
 */
export default function MaskedPasswordInput({ value, onChangeText, hidden, style, ...props }) {
  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={false}
        style={[style, hidden && styles.hiddenText]}
        cursorColor={hidden ? "#333" : undefined}
      />
      {hidden ? (
        <View style={[StyleSheet.absoluteFill, style, styles.overlayBox]} pointerEvents="none">
          <Text style={styles.bulletsText} numberOfLines={1}>
            {"•".repeat(value.length)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center" },
  hiddenText: { color: "transparent" },
  overlayBox: { backgroundColor: "transparent", borderColor: "transparent", justifyContent: "center" },
  bulletsText: { fontSize: 16, color: "#000", letterSpacing: 2 },
});
