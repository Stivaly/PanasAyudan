import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        bg: "#0a0a0a",
        surface: "#161616",
        border: "#2a2a2a",
        accent: "#22c55e",
        danger: "#ef4444",
        muted: "#9ca3af",
      },
    },
  },
  plugins: [],
};

export default config;
