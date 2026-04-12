/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        stone: {
          50: "#FAFAF9",
          100: "#F5F5F4",
          200: "#E7E5E4",
          300: "#D6D3D1",
          400: "#A8A29E",
          500: "#78716C",
          600: "#57534E",
          700: "#44403C",
          800: "#292524",
          900: "#1C1917",
        },
      },
      boxShadow: {
        btn: "0 2px 12px rgba(0,0,0,0.12)",
        page: "4px 0 18px rgba(0,0,0,0.08)",
        book: "0 28px 70px rgba(0,0,0,0.18), 0 10px 28px rgba(0,0,0,0.10)",
      },
    },
  },
  plugins: [],
};
