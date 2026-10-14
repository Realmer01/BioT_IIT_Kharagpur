export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
export const fmtDateTime = (d: Date | string) => `${fmtDay(d)} · ${fmtTime(d)}`;
export const pct = (v: number | null | undefined, nd = 0) => (v == null ? "–" : `${(v * 100).toFixed(nd)}%`);
export const num = (v: number | null | undefined, nd = 0) => (v == null || Number.isNaN(v) ? "–" : v.toFixed(nd));

/** CGM trend arrow convention (mg/dL per min). */
export function trend(slope: number) {
  if (slope > 2) return { arrow: "↑↑", label: "rising fast" };
  if (slope > 1) return { arrow: "↑", label: "rising" };
  if (slope > 0.4) return { arrow: "↗", label: "rising slowly" };
  if (slope < -2) return { arrow: "↓↓", label: "falling fast" };
  if (slope < -1) return { arrow: "↓", label: "falling" };
  if (slope < -0.4) return { arrow: "↘", label: "falling slowly" };
  return { arrow: "→", label: "steady" };
}

export function glucoseState(g: number) {
  if (g < 54) return { label: "Very low", color: "var(--critical)" };
  if (g < 70) return { label: "Low", color: "var(--critical)" };
  if (g <= 180) return { label: "In range", color: "var(--good)" };
  if (g <= 250) return { label: "High", color: "var(--warning)" };
  return { label: "Very high", color: "var(--serious)" };
}

export const TIR_COLORS = {
  tbr_l2: "#a82727", tbr_l1: "var(--critical)", tir: "var(--good)", tar_l1: "var(--warning)", tar_l2: "var(--serious)",
};
export const TIR_LABELS = {
  tbr_l2: "Very low <54", tbr_l1: "Low 54–69", tir: "In range 70–180", tar_l1: "High 181–250", tar_l2: "Very high >250",
};
