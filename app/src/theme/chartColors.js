// Categorical palette for reports — validated (dataviz skill's six-check
// script) against this app's actual card surfaces (light #ffffff, dark
// #25282d): lightness band, chroma floor, CVD adjacent-pair separation
// (worst-case ΔE 9.1 light / 8.4 dark, both clear the >=8 target), and
// normal-vision adjacent separation (19.6 light / 19.3 dark, well clear of
// the >=15 floor). Fixed hue order — never cycle or reassign by rank, a
// category keeps its color across reports/months. A 9th+ category folds
// into "Other" rather than generating a new hue (skill's non-negotiable:
// categorical hues are never generated past the validated set).
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const OTHER_LIGHT = "#9a9995";
const OTHER_DARK = "#84878d";

export const MAX_CATEGORICAL_SLOTS = LIGHT.length;

/** index is stable per category (e.g. its position in a name-sorted list) so the same category keeps its color across screens/reports. */
export function categoricalColor(index, scheme) {
  const palette = scheme === "dark" ? DARK : LIGHT;
  if (index < palette.length) return palette[index];
  return scheme === "dark" ? OTHER_DARK : OTHER_LIGHT;
}

export function otherColor(scheme) {
  return scheme === "dark" ? OTHER_DARK : OTHER_LIGHT;
}
