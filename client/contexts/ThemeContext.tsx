import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode; defaultTheme?: "light" | "dark" }) {
  return children;
}
