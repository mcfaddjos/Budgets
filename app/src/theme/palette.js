// Two color schemes: "light" (existing app look, unchanged) and "dark" —
// deliberately muted/off-tone rather than a true black/true blue, per
// explicit preference. Every screen's StyleSheet stays as the light
// baseline; dark mode is a set of per-key overrides merged on top via
// useThemedStyles (ThemeContext.js), so most screens only need a small
// "what actually changes" object rather than a full rewrite.
export const light = {
  bg: "#f7f7f8",
  bgAlt: "#fff",
  card: "#fff",
  border: "#ddd",
  borderSoft: "#eee",
  text: "#1a1a1a",
  textMuted: "#888",
  textFaint: "#999",
  accent: "#1a6ed8",
  accentSoft: "#eaf2fd",
  emphasis: "#1a1a1a",
  danger: "#c0392b",
  success: "#2a8a4a",
  chipBg: "#fff",
};

export const dark = {
  bg: "#1c1e22",
  bgAlt: "#25282d",
  card: "#25282d",
  border: "#3a3d43",
  borderSoft: "#33363b",
  text: "#e6e4e0",
  textMuted: "#9a9da3",
  textFaint: "#84878d",
  accent: "#3d84a8",
  accentSoft: "#20333c",
  emphasis: "#3d84a8",
  danger: "#c9776c",
  success: "#6fae7f",
  chipBg: "#2c2f34",
};

export const palettes = { light, dark };
