import clsx from "clsx";
import type { ReactNode } from "react";
import type { Status, StreamShare } from "../lib/api";

export function Card({ title, subtitle, right, children, className, pad = true }:
  { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  const head = Boolean(title || right);
  return (
    <section className={clsx("card", className)}>
      {head && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold leading-snug tracking-[-0.006em] text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={clsx(pad ? (head ? "px-5 pb-5 pt-3.5" : "p-5") : "pb-2", !pad && head && "pt-3")}>{children}</div>
    </section>
  );
}

/** Page title block: honey eyebrow, serif title, one-paragraph lede. */
export function PageHeader({ eyebrow, title, children, right }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="display mt-1 text-[32px] leading-[1.1] text-ink">{title}</h1>
        {children && <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink2">{children}</p>}
      </div>
      {right}
    </div>
  );
}

export interface StatItem { label: string; value: ReactNode; unit?: string; sub?: ReactNode; accent?: string }

/** A row of headline figures separated by hairlines (one card, not a grid of boxes). */
export function Stats({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={clsx("grid gap-px overflow-hidden rounded-[10px] border bg-[var(--border)] shadow-card", className)}>
      {items.map((s) => (
        <div key={s.label} className="bg-card px-5 py-4">
          <div className="text-xs font-medium text-muted">{s.label}</div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="display text-[30px] leading-none" style={s.accent ? { color: s.accent } : undefined}>{s.value}</span>
            {s.unit && <span className="text-xs font-medium text-ink2">{s.unit}</span>}
          </div>
          {s.sub && <div className="mt-1.5 text-xs leading-snug text-ink2">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function StatTile({ label, value, unit, sub, accent }: StatItem) {
  return <Stats items={[{ label, value, unit, sub, accent }]} />;
}

const STATUS = {
  urgent: { label: "Urgent", dot: "var(--critical)", bg: "var(--critical-soft)", fg: "var(--critical-ink)" },
  warning: { label: "Warning", dot: "var(--warning)", bg: "var(--warning-soft)", fg: "var(--warning-ink)" },
  watch: { label: "Watch", dot: "var(--watch)", bg: "var(--watch-soft)", fg: "var(--watch-ink)" },
  stable: { label: "Stable", dot: "var(--faint)", bg: "transparent", fg: "var(--muted)" },
  info: { label: "Info", dot: "var(--watch)", bg: "var(--watch-soft)", fg: "var(--watch-ink)" },
};

/** Triage state: colour follows alarm priority, and the word is always shown. */
export function StatusPill({ status }: { status: Status | "info" }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-semibold" style={{ background: s.bg, color: s.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} aria-hidden />{s.label}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "accent" | "good" | "warn" }) {
  const cls = {
    neutral: "border-[var(--border)] bg-surface text-ink2", brand: "border-transparent bg-brandsoft text-brand",
    accent: "border-transparent bg-accentsoft text-accentink", good: "border-transparent bg-goodsoft text-goodink",
    warn: "border-transparent bg-warningsoft text-warningink",
  }[tone];
  return <span className={clsx("inline-flex max-w-full items-center gap-1 rounded-[5px] border px-1.5 py-px text-[11px] font-medium", cls)}>{children}</span>;
}

/** A thin probability meter: the number is the label; the bar is secondary. */
export function RiskMeter({ label, p, color }: { label: string; p: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-xs"><span className="text-ink2">{label}</span><span className="tnum font-semibold text-ink">{Math.round(p * 100)}%</span></div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--grid)]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, p * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const STREAM_COLORS: Record<string, string> = {
  cgm: "var(--s1)", meal: "var(--s2)", wearable: "var(--s3)", twin: "#7158d6", ehr: "#d86a9c", context: "var(--axis)",
};

/** Per-stream share of an alert's explanation (TreeSHAP |contribution| aggregated by stream). */
export function StreamBar({ streams }: { streams: StreamShare[] }) {
  const shown = streams.filter((s) => s.share > 0.005);
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {shown.map((s) => (
          <div key={s.stream} title={`${s.label}: ${(s.share * 100).toFixed(0)}%`}
            style={{ width: `${s.share * 100}%`, background: STREAM_COLORS[s.stream] ?? "var(--axis)" }} />
        ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
        {shown.slice(0, 6).map((s) => (
          <li key={s.stream} className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: STREAM_COLORS[s.stream] ?? "var(--axis)" }} />
            <span className="truncate">{s.label}</span>
            <span className="tnum ml-auto font-medium text-ink">{(s.share * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} role="tab" aria-selected={value === t.id}
          className={clsx("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[13.5px] transition-colors",
            value === t.id ? "border-brand font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}>
          <span className={value === t.id ? "text-ink" : "text-faint"}>{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  );
}

/** Two to four mutually exclusive options (time windows, ranges). */
export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean; band?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.band ? <span className="h-2.5 w-4 rounded-[3px]" style={{ background: i.color, opacity: 0.3 }} /> :
            <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={i.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={i.dash ? "4 3" : undefined} /></svg>}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>;
}

/** Thin left-ruled note (demo story, provenance, caveats). */
export function Note({ label, children, tone = "accent", right }: { label?: ReactNode; children: ReactNode; tone?: "accent" | "brand"; right?: ReactNode }) {
  return (
    <div className={clsx("flex flex-wrap items-center justify-between gap-2 rounded-r-md border-l-2 px-3 py-2 text-[13px] text-ink",
      tone === "accent" ? "border-accent bg-accentsoft/70" : "border-brand bg-brandsoft/70")}>
      <span>{label && <span className={clsx("mr-2 text-[11px] font-semibold uppercase tracking-[0.08em]", tone === "accent" ? "text-accentink" : "text-brand")}>{label}</span>}{children}</span>
      {right}
    </div>
  );
}
