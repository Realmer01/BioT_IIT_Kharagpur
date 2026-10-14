import clsx from "clsx";
import { AlertOctagon, AlertTriangle, CheckCircle2, Eye, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { Status, StreamShare } from "../lib/api";

export function Card({ title, subtitle, right, children, className, pad = true }:
  { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
          <div>
            {title && <h2 className="text-[13px] font-semibold tracking-wide text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={clsx(pad && "p-4", !pad && "pb-2")}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, unit, sub, accent }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; accent?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold" style={accent ? { color: accent } : undefined}>{value}</span>
        {unit && <span className="text-xs text-ink2">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink2">{sub}</div>}
    </div>
  );
}

const STATUS = {
  urgent: { label: "Urgent", icon: AlertOctagon, color: "var(--critical)" },
  warning: { label: "Warning", icon: AlertTriangle, color: "var(--serious)" },
  watch: { label: "Watch", icon: Eye, color: "var(--warning)" },
  stable: { label: "Stable", icon: CheckCircle2, color: "var(--good)" },
  info: { label: "Info", icon: Info, color: "var(--s1)" },
};

export function StatusPill({ status }: { status: Status | "info" }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-ink"
      style={{ borderColor: s.color }}>
      <Icon size={13} style={{ color: s.color }} aria-hidden /> {s.label}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "warn" }) {
  const cls = { neutral: "bg-page text-ink2", brand: "bg-brandsoft text-brand", good: "bg-page text-ink2", warn: "bg-page text-ink2" }[tone];
  return <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}

/** A thin probability meter: the number is the label; the bar is secondary. */
export function RiskMeter({ label, p, color }: { label: string; p: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-ink2">{label}</span><span className="tnum font-semibold text-ink">{Math.round(p * 100)}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-page">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, p * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const STREAM_COLORS: Record<string, string> = {
  cgm: "var(--s1)", meal: "var(--s2)", wearable: "var(--s3)", twin: "#6250d6", ehr: "#e87ba4", context: "var(--axis)",
};

/** Per-stream share of an alert's explanation (TreeSHAP |contribution| aggregated by stream). */
export function StreamBar({ streams }: { streams: StreamShare[] }) {
  const shown = streams.filter((s) => s.share > 0.005);
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {shown.map((s) => (
          <div key={s.stream} title={`${s.label}: ${(s.share * 100).toFixed(0)}%`}
            style={{ width: `${s.share * 100}%`, background: STREAM_COLORS[s.stream] ?? "var(--axis)" }} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {shown.slice(0, 6).map((s) => (
          <li key={s.stream} className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: STREAM_COLORS[s.stream] ?? "var(--axis)" }} />
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
    <div className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={clsx("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
            value === t.id ? "border-brand font-semibold text-ink" : "border-transparent text-ink2 hover:text-ink")}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean; band?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.band ? <span className="h-2.5 w-4 rounded-sm" style={{ background: i.color, opacity: 0.35 }} /> :
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={i.color} strokeWidth="2" strokeDasharray={i.dash ? "4 3" : undefined} /></svg>}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>;
}
