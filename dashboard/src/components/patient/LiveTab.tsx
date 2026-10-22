import clsx from "clsx";
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Card title="Glucose and two-hour forecast"
          subtitle={tl.data ? `${fmtDateTime(tl.data.time)}. The forecast assumes no new food; meals are tested in What-if.` : ""}
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
        <Card title="Wearable streams" subtitle="Smartwatch data on the same time axis">
          {tl.data ? <WearableStrips tl={tl.data} /> : <div className="h-48" />}
        </Card>
        <RecCard rec={rec.data} loading={rec.loading} />
        <PhenotypeCard p={p} />
      </div>

      <div className="space-y-5">
        <Card title="Current state" divider pad={false}>
          {r && tr && gs && ctx ? (
            <div className={clsx(rk.loading && "refetching")}>
              <div className="px-4 pb-3 pt-3">
                <div className="text-xs text-muted">Glucose, mg/dL</div>
                <div className="mt-0.5 flex items-baseline gap-3">
                  <span className="text-[44px] font-semibold leading-none tracking-[-0.02em] text-ink">{Math.round(r.glucose)}</span>
                  <span className="text-[14px] text-ink2">{tr.arrow} {tr.label}</span>
                </div>
                <div className="mt-1.5 text-[13px] font-medium" style={{ color: gs.ink }}>{gs.label}</div>
              </div>
              <table className="w-full border-t text-[13px]">
                <thead><tr className="text-xs text-muted">
                  <th className="px-4 pb-1 pt-2 text-left font-normal">If no new food</th><th className="pb-1 pt-2 text-right font-normal">mg/dL</th><th className="px-4 pb-1 pt-2 text-right font-normal">90 % interval</th>
                </tr></thead>
                <tbody>
                  {["30", "60", "120"].map((h) => (
                    <tr key={h} className="border-t border-[var(--grid)]">
                      <td className="px-4 py-1.5 text-ink2">In {h} min</td>
                      <td className="py-1.5 text-right font-semibold text-ink">{Math.round(r.forecast[h].pred)}</td>
                      <td className="px-4 py-1.5 text-right text-muted">{Math.round(r.forecast[h].lo)}–{Math.round(r.forecast[h].hi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-3 border-t px-4 py-3">
                <RiskMeter label="Above 180 within 2 h" p={r.probabilities.hyper_2h} color="var(--warning)" />
                <RiskMeter label="Below 70 within 1 h" p={r.probabilities.hypo_1h} color="var(--critical)" />
                {((ctx.gut_carbs ?? 0) >= 10 || (ctx.minutes_since_meal ?? 999) <= 60) && (
                  <RiskMeter label="Spike of 50 or more within 2 h" p={r.probabilities.spike_2h} color="var(--watch)" />
                )}
                <p className="text-[11.5px] leading-snug text-muted">Risks account for the patient's usual eating pattern; the forecast does not.</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t px-4 py-3 text-[13px]">
                <dt className="text-muted">Last meal</dt><dd className="text-right text-ink">{ctx.minutes_since_meal != null && ctx.minutes_since_meal < 700 ? `${Math.round(ctx.minutes_since_meal)} min ago` : "over 12 h ago"}</dd>
                <dt className="text-muted">Carbohydrate absorbing</dt><dd className="text-right text-ink">{(ctx.gut_carbs ?? 0) < 3 ? "none" : `about ${num(ctx.gut_carbs)} g`}</dd>
                <dt className="text-muted">Sleep last night</dt><dd className="text-right text-ink">{ctx.sleep_last_h != null ? `${num(ctx.sleep_last_h, 1)} h` : "not recorded"}</dd>
                <dt className="text-muted">Steps today</dt><dd className="text-right text-ink">{ctx.steps_today != null ? Math.round(ctx.steps_today).toLocaleString() : "–"}</dd>
              </dl>
            </div>
          ) : <div className="h-60" />}
        </Card>
        {r && r.alerts.length === 0 && (
          <div className="panel px-4 py-3 text-[13px] text-ink2"><b className="font-semibold text-ink">No active alert.</b> Glucose is expected to stay in range for the next two hours.</div>
        )}
        {r?.alerts.map((a, i) => <AlertCard key={i} a={a} />)}
      </div>
    </div>
  );
}

const SEVERITY = {
  urgent: { label: "Urgent", c: "var(--critical)", ink: "var(--critical-ink)", soft: "var(--critical-soft)" },
  warning: { label: "Warning", c: "var(--warning)", ink: "var(--warning-ink)", soft: "var(--warning-soft)" },
  info: { label: "Advisory", c: "var(--watch)", ink: "var(--watch-ink)", soft: "var(--watch-soft)" },
};

function AlertCard({ a }: { a: Alert }) {
  const s = SEVERITY[a.severity] ?? SEVERITY.info;
  return (
    <section className="panel overflow-hidden">
      <div className="border-b px-4 py-3" style={{ background: s.soft }}>
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: s.ink }}>
          <i className="inline-block h-2 w-2 rounded-[1px]" style={{ background: s.c }} />{s.label} · {Math.round(a.probability * 100)}% probability
        </div>
        <div className="mt-1 text-[15px] font-semibold leading-snug text-ink">{a.title}</div>
        {a.predicted_peak != null && <div className="mt-0.5 text-[13px] text-ink2">Predicted peak {Math.round(a.predicted_peak)} mg/dL</div>}
        {a.predicted_min != null && <div className="mt-0.5 text-[13px] text-ink2">Predicted minimum {Math.round(a.predicted_min)} mg/dL</div>}
      </div>
      <div className="space-y-4 px-4 py-3.5">
        <div>
          <h3 className="mb-1.5 text-[13px] text-ink">Contributing factors</h3>
          <table className="w-full text-xs">
            <tbody>
              {a.drivers.map((d) => (
                <tr key={d.feature} className="border-t border-[var(--grid)] first:border-t-0">
                  <td className="py-1 pr-2 text-ink">{d.text}</td>
                  <td className="whitespace-nowrap py-1 text-right" style={{ color: d.impact > 0 ? s.ink : "var(--muted)" }}>{d.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="mb-1.5 text-[13px] text-ink">Evidence by data stream</h3>
          <StreamBar streams={a.streams} />
        </div>
        <div>
          <h3 className="mb-1 text-[13px] text-ink">Suggested actions</h3>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-ink2 marker:text-muted">{a.actions.map((x) => <li key={x}>{x}</li>)}</ol>
        </div>
      </div>
    </section>
  );
}

function RecCard({ rec, loading }: { rec: Recommendations | null; loading: boolean }) {
  return (
    <Card title="Simulated actions" divider pad={false}
      subtitle={rec ? `Ranked on the twin against ${rec.baseline.label.toLowerCase()}: peak ${Math.round(rec.baseline.peak)} mg/dL, ${rec.baseline.time_above_180_min} min above 180` : ""}>
      {rec ? (
        <table className={clsx("data-table", loading && "refetching")}>
          <thead><tr><th className="w-8 pl-4">#</th><th>Action</th><th className="num pr-4">Effect</th></tr></thead>
          <tbody>
            {rec.recommendations.slice(0, 5).map((r, i) => {
              const hypo = r.kind === "hypo";
              const delta = hypo ? r.delta_tbr_min : r.delta_tar_min;
              return (
                <tr key={r.label}>
                  <td className="pl-4 text-muted">{i + 1}</td>
                  <td>
                    <div className="text-ink">{r.label}</div>
                    <div className="text-xs text-muted">{hypo ? `lowest ${Math.round(r.min)} mg/dL` : `peak ${Math.round(r.peak)} mg/dL (${r.delta_peak > 0 ? "+" : ""}${Math.round(r.delta_peak)})`}</div>
                  </td>
                  <td className="num whitespace-nowrap pr-4">
                    <div className="font-semibold" style={{ color: delta < 0 ? "var(--good-ink)" : "var(--ink-2)" }}>{delta > 0 ? "+" : ""}{delta} min</div>
                    <div className="text-xs text-muted">{hypo ? "below 70" : "above 180"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <div className="h-40" />}
      <p className="border-t px-4 py-2 text-[11.5px] leading-snug text-muted">Counterfactuals from the personalised physiology, anchored to the ML forecast. Model estimates, not observed outcomes.</p>
    </Card>
  );
}
