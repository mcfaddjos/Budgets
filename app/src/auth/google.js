// Google Sign-In (§10a): authenticates identity only. The ID token this
// returns is verified server-side (backend/src/auth.js, against Google's
// own public keys) — nothing about the vault passphrase or key material
// flows through here, that's a deliberately separate concern.
import { GoogleSignin, isCancelledResponse, isSuccessResponse } from "@react-native-google-signin/google-signin";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set — see app/.env.example");
  }
  // webClientId (not an Android/iOS-specific client) so the resulting
  // idToken's audience matches the single GOOGLE_CLIENT_ID the server
  // verifies against, regardless of which platform issued it.
  GoogleSignin.configure({ webClientId });
  configured = true;
}

/** Returns a Google ID token, or null if the user cancelled the sign-in sheet. */
export async function signInWithGoogle() {
  try {
    ensureConfigured();
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    if (isCancelledResponse(response)) return null;
    if (!isSuccessResponse(response) || !response.data.idToken) {
      throw new Error("Google sign-in did not return an ID token");
    }
    return response.data.idToken;
  } catch (err) {
    // Surfaced to Logcat (tag ReactNativeJS) — this is where native
    // errors like DEVELOPER_ERROR (SHA-1/package mismatch) actually
    // come from, so they need to be visible without the in-app UI.
    console.error("[google-signin] failed:", err.code || "", err.message);
    throw err;
  }
}

export async function signOutOfGoogle() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Best-effort — an already-signed-out Google session isn't an app-level error.
  }
}
