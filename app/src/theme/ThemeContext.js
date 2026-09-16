import { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palettes } from "./palette";

const STORAGE_KEY = "budgets_color_scheme_v1";
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [scheme, setSchemeState] = useState("light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setSchemeState(saved);
    });
  }, []);

  function setScheme(next) {
    setSchemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  const value = useMemo(
    () => ({ scheme, colors: palettes[scheme], setScheme }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Merges a small set of dark-mode overrides on top of a screen's existing
 * (light) StyleSheet, only for the keys that actually need to change —
 * lets each screen keep its original StyleSheet.create() as the light
 * baseline instead of rewriting every style as theme-parameterized.
 */
export function useThemedStyles(baseStyles, darkOverrides) {
  const { scheme } = useTheme();
  return useMemo(() => {
    if (scheme !== "dark") return baseStyles;
    const merged = {};
    for (const key of Object.keys(baseStyles)) {
      merged[key] = darkOverrides[key] ? [baseStyles[key], darkOverrides[key]] : baseStyles[key];
    }
    return merged;
  }, [scheme, baseStyles, darkOverrides]);
}
