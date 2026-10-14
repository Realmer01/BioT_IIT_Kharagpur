import clsx from "clsx";
import { AlertOctagon, AlertTriangle, Footprints, Info, Moon, Utensils } from "lucide-react";
import { useState } from "react";
import { useFetch, type Alert, type Patient, type Recommendations, type Risk, type Timeline } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { fmtDateTime, glucoseState, num, trend } from "../../lib/format";
import GlucoseChart from "../GlucoseChart";
import WearableStrips from "../WearableStrips";
import { Card, Legend, RiskMeter, StreamBar } from "../ui";
import PhenotypeCard from "./PhenotypeCard";

export default function LiveTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const [hours, setHours] = useState(24);
  const [showFuture, setShowFuture] = useState(false);
  const [showTrack, setShowTrack] = useState(true);
  const [showTwin, setShowTwin] = useState(false);
  const tl = useFetch<Timeline>(`/api/patients/${p.patient_id}/timeline?minute=${minute}&hours=${hours}`);
  const rk = useFetch<Risk>(`/api/patients/${p.patient_id}/risk?minute=${minute}`);
  const rec = useFetch<Recommendations>(`/api/patients/${p.patient_id}/recommendations?minute=${minute}`);
  const r = rk.data;
  const tr = r ? trend(r.slope) : null;
  const gs = r ? glucoseState(r.glucose) : null;
  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-[var(--brand)]" />{label}
    </label>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <Card title="Glucose and the twin's 2-hour forecast"
          subtitle={tl.data ? `As of ${fmtDateTime(tl.data.time)} · forecast assumes no new food (meals enter via the what-if simulator) · band = 90 % conformal interval · green zone = target 70–180 mg/dL` : ""}
          right={
            <div className="flex items-center gap-1">
              {[6, 12, 24].map((h) => (
                <button key={h} onClick={() => setHours(h)} className={clsx("rounded px-2 py-0.5 text-xs", hours === h ? "bg-brandsoft font-semibold text-brand" : "text-ink2 hover:bg-page")}>{h} h</button>
              ))}
            </div>
          }>
          <div className={clsx(tl.loading && "refetching")}>
            {tl.data ? <GlucoseChart tl={tl.data} showFuture={showFuture} showTrack={showTrack} showTwin={showTwin} /> : <div className="h-[300px]" />}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Legend items={[
              { label: "CGM glucose", color: "var(--s1)" }, { label: "Twin forecast (no new food)", color: "var(--s2)" }, { label: "90 % interval", color: "var(--s2)", band: true },
              ...(showTrack ? [{ label: "Forecast made 60 min earlier", color: "var(--s3)", dash: true }] : []),
              ...(showTwin ? [{ label: "Physiology only", color: "var(--ink-2)", dash: true }] : []),
            ]} />
            <div className="flex flex-wrap gap-3">
              {toggle(showTrack, setShowTrack, "Forecast track record")}
              {toggle(showTwin, setShowTwin, "Physiology-only path")}
              {toggle(showFuture, setShowFuture, "Reveal what happened")}
            </div>
          </div>
        </Card>
        <Card title="Wearable streams" subtitle="Smartwatch data fused into the twin (same time axis as above)">
          {tl.data ? <WearableStrips tl={tl.data} /> : <div className="h-48" />}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <RecCard rec={rec.data} loading={rec.loading} />
          <PhenotypeCard p={p} />
        </div>
      </div>

      <div className="space-y-4">
        <Card title="Right now">
          {r && tr && gs ? (
            <div className={clsx(rk.loading && "refetching")}>
              <div className="flex items-end gap-3">
                <div className="text-4xl font-semibold leading-none">{Math.round(r.glucose)}</div>
                <div className="pb-0.5 text-sm text-ink2">mg/dL <span className="text-lg">{tr.arrow}</span> {tr.label}</div>
              </div>
              <div className="mt-1 text-xs font-medium" style={{ color: gs.color }}>● {gs.label}</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {["30", "60", "120"].map((h) => (
                  <div key={h} className="rounded-lg bg-page px-2 py-1.5">
                    <div className="text-[11px] text-muted">in {h} min*</div>
                    <div className="tnum text-lg font-semibold">{Math.round(r.forecast[h].pred)}</div>
                    <div className="tnum text-[10px] text-ink2">{Math.round(r.forecast[h].lo)}–{Math.round(r.forecast[h].hi)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-muted">* expected if no new food is eaten; range = 90 % interval</div>
              <div className="mt-3 space-y-2">
                <RiskMeter label="Hyperglycaemia >180 within 2 h" p={r.probabilities.hyper_2h} color="var(--serious)" />
                <RiskMeter label="Hypoglycaemia <70 within 1 h" p={r.probabilities.hypo_1h} color="var(--critical)" />
                <RiskMeter label="Spike +50 mg/dL within 2 h" p={r.probabilities.spike_2h} color="var(--warning)" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink2">
                <div className="flex items-center gap-1.5"><Utensils size={13} /> {r.context.minutes_since_meal != null && r.context.minutes_since_meal < 700 ? `${Math.round(r.context.minutes_since_meal)} min since meal` : "No recent meal"}</div>
                <div className="flex items-center gap-1.5"><Info size={13} /> Gut: ~{num(r.context.gut_carbs)} g carbs</div>
                <div className="flex items-center gap-1.5"><Moon size={13} /> Slept {num(r.context.sleep_last_h, 1)} h</div>
                <div className="flex items-center gap-1.5"><Footprints size={13} /> {num(r.context.steps_today)} steps today</div>
              </div>
            </div>
          ) : <div className="h-60" />}
        </Card>
        {r && r.alerts.length === 0 && (
          <Card title="Alerts"><div className="text-sm text-ink2">No alert: the twin predicts glucose stays in range for the next 2 hours.</div></Card>
        )}
        {r?.alerts.map((a, i) => <AlertCard key={i} a={a} />)}
      </div>
    </div>
  );
}

function AlertCard({ a }: { a: Alert }) {
  const urgent = a.severity === "urgent";
  const Icon = urgent ? AlertOctagon : a.severity === "warning" ? AlertTriangle : Info;
  const color = urgent ? "var(--critical)" : a.severity === "warning" ? "var(--serious)" : "var(--s1)";
  return (
    <section className="card overflow-hidden" style={{ borderColor: color }}>
      <div className="flex items-start gap-2 px-4 py-3" style={{ background: `color-mix(in srgb, ${color} 9%, transparent)` }}>
        <Icon size={18} style={{ color }} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>{urgent ? "Urgent" : a.severity === "warning" ? "Warning" : "Heads-up"} · {Math.round(a.probability * 100)}% probability</div>
          <div className="text-sm font-semibold text-ink">{a.title}</div>
          {a.predicted_peak != null && <div className="text-xs text-ink2">Predicted peak {Math.round(a.predicted_peak)} mg/dL</div>}
          {a.predicted_min != null && <div className="text-xs text-ink2">Predicted minimum {Math.round(a.predicted_min)} mg/dL</div>}
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-ink">Why the twin thinks so</div>
          <ul className="space-y-1">
            {a.drivers.map((d) => (
              <li key={d.feature} className="flex items-start gap-2 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.impact > 0 ? color : "var(--axis)" }} />
                <span className="text-ink">{d.text}</span><span className="ml-auto shrink-0 text-muted">{d.direction}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-ink">Evidence by data stream</div>
          <StreamBar streams={a.streams} />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-ink">Suggested actions</div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink2">{a.actions.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}

function RecCard({ rec, loading }: { rec: Recommendations | null; loading: boolean }) {
  return (
    <Card title="Best next action (twin-simulated)" subtitle={rec ? `Compared with: ${rec.baseline.label} · peak ${Math.round(rec.baseline.peak)} mg/dL, ${rec.baseline.time_above_180_min} min >180` : ""}>
      {rec ? (
        <ul className={clsx("divide-y", loading && "refetching")}>
          {rec.recommendations.slice(0, 5).map((r, i) => {
            const hypo = r.kind === "hypo";
            const delta = hypo ? r.delta_tbr_min : r.delta_tar_min;
            return (
              <li key={r.label} className="flex items-center gap-3 py-2">
                <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i === 0 ? "bg-brand text-onbrand" : "bg-page text-ink2")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{r.label}</div>
                  <div className="text-xs text-ink2">
                    {hypo ? `lowest ${Math.round(r.min)} mg/dL` : `peak ${Math.round(r.peak)} mg/dL (${r.delta_peak > 0 ? "+" : ""}${Math.round(r.delta_peak)})`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-sm font-semibold" style={{ color: delta < 0 ? "var(--good-ink)" : "var(--ink-2)" }}>{delta > 0 ? "+" : ""}{delta} min</div>
                  <div className="text-[10px] text-muted">{hypo ? "below 70" : "above 180"}</div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <div className="h-40" />}
      <p className="mt-2 text-[11px] text-muted">Counterfactuals from the personalised physiology, anchored to the ML forecast. Model estimates, not observed outcomes.</p>
    </Card>
  );
}
