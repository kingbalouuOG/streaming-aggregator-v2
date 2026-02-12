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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
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

  // Apply the data-theme attribute and sync Capacitor status bar style
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    // Light theme → dark status bar icons; Dark theme → light (white) status bar icons
    StatusBar.setStyle({
      style: resolvedTheme === "dark" ? Style.Dark : Style.Light,
    }).catch(() => {});
    // Match Android navigation bar to the app theme
    if (Capacitor.isNativePlatform()) {
      NavigationBar.setColor({
        color: resolvedTheme === "dark" ? "#0a0a0f" : "#f5f4f1",
        darkButtons: resolvedTheme === "light",
      }).catch(() => {});
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
