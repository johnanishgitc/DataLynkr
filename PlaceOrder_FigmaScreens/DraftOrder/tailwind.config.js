/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        neutrallightlightest: "var(--neutrallightlightest)",
        red: "var(--red)",
      },
    },
  },
  plugins: [],
};
