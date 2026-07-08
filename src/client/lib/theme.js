import React from "react";

const STORAGE_KEY = "dcdcom:theme";

export function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {}
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0a0c07" : "#f4f6f0");
}

export function useTheme() {
  const [theme, setTheme] = React.useState(() => (typeof window === "undefined" ? "light" : getStoredTheme()));

  React.useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggle = React.useCallback(() => setTheme((current) => (current === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggle };
}
