import clsx from "clsx";
import { useState } from "react";
import { useFetch, type Agp, type AgpSummary, type Patient } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { AgpChart, DailyTir, TirBar } from "../Agp";
import { Card, Segmented } from "../ui";

const METRIC: Record<string, [string, keyof AgpSummary]> = {
  tir: ["Time in range 70–180", "tir"], tbr: ["Time below 70", "tbr"], tbr_l2: ["Time below 54", "tbr_l2"],
  tar: ["Time above 180", "tar"], tar_l2: ["Time above 250", "tar_l2"], cv: ["Glucose variability (CV)", "cv"],
};

/** "tir>70%" -> metric key and a readable target. */
function parseTarget(key: string) {
  const m = key.match(/^([a-z_0-9]+)(<=|>=|<|>)(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  const [, metric, op, v] = m;
  const text = op.startsWith(">") ? `above ${v} %` : op === "<=" ? `${v} % or less` : `under ${v} %`;
  return { metric, text };
}

export default function AgpTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const [days, setDays] = useState(14);
  const { data, loading } = useFetch<Agp>(`/api/patients/${p.patient_id}/agp?minute=${minute}&days=${days}`);
  if (!data) return <div className="py-16 text-center text-muted">Loading AGP…</div>;
  const s = data.summary;
  const rows = Object.entries(data.targets).map(([k, ok]) => {
    const t = parseTarget(k);
    const def = t && METRIC[t.metric];
    return def ? { label: def[0], value: `${s[def[1]].toFixed(def[1] === "tbr" || def[1] === "tbr_l2" ? 1 : 0)} %`, target: t.text, ok } : null;
  }).filter(Boolean) as { label: string; value: string; target: string; ok: boolean }[];
  return (
    <div className={clsx("space-y-5", loading && "refetching")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink2">Ambulatory Glucose Profile, International Consensus on Time in Range · {s.days} days · sensor active {s.active_pct.toFixed(0)} %</p>
        <Segmented value={days} onChange={setDays} options={[7, 14].map((d) => ({ value: d, label: `${d} days` }))} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Glucose statistics and targets" divider pad={false}>
            <table className="data-table">
              <thead><tr><th className="pl-4">Metric</th><th className="num">Value</th><th className="pr-4">Target</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="pl-4 text-ink2">{r.label}</td>
                    <td className="num font-semibold" style={{ color: r.ok ? "var(--ink)" : "var(--critical-ink)" }}>{r.value}</td>
                    <td className="pr-4 text-xs" style={{ color: r.ok ? "var(--muted)" : "var(--critical-ink)" }}>{r.target}{r.ok ? "" : " · not met"}</td>
                  </tr>
                ))}
                <tr><td className="pl-4 text-ink2">Mean glucose</td><td className="num font-semibold text-ink">{s.mean_glucose.toFixed(0)}</td><td className="pr-4 text-xs text-muted">mg/dL</td></tr>
                <tr><td className="pl-4 text-ink2">GMI</td><td className="num font-semibold text-ink">{s.gmi.toFixed(1)} %</td><td className="pr-4 text-xs text-muted">lab HbA1c {p.hba1c} %</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Time in ranges"><TirBar s={s} height={200} /></Card>
        </div>
        <Card title="Glucose profile by time of day" subtitle="Median line, 25–75th percentile (dark band) and 5–95th percentile (light band); target zone shaded">
          <AgpChart agp={data} height={360} />
        </Card>
      </div>
      <Card title="Daily time in range" subtitle="One bar per day; the figure is the share of time in range">
        <DailyTir agp={data} />
      </Card>
    </div>
  );
}
