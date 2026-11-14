/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#151A21",
        navy: "#12233D",
        "navy-light": "#1D3A5F",
        signal: "#EF3340",
        "signal-dark": "#C91E32",
        verified: "#1F7A4D",
        amber: "#C98A1F",
        paper: "#F8FAFE",
        line: "#E3E8F1",
      },
      fontFamily: {
        display: ["'Noto Sans'", "sans-serif"],
        body: ["'Noto Sans'", "'Noto Sans Devanagari'", "sans-serif"],
      },
      maxWidth: { prose: "68ch" },
    },
  },
  plugins: [],
};
