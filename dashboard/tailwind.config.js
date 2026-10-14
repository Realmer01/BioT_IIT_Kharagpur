/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        card: "var(--card)",
        surface: "var(--surface-1)",
        ink: "var(--ink)",
        ink2: "var(--ink-2)",
        muted: "var(--muted)",
        line: "var(--grid)",
        axis: "var(--axis)",
        brand: "var(--brand)",
        brandsoft: "var(--brand-soft)",
        onbrand: "var(--onbrand)",
        s1: "var(--s1)",
        s2: "var(--s2)",
        s3: "var(--s3)",
        good: "var(--good)",
        warning: "var(--warning)",
        serious: "var(--serious)",
        critical: "var(--critical)",
      },
      fontFamily: { sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'] },
      borderColor: { DEFAULT: "var(--border)" },
    },
  },
  plugins: [],
};
