import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appConfig from "../../app.json";

/**
 * Rendered once at the App.js root, absolutely positioned, so it shows on
 * every screen (auth screens included) without threading it through each
 * one individually.
 */
export default function VersionFooter() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 4 }]} pointerEvents="none">
      <Text style={styles.text}>v{appConfig.expo.version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center", paddingTop: 4 },
  text: { fontSize: 10, color: "#bbb" },
});
