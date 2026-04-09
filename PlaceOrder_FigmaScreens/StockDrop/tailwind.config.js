/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        "body-body-l-regular": "var(--body-body-l-regular-font-family)",
      },
    },
  },
  plugins: [],
};
