module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "#253041",
        bg: "#0f1216",
        surface: "#151a21",
        accent: "#3b82f6",
        text: "#e6edf3",
        muted: "#9aa6b2",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
};
