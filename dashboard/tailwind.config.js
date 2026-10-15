// Colours are CSS variables (light/dark tokens in index.css). Opacity modifiers such as
// bg-card/95 are resolved with color-mix so they work on variables too.
const v = (name) => ({ opacityValue } = {}) =>
  opacityValue === undefined || String(opacityValue).startsWith("var(") ? `var(${name})`
    : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: v("--page"),
        card: v("--card"),
        surface: v("--surface-1"),
        ink: v("--ink"),
        ink2: v("--ink-2"),
        muted: v("--muted"),
        line: v("--grid"),
        axis: v("--axis"),
        brand: v("--brand"),
        brandsoft: v("--brand-soft"),
        onbrand: v("--onbrand"),
        s1: v("--s1"),
        s2: v("--s2"),
        s3: v("--s3"),
        good: v("--good"),
        warning: v("--warning"),
        serious: v("--serious"),
        critical: v("--critical"),
      },
      fontFamily: { sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'] },
      borderColor: { DEFAULT: "var(--border)" },
    },
  },
  plugins: [],
};
