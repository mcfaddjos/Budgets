// Thin wrapper around expo-image-picker's camera launcher — kept separate
// from extractReceipt.js so the capture UI doesn't need to know anything
// about Azure/Claude, and extraction doesn't need to know anything about
// the camera. quality: 0.8 balances OCR/vision accuracy against upload
// size (this becomes both an API request body and, if the household opts
// in to retention, a stored ciphertext payload — see PRD §8.6).
import * as ImagePicker from "expo-image-picker";

/**
 * Returns { base64, mimeType, uri } for the captured photo, or null if the
 * user cancelled or denied the permission prompt.
 */
export async function captureReceiptPhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.8,
    mediaTypes: ["images"],
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  return { base64: asset.base64, mimeType: asset.mimeType || "image/jpeg", uri: asset.uri };
}
