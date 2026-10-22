import clsx from "clsx";
import type { ReactNode } from "react";
import type { Status, StreamShare } from "../lib/api";

/** A bordered panel. Title row is optional; `divider` separates it from list or table content. */
export function Card({ title, subtitle, right, children, className, pad = true, divider = false }:
  { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean; divider?: boolean }) {
  const head = Boolean(title || right);
  return (
    <section className={clsx("panel", className)}>
      {head && (
        <header className={clsx("flex items-start justify-between gap-4 px-4 py-3", divider && "border-b")}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] leading-snug text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={clsx(pad && (head && !divider ? "px-4 pb-4" : "p-4"))}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, meta, right }: { title: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight text-ink">{title}</h1>
        {meta && <div className="mt-1 text-[13px] text-muted">{meta}</div>}
      </div>
      {right}
    </div>
  );
}

export interface Segment { key: string; label: string; value: ReactNode; unit?: string; marker?: string; sub?: ReactNode }

/** A summary bar of figures; segments with a marker act as filters when onSelect is given. */
export function Census({ items, active, onSelect, className }:
  { items: Segment[]; active?: string | null; onSelect?: (key: string) => void; className?: string }) {
  return (
    <div className={clsx("panel flex flex-wrap overflow-hidden", className)}>
      {items.map((s) => {
        const clickable = Boolean(onSelect && s.marker);
        const on = active === s.key;
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              {s.marker && <i className="inline-block h-2 w-2 rounded-[1px]" style={{ background: s.marker }} />}{s.label}
            </span>
            <span className="mt-0.5 flex items-baseline gap-1">
              <span className="text-[20px] font-semibold leading-tight text-ink">{s.value}</span>
              {s.unit && <span className="text-xs text-muted">{s.unit}</span>}
            </span>
            {s.sub && <span className="mt-0.5 text-xs text-muted">{s.sub}</span>}
          </>
        );
        const cls = clsx("flex min-w-[124px] flex-1 flex-col border-r px-4 py-2.5 text-left last:border-r-0",
          clickable && "cursor-pointer transition-colors hover:bg-surface", on && "bg-surface shadow-[inset_0_-2px_0_var(--brand)]");
        return clickable
          ? <button key={s.key} type="button" aria-pressed={on} className={cls} onClick={() => onSelect!(s.key)}>{body}</button>
          : <div key={s.key} className={cls}>{body}</div>;
      })}
    </div>
  );
}

const STATUS = {
  urgent: { label: "Urgent", mark: "var(--critical)", ink: "var(--critical-ink)" },
  warning: { label: "Warning", mark: "var(--warning)", ink: "var(--warning-ink)" },
  watch: { label: "Watch", mark: "var(--watch)", ink: "var(--watch-ink)" },
  stable: { label: "Stable", mark: "var(--faint)", ink: "var(--muted)" },
  info: { label: "Info", mark: "var(--watch)", ink: "var(--watch-ink)" },
};
export const STATUS_MARK = STATUS;

/** Triage state: alarm-priority colour, always with its word. */
export function StatusPill({ status }: { status: Status | "info" }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold" style={{ color: s.ink }}>
      <i className="inline-block h-2 w-2 rounded-[1px]" style={{ background: s.mark }} aria-hidden />{s.label}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "warn" }) {
  const cls = {
    neutral: "border-strong text-ink2", brand: "border-brand text-brand",
    good: "border-transparent bg-goodsoft text-goodink", warn: "border-transparent bg-warningsoft text-warningink",
  }[tone];
  return <span className={clsx("inline-flex max-w-full items-center gap-1 rounded-[3px] border px-1.5 text-[11.5px] leading-[18px]", cls)}>{children}</span>;
}

/** A thin probability meter: the number is the label; the bar is secondary. */
export function RiskMeter({ label, p, color }: { label: string; p: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-[13px]"><span className="text-ink2">{label}</span><span className="font-semibold text-ink">{Math.round(p * 100)}%</span></div>
      <div className="mt-1.5 h-[3px] overflow-hidden bg-[var(--grid)]">
        <div className="h-full" style={{ width: `${Math.max(1.5, p * 100)}%`, background: color }} />
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
      <div className="flex h-2 w-full gap-[2px] overflow-hidden">
        {shown.map((s) => (
          <div key={s.stream} title={`${s.label}: ${(s.share * 100).toFixed(0)}%`}
            style={{ width: `${s.share * 100}%`, background: STREAM_COLORS[s.stream] ?? "var(--axis)" }} />
        ))}
      </div>
      <table className="mt-2 w-full text-xs">
        <tbody>
          {shown.slice(0, 6).map((s) => (
            <tr key={s.stream}>
              <td className="w-3 py-0.5"><i className="block h-2 w-2" style={{ background: STREAM_COLORS[s.stream] ?? "var(--axis)" }} /></td>
              <td className="py-0.5 pl-1.5 text-ink2">{s.label}</td>
              <td className="py-0.5 text-right font-medium text-ink">{(s.share * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-6 overflow-x-auto border-b" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} role="tab" aria-selected={value === t.id}
          className={clsx("-mb-px shrink-0 border-b-2 pb-2 pt-1 text-[14px] transition-colors",
            value === t.id ? "border-brand font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
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
          {i.band ? <span className="h-2.5 w-4" style={{ background: i.color, opacity: 0.3 }} /> :
            <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={i.color} strokeWidth="2" strokeDasharray={i.dash ? "4 3" : undefined} /></svg>}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>;
}

/** Boxed note for context the clinician should not miss (demo story, provenance). */
export function Note({ label, children, right }: { label?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-surface px-3 py-2 text-[13px] text-ink2">
      <span>{label && <b className="mr-1.5 font-semibold text-ink">{label}</b>}{children}</span>
      {right}
    </div>
  );
}
