/**
 * Shared visual tokens so every screen's cards/modals look like one
 * consistent app rather than each screen's own guess.
 *
 * Shadows specifically need both sets of properties: iOS only reads
 * `shadow*` and defaults `shadowOffset` to {0,0} if you omit it, which
 * reads as a flat, evenly-diffused glow rather than a card lifted off the
 * page — it needs an explicit vertical offset to cast a real shadow below
 * the card. Android ignores `shadow*` entirely and only reads `elevation`,
 * computing its own directional shadow. Setting both here is what makes
 * one definition look right on both platforms instead of having been
 * tuned against whichever platform was on hand at the time.
 */

export const colors = {
  background: "#f7f7f8",
  surface: "#fff",
  border: "#eee",
  borderInput: "#ddd",
  text: "#1a1a1a",
  textMuted: "#666",
  textFaint: "#999",
  accent: "#1a6ed8",
  accentSoft: "#eaf2fd",
  danger: "#c0392b",
  success: "#2a8a4a",
};

/** For list rows and cards resting directly on the screen background. */
export const shadowCard = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
  elevation: 2,
};

/** For modals/sheets floating above a dimmed backdrop — needs to read as higher up than a card. */
export const shadowModal = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
};
