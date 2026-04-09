/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        red: "var(--red)",
      },
      fontFamily: {
        "default-bold-body": "var(--default-bold-body-font-family)",
      },
    },
  },
  plugins: [],
};
