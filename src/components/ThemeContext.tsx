import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface NavigationBarPlugin {
  setColor(options: { color: string; darkButtons: boolean }): Promise<void>;
}

const NavigationBar = registerPlugin<NavigationBarPlugin>("NavigationBar");

export type ThemeMode = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  /** The resolved theme that is actually being displayed */
  resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  resolvedTheme: "dark",
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemPreference(): "dark" | "light" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}

const THEME_STORAGE_KEY = "videx-theme";

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    // localStorage may be unavailable (private mode); fall through to default
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [systemPref, setSystemPref] = useState<"dark" | "light">(getSystemPreference);

  const resolvedTheme: "dark" | "light" =
    theme === "system" ? systemPref : theme;

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemPref(e.matches ? "light" : "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply the data-theme attribute and sync Capacitor status bar style.
  //
  // The CSS in src/index.css resolves both `:root` and
  // `[data-theme="dark"]` to dark tokens, so omitting the attribute
  // would render dark too — but always writing the attribute is
  // unambiguous in DevTools and makes the chosen theme inspectable.
  //
  // The hex literals below mirror the canonical surface tokens
  // (--bg / --paper from tokens.css §3); keep them in lockstep
  // with that file. Native API surface (StatusBar, NavigationBar,
  // <meta name="theme-color">) doesn't accept CSS var() so we have
  // to pass the raw value.
  useEffect(() => {
    const SURFACE_HEX = { dark: "#0a0a0f", light: "#f5f1e8" } as const;
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme);

    // Light theme → dark status bar icons; Dark theme → light icons
    StatusBar.setStyle({
      style: resolvedTheme === "dark" ? Style.Dark : Style.Light,
    }).catch(() => {});

    // Sync <meta name="theme-color"> for browser chrome
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", SURFACE_HEX[resolvedTheme]);
    }

    // Match Android navigation bar to the app theme
    if (Capacitor.isNativePlatform()) {
      NavigationBar.setColor({
        color: SURFACE_HEX[resolvedTheme],
        darkButtons: resolvedTheme === "light",
      }).catch(() => {});
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* localStorage unavailable */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
