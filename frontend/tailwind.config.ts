import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12181B",
        paper: "#F7F5F1",
        line: "#DCD8CF",
        accent: "#3B6E5E", // muted pine — reads as "reviewed / approved", fits a job-application tool
        accentDark: "#274A3F",
        rust: "#B5502F", // used sparingly for errors / needs-attention states
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
