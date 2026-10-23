import { useEffect, useState } from "react";

const KEY = "mercureal-invoice:theme";
export type Theme = "light" | "dark";

/** Dark is the default; the toggle persists the user's choice. */
function initial(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === "light" ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
