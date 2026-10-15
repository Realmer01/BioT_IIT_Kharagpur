import clsx from "clsx";
import { AlertOctagon, AlertTriangle, Footprints, Info, Moon, Utensils, Wheat } from "lucide-react";
import { useState } from "react";
import { useFetch, type Alert, type Patient, type Recommendations, type Risk, type Timeline } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { fmtDateTime, glucoseState, num, trend } from "../../lib/format";
import GlucoseChart from "../GlucoseChart";
import WearableStrips from "../WearableStrips";
import { Card, Legend, RiskMeter, Segmented, StreamBar } from "../ui";
import PhenotypeCard from "./PhenotypeCard";

export default function LiveTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const [hours, setHours] = useState(24);
  const [showFuture, setShowFuture] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [showTwin, setShowTwin] = useState(false);
  const tl = useFetch<Timeline>(`/api/patients/${p.patient_id}/timeline?minute=${minute}&hours=${hours}`);
  const rk = useFetch<Risk>(`/api/patients/${p.patient_id}/risk?minute=${minute}`);
  const rec = useFetch<Recommendations>(`/api/patients/${p.patient_id}/recommendations?minute=${minute}`);
  const r = rk.data;
  const tr = r ? trend(r.slope) : null;
  const gs = r ? glucoseState(r.glucose) : null;
  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-ink2 hover:text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-3.5 w-3.5" />{label}
    </label>
  );
  const ctx = r?.context;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_368px]">
      <div className="min-w-0 space-y-5">
        <Card title="Glucose and the twin's two-hour forecast"
          subtitle={tl.data ? `As of ${fmtDateTime(tl.data.time)} · the forecast assumes no new food; meals enter through the what-if simulator` : ""}
          right={<Segmented value={hours} onChange={setHours} options={[6, 12, 24].map((h) => ({ value: h, label: `${h} h` }))} />}>
          <div className={clsx(tl.loading && "refetching")}>
            {tl.data ? <GlucoseChart tl={tl.data} showFuture={showFuture} showTrack={showTrack} showTwin={showTwin} /> : <div className="h-[300px]" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
            <Legend items={[
              { label: "CGM glucose", color: "var(--s1)" }, { label: "Twin forecast", color: "var(--s2)" }, { label: "90 % interval", color: "var(--s2)", band: true },
              { label: "Target 70–180", color: "var(--good)", band: true },
              ...(showTrack ? [{ label: "Forecast made 60 min earlier", color: "var(--s3)", dash: true }] : []),
              ...(showTwin ? [{ label: "Physiology only", color: "var(--ink-2)", dash: true }] : []),
            ]} />
            <div className="flex flex-wrap gap-4">
              {toggle(showTrack, setShowTrack, "Forecast track record")}
              {toggle(showTwin, setShowTwin, "Physiology-only path")}
              {toggle(showFuture, setShowFuture, "Reveal what happened")}
            </div>
          </div>
        </Card>
        <Card title="Wearable streams" subtitle="Smartwatch data fused into the twin, on the same time axis">
          {tl.data ? <WearableStrips tl={tl.data} /> : <div className="h-48" />}
        </Card>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <RecCard rec={rec.data} loading={rec.loading} />
          <PhenotypeCard p={p} />
        </div>
      </div>

      <div className="space-y-5">
        <Card title="Right now">
          {r && tr && gs && ctx ? (
            <div className={clsx(rk.loading && "refetching")}>
              <div className="flex items-end gap-3">
                <div className="display text-[56px] leading-[0.9] text-ink">{Math.round(r.glucose)}</div>
                <div className="pb-1 text-[13px] leading-tight text-ink2">
                  <div>mg/dL</div>
                  <div className="text-ink"><span className="text-base">{tr.arrow}</span> {tr.label}</div>
                </div>
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: gs.ink }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: gs.color }} />{gs.label}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-[var(--border)]">
                {["30", "60", "120"].map((h) => (
                  <div key={h} className="bg-surface px-3 py-2">
                    <div className="text-[11px] text-muted">In {h} min</div>
                    <div className="mt-0.5 text-[18px] font-semibold text-ink">{Math.round(r.forecast[h].pred)}</div>
                    <div className="text-[11px] text-muted">{Math.round(r.forecast[h].lo)}–{Math.round(r.forecast[h].hi)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">Expected if no new food is eaten; range is the 90 % interval.</p>
              <div className="mt-4 space-y-3 border-t pt-4">
                <RiskMeter label="Above 180 mg/dL within 2 h" p={r.probabilities.hyper_2h} color="var(--warning)" />
                <RiskMeter label="Below 70 mg/dL within 1 h" p={r.probabilities.hypo_1h} color="var(--critical)" />
                {((ctx.gut_carbs ?? 0) >= 10 || (ctx.minutes_since_meal ?? 999) <= 60) && (
                  <RiskMeter label="Spike of +50 mg/dL within 2 h" p={r.probabilities.spike_2h} color="var(--watch)" />
                )}
                <p className="text-[11px] leading-snug text-muted">Risks include the patient's usual eating pattern; the forecast above does not.</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-4 text-xs">
                {[
                  [Utensils, ctx.minutes_since_meal != null && ctx.minutes_since_meal < 700 ? `${Math.round(ctx.minutes_since_meal)} min since a meal` : "No recent meal"],
                  [Wheat, (ctx.gut_carbs ?? 0) < 3 ? "No carbohydrate still absorbing" : `About ${num(ctx.gut_carbs)} g carbohydrate still absorbing`],
                  [Moon, ctx.sleep_last_h != null ? `Slept ${num(ctx.sleep_last_h, 1)} h` : "Sleep not recorded"],
                  [Footprints, `${num(ctx.steps_today)} steps today`],
                ].map(([Icon, text], i) => {
                  const I = Icon as typeof Moon;
                  return <div key={i} className="flex items-start gap-2 text-ink2"><I size={14} strokeWidth={1.8} className="mt-px shrink-0 text-faint" />{text as string}</div>;
                })}
              </dl>
            </div>
          ) : <div className="h-60" />}
        </Card>
        {r && r.alerts.length === 0 && (
          <Card title="Alerts"><p className="text-[13px] text-ink2">No alert. The twin expects glucose to stay in range for the next two hours.</p></Card>
        )}
        {r?.alerts.map((a, i) => <AlertCard key={i} a={a} />)}
      </div>
    </div>
  );
}

const SEVERITY = {
  urgent: { label: "Urgent", icon: AlertOctagon, c: "var(--critical)", ink: "var(--critical-ink)", soft: "var(--critical-soft)" },
  warning: { label: "Warning", icon: AlertTriangle, c: "var(--warning)", ink: "var(--warning-ink)", soft: "var(--warning-soft)" },
  info: { label: "Heads-up", icon: Info, c: "var(--watch)", ink: "var(--watch-ink)", soft: "var(--watch-soft)" },
};

function AlertCard({ a }: { a: Alert }) {
  const s = SEVERITY[a.severity] ?? SEVERITY.info;
  const Icon = s.icon;
  return (
    <section className="card overflow-hidden" style={{ boxShadow: `inset 3px 0 0 ${s.c}, var(--shadow-card)` }}>
      <div className="flex items-start gap-2.5 border-b px-5 py-3.5" style={{ background: s.soft }}>
        <Icon size={17} strokeWidth={2} style={{ color: s.c }} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: s.ink }}>{s.label} · {Math.round(a.probability * 100)}% probability</div>
          <div className="mt-0.5 text-[14px] font-semibold leading-snug text-ink">{a.title}</div>
          {a.predicted_peak != null && <div className="mt-0.5 text-xs text-ink2">Predicted peak {Math.round(a.predicted_peak)} mg/dL</div>}
          {a.predicted_min != null && <div className="mt-0.5 text-xs text-ink2">Predicted minimum {Math.round(a.predicted_min)} mg/dL</div>}
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div>
          <div className="label mb-2 text-[10.5px]">Why the twin thinks so</div>
          <ul className="space-y-1.5">
            {a.drivers.map((d) => (
              <li key={d.feature} className="flex items-start gap-2 text-xs leading-snug">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.impact > 0 ? s.c : "var(--axis)" }} />
                <span className="text-ink">{d.text}</span><span className="ml-auto shrink-0 pl-2 text-muted">{d.direction}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label mb-2 text-[10.5px]">Evidence by data stream</div>
          <StreamBar streams={a.streams} />
        </div>
        <div>
          <div className="label mb-1.5 text-[10.5px]">Suggested actions</div>
          <ul className="space-y-1 text-xs leading-snug text-ink2">
            {a.actions.map((x) => <li key={x} className="flex gap-2"><span className="text-faint">—</span><span>{x}</span></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RecCard({ rec, loading }: { rec: Recommendations | null; loading: boolean }) {
  return (
    <Card title="Best next action" subtitle={rec ? `Simulated on the twin against ${rec.baseline.label.toLowerCase()} (peak ${Math.round(rec.baseline.peak)} mg/dL, ${rec.baseline.time_above_180_min} min above 180)` : ""}>
      {rec ? (
        <ol className={clsx("-my-1 divide-y", loading && "refetching")}>
          {rec.recommendations.slice(0, 5).map((r, i) => {
            const hypo = r.kind === "hypo";
            const delta = hypo ? r.delta_tbr_min : r.delta_tar_min;
            return (
              <li key={r.label} className="flex items-center gap-3 py-2.5">
                <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-serif text-[13px] font-semibold",
                  i === 0 ? "bg-brand text-onbrand" : "border text-ink2")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink" title={r.label}>{r.label}</div>
                  <div className="text-xs text-muted">
                    {hypo ? `lowest ${Math.round(r.min)} mg/dL` : `peak ${Math.round(r.peak)} mg/dL (${r.delta_peak > 0 ? "+" : ""}${Math.round(r.delta_peak)})`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-semibold" style={{ color: delta < 0 ? "var(--good-ink)" : "var(--ink-2)" }}>{delta > 0 ? "+" : ""}{delta} min</div>
                  <div className="text-[11px] text-muted">{hypo ? "below 70" : "above 180"}</div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <div className="h-40" />}
      <p className="mt-3 border-t pt-2.5 text-[11px] leading-snug text-muted">Counterfactuals from the personalised physiology, anchored to the ML forecast. Model estimates, not observed outcomes.</p>
    </Card>
  );
}
