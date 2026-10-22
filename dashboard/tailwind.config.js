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
        sidebar: v("--sidebar"),
        hoverbg: v("--hover"),
        ink: v("--ink"),
        ink2: v("--ink-2"),
        muted: v("--muted"),
        faint: v("--faint"),
        line: v("--grid"),
        axis: v("--axis"),
        strong: v("--border-strong"),
        brand: v("--brand"),
        brandhover: v("--brand-hover"),
        brandsoft: v("--brand-soft"),
        onbrand: v("--onbrand"),
        s1: v("--s1"),
        s2: v("--s2"),
        s3: v("--s3"),
        good: v("--good"),
        goodink: v("--good-ink"),
        goodsoft: v("--good-soft"),
        warning: v("--warning"),
        warningink: v("--warning-ink"),
        warningsoft: v("--warning-soft"),
        watch: v("--watch"),
        watchink: v("--watch-ink"),
        watchsoft: v("--watch-soft"),
        serious: v("--serious"),
        critical: v("--critical"),
        criticalink: v("--critical-ink"),
        criticalsoft: v("--critical-soft"),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Variable"', '"IBM Plex Sans"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      borderColor: { DEFAULT: "var(--border)" },
      borderRadius: { DEFAULT: "4px" },
      boxShadow: { pop: "var(--shadow-pop)" },
    },
  },
  plugins: [],
};
