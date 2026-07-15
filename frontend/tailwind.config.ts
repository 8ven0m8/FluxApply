import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backed by CSS variables (see globals.css) so light/dark values can
        // swap under the `.dark` class without touching every usage site.
        // The rgb(... / <alpha-value>) form is required for Tailwind's
        // opacity modifiers (e.g. bg-accent/10) to keep working.
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        accentDark: "rgb(var(--color-accent-dark) / <alpha-value>)",
        rust: "rgb(var(--color-rust) / <alpha-value>)",
        // Card/input backgrounds — plain white in light mode, a slightly
        // lighter-than-background panel color in dark mode.
        surface: "rgb(var(--color-surface) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;