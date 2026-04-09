/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "neutral50-ffffff-text-light": "var(--neutral50-ffffff-text-light)",
      },
      fontFamily: {
        "default-bold-body": "var(--default-bold-body-font-family)",
      },
    },
  },
  plugins: [],
};
