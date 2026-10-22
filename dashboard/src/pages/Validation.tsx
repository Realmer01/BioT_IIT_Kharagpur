import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, Legend, Note, PageHeader } from "../components/ui";
import { useFetch } from "../lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const H = ["30", "60", "90", "120"];
const MAIN = "MadhuTwin hybrid";

export default function Validation() {
  const { data } = useFetch<Any>("/api/validation");
  if (!data?.metrics_cgmacros) return <div className="py-20 text-center text-muted">Loading validation…</div>;
  const m = data.metrics_cgmacros;
  const reg = m.regression;
  const rm = (name: string, h: string) => reg[name]?.[h]?.rmse;
  const gain = 1 - rm(MAIN, "120") / rm("Persistence", "120");
  const ev = m.events.ev_hyper[MAIN];
  const ep = m.episodes[MAIN];
  const cov = m.intervals["120"];
  return (
    <div className="space-y-5">
      <PageHeader title="Validation" meta={`CGMacros (PhysioNet) · ${m.dataset.participants} adults · five-fold leave-patients-out · ${m.dataset.test_rows.toLocaleString()} forecasts on unseen patients`} />
      <p className="max-w-4xl text-[13.5px] leading-relaxed text-ink2">
        {m.dataset.participants} adults ({m.dataset.groups.normal} normoglycaemic, {m.dataset.groups.prediabetes} with prediabetes, {m.dataset.groups.t2d} with type 2 diabetes)
        wore a CGM and a Fitbit and logged meals and labs. The machine-learning layer never sees a test patient, and each test patient's twin is personalised
        only on their first days. Every figure below comes from the later, unseen monitoring period ({Math.round(m.dataset.monitored_days)} patient-days).
      </p>
      <Card title="Key results" divider pad={false}>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead><tr><th className="pl-4">Measure</th><th className="num">MadhuTwin</th><th className="num">Comparator</th><th className="pr-4">Note</th></tr></thead>
            <tbody>
              <tr><td className="pl-4 text-ink">Two-hour forecast error (RMSE)</td><td className="num font-semibold text-ink">{rm(MAIN, "120").toFixed(1)} mg/dL</td>
                <td className="num text-ink2">{rm("Persistence", "120").toFixed(1)} mg/dL, persistence</td><td className="pr-4 text-ink2">{(gain * 100).toFixed(0)} % lower error</td></tr>
              <tr><td className="pl-4 text-ink">Clinically acceptable two-hour forecasts (Clarke A+B)</td><td className="num font-semibold text-ink">{reg[MAIN]["120"].clarke_ab.toFixed(1)} %</td>
                <td className="num text-ink2">{reg.Persistence["120"].clarke_ab.toFixed(1)} %, persistence</td><td className="pr-4 text-ink2">zone A alone {reg[MAIN]["120"].clarke_a.toFixed(1)} %</td></tr>
              <tr><td className="pl-4 text-ink">Hyperglycaemia early warning (AUROC)</td><td className="num font-semibold text-ink">{ev.auroc.toFixed(2)}</td>
                <td className="num text-ink2">{m.events.ev_hyper["EHR only"].auroc.toFixed(2)}, record only</td>
                <td className="pr-4 text-ink2">{(ep.episode_sensitivity * 100).toFixed(0)} % of episodes flagged at least 15 min ahead; median lead {Math.round(ep.median_lead_min)} min</td></tr>
              <tr><td className="pl-4 text-ink">Coverage of the 90 % prediction interval at two hours</td><td className="num font-semibold text-ink">{(cov.coverage * 100).toFixed(1)} %</td>
                <td className="num text-ink2">90 % nominal</td><td className="pr-4 text-ink2">calibrated by conformal quantile regression</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <HorizonCard reg={reg} cond={m.regression_conditional} />
        <AblationCard m={m} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ClarkeCard pts={data.clarke_sample?.["120"] ?? []} reg={reg[MAIN]["120"]} />
        <WarningCard m={m} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <MealCard m={m} pts={data.ppgr_sample ?? []} />
        {data.twin_value && <ColdStartCard tv={data.twin_value} />}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <PhysiologyCard m={m} />
        {data.metrics_bharat && <SyntheticCard b={data.metrics_bharat} />}
      </div>
      <Card title="Limitations">
        <ul className="bullets grid gap-x-8 gap-y-1.5 text-[13px] leading-relaxed text-ink2 md:grid-cols-2">
          <li>The real cohort is small (45 adults, ~10 days each) and from the USA; Indian validation with prospective data is the next step.</li>
          <li>On rolling forecasts, adding the twin's features to the ML layer did not measurably improve accuracy over the best fusion model; the twin's value is counterfactual simulation, interpretable physiology, day-zero personalisation from the EHR and better meal-response prediction.</li>
          <li>Static EHR features add little to short-term forecasts once CGM is available; their benefit appears through the twin's prior (cold start) and in baseline risk (EHR-only AUROC {m.events.ev_hyper["EHR only"].auroc.toFixed(2)}).</li>
          <li>Hypoglycaemia is rare in CGMacros (prevalence {(m.events.ev_hypo["CGM only"].prevalence * 100).toFixed(2)} % of moments); hypoglycaemia performance is therefore also shown on the synthetic Bharat cohort, clearly labelled.</li>
          <li>Meal macros in CGMacros are self-estimated; carbohydrate counting error limits meal-response accuracy, as in real-world logging.</li>
          <li>Decision support only: alerts and simulations require clinician judgement and are not a regulated medical device.</li>
        </ul>
      </Card>
    </div>
  );
}

function HorizonCard({ reg, cond }: { reg: Any; cond?: Any }) {
  const series = [
    { name: MAIN, color: "var(--s1)", w: 2.5 },
    { name: "Fusion (streams + EHR)", color: "var(--s2)", w: 2 },
    { name: "Twin only (physiology)", color: "var(--s3)", w: 2 },
    { name: "Persistence", color: "var(--muted)", w: 2 },
  ];
  const rows = H.map((h) => ({ h: Number(h), ...Object.fromEntries(series.map((s) => [s.name, reg[s.name][h].rmse])) }));
  const all = Object.keys(reg);
  // vertical pixel offsets so end labels never collide
  const dy: Record<string, number> = {};
  [...series].sort((a, b) => reg[b.name]["120"].rmse - reg[a.name]["120"].rmse).reduce((prev, s) => {
    const v = reg[s.name]["120"].rmse;
    const off = prev && prev.v - v < 2 ? prev.off + 12 : 0;
    dy[s.name] = off;
    return { v, off };
  }, null as null | { v: number; off: number });
  return (
    <Card title="Figure 1. Forecast error by horizon" subtitle="RMSE on unseen patients, lower is better; the table lists every model">
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={rows} margin={{ top: 8, right: 70, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="h" type="number" domain={[30, 120]} ticks={[30, 60, 90, 120]} tickFormatter={(v) => `${v} min`} stroke="var(--axis)" tickLine={false} />
          <YAxis domain={[0, "auto"]} stroke="var(--axis)" tickLine={false} width={44} unit="" />
          {series.map((s) => (
            <Line key={s.name} dataKey={s.name} stroke={s.color} strokeWidth={s.w} dot={{ r: 4, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false}>
              <LabelList dataKey={s.name} content={(p: Any) => p.index === 3 ? <text x={p.x + 8} y={p.y + 4 + dy[s.name]} fontSize={11} fill={s.color === "var(--muted)" ? "var(--ink-2)" : s.color}>{Number(p.value).toFixed(1)}</text> : null} />
            </Line>
          ))}
          <Tooltip formatter={(v: number) => `${v.toFixed(1)} mg/dL`} labelFormatter={(l) => `+${l} min`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-pop)" }} />
        </LineChart>
      </ResponsiveContainer>
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
      <div className="-mx-4 mt-4 overflow-x-auto border-y">
        <table className="data-table text-xs">
          <thead><tr><th className="pl-4">Model</th>{H.map((h) => <th key={h} className="num">{h} min</th>)}<th className="num pr-4">Clarke A+B, 2 h</th></tr></thead>
          <tbody>{all.map((n) => (
            <tr key={n} className={n === MAIN ? "font-semibold text-ink" : "text-ink2"}><td className="py-1.5 pl-4">{n}</td>{H.map((h) => <td key={h} className="num py-1.5">{reg[n][h].rmse.toFixed(1)}</td>)}<td className="num py-1.5 pr-4">{reg[n]["120"].clarke_ab.toFixed(1)}%</td></tr>
          ))}</tbody>
        </table>
      </div>
      {cond && (
        <div className="mt-4"><Note label="Deployed forecaster.">
          Conditional on no new food and scored on meal-free windows:{" "}
          2-hour RMSE {cond[`${MAIN} [conditional]`]["120"].rmse.toFixed(1)} vs {cond.Persistence["120"].rmse.toFixed(1)} mg/dL for persistence
          and {cond["Fusion (streams + EHR)"]["120"].rmse.toFixed(1)} for the unconditional fusion model. New meals are added by the twin's simulation.
        </Note></div>
      )}
    </Card>
  );
}

function AblationCard({ m }: { m: Any }) {
  const sets = ["EHR only", "CGM only", "Wearable streams", "Fusion (streams + EHR)", MAIN];
  const auc = sets.map((s) => ({ s, v: m.events.ev_hyper[s].auroc }));
  const rmse = sets.slice(1).map((s) => ({ s, v: m.regression[s === "Wearable streams" ? s : s]["60"].rmse }));
  const bar = (rows: { s: string; v: number }[], fmt: (v: number) => string, domain: [number, number]) => (
    <ResponsiveContainer width="100%" height={rows.length * 30 + 10}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" domain={domain} hide />
        <YAxis type="category" dataKey="s" width={150} tick={{ fontSize: 11, fill: "var(--ink-2)" }} axisLine={false} tickLine={false} />
        <Bar dataKey="v" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.s} fill={r.s === MAIN ? "var(--s1)" : "var(--axis)"} />)}
          <LabelList dataKey="v" position="right" formatter={fmt} style={{ fontSize: 11, fill: "var(--ink)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  return (
    <Card title="Figure 2. What each data stream adds" subtitle="Same patients and rows; only the inputs change">
      <div className="label mb-1">Hyperglycaemia-onset prediction, AUROC (higher is better)</div>
      {bar(auc, (v) => v.toFixed(3), [0.5, 0.9])}
      <div className="label mb-1 mt-3">One-hour forecast RMSE, mg/dL (lower is better)</div>
      {bar(rmse, (v) => v.toFixed(1), [0, 30])}
      <p className="mt-2 text-xs text-ink2">The static record alone identifies who is at risk (AUROC {auc[0].v.toFixed(2)}); live streams decide <i>when</i>. Fusing both gives the best early warning, and the twin layer keeps accuracy while adding simulation and physiology.</p>
    </Card>
  );
}

const CLARKE: [number, number, number, number][] = [
  [0, 70, 175 / 3, 70], [175 / 3, 70, 400 / 1.2, 400], [70, 84, 70, 400], [0, 180, 70, 180], [70, 180, 290, 400],
  [70, 0, 70, 56], [70, 56, 400, 320], [180, 0, 180, 70], [180, 70, 400, 70], [240, 70, 240, 180], [240, 180, 400, 180], [130, 0, 180, 70],
];

function ClarkeCard({ pts, reg }: { pts: number[][]; reg: Any }) {
  const data = useMemo(() => pts.map(([y, p]) => ({ x: Math.min(y, 400), y: Math.min(Math.max(p, 0), 400) })), [pts]);
  return (
    <Card title="Figure 3. Clarke error grid, two-hour forecasts" subtitle={`Random sample of ${data.length.toLocaleString()} forecasts from unseen patients · zone A ${reg.clarke_a.toFixed(1)} %, A+B ${reg.clarke_ab.toFixed(1)} %`}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" domain={[0, 400]} ticks={[0, 70, 180, 250, 400]} stroke="var(--axis)" tickLine={false}
            label={{ value: "Actual glucose (mg/dL)", position: "insideBottom", offset: -8, fontSize: 11, fill: "var(--muted)" }} />
          <YAxis type="number" dataKey="y" domain={[0, 400]} ticks={[0, 70, 180, 250, 400]} stroke="var(--axis)" tickLine={false} width={64}
            label={{ value: "Predicted 2 h ahead", angle: -90, position: "insideLeft", offset: 2, fontSize: 11, fill: "var(--muted)", style: { textAnchor: "middle" } }} />
          <ZAxis range={[10, 10]} />
          {CLARKE.map(([x1, y1, x2, y2], i) => <ReferenceLine key={i} segment={[{ x: x1, y: y1 }, { x: x2, y: y2 }]} stroke="var(--ink-2)" strokeWidth={1} ifOverflow="hidden" />)}
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 400, y: 400 }]} stroke="var(--axis)" strokeDasharray="3 3" />
          <Scatter data={data} fill="var(--s1)" fillOpacity={0.35} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-xs text-ink2">Zone A: clinically accurate; B: benign errors; C–E: errors that could lead to wrong treatment.</p>
    </Card>
  );
}

function WarningCard({ m }: { m: Any }) {
  const sets = ["EHR only", "CGM only", "Wearable streams", "Fusion (streams + EHR)", MAIN];
  return (
    <Card title="Table 1. Early warning of hyperglycaemia above 180 mg/dL" subtitle="Episode-level evaluation on unseen patients; alert threshold 0.5">
      <div className="-mx-4 overflow-x-auto border-y">
      <table className="data-table text-xs [&_td]:px-2.5 [&_th]:px-2.5">
        <thead><tr>
          <th className="!pl-4">Inputs</th><th className="num">AUROC</th><th className="num">AUPRC</th>
          <th className="num">Flagged ≥15 min</th><th className="num">Median lead</th><th className="num !pr-4">False/day</th>
        </tr></thead>
        <tbody>{sets.map((s) => {
          const e = m.events.ev_hyper[s]; const p = m.episodes[s];
          return (
            <tr key={s} className={s === MAIN ? "font-semibold text-ink" : "text-ink2"}>
              <td className="!pl-4">{s}</td><td className="num">{e.auroc.toFixed(3)}</td><td className="num">{e.auprc.toFixed(3)}</td>
              <td className="num">{(p.episode_sensitivity * 100).toFixed(0)}%</td><td className="num">{Math.round(p.median_lead_min)} min</td>
              <td className="num !pr-4">{p.false_alerts_per_day.toFixed(2)}</td>
            </tr>
          );
        })}</tbody>
      </table>
      </div>
      <div className="mt-4 grid gap-px overflow-hidden rounded border bg-[var(--border)] sm:grid-cols-3">
        {["ev_spike", "ev_hypo"].map((k) => (
          <div key={k} className="bg-card px-3.5 py-2.5">
            <div className="text-xs text-muted">{k === "ev_spike" ? "Spike of +50 mg/dL in 2 h" : "Hypoglycaemia below 70 in 1 h"}</div>
            <div className="mt-0.5 text-[18px] font-semibold leading-tight text-ink">{m.events[k][MAIN].auroc.toFixed(2)} <span className="text-xs font-normal text-muted">AUROC</span></div>
          </div>
        ))}
        <div className="bg-card px-3.5 py-2.5">
          <div className="text-xs text-muted">90 % interval coverage</div>
          <div className="mt-0.5 whitespace-nowrap text-[18px] font-semibold leading-tight text-ink">{H.map((h) => (m.intervals[h].coverage * 100).toFixed(0)).join(" · ")}<span className="text-xs font-normal text-muted"> %</span></div>
          <div className="text-[11px] text-muted">at 30 · 60 · 90 · 120 min</div>
        </div>
      </div>
    </Card>
  );
}

function MealCard({ m, pts }: { m: Any; pts: number[][] }) {
  const models = m.meal_ppgr.models;
  const rows = Object.entries(models).map(([k, v]: Any) => ({ s: k, v: v.pearson_r }));
  const sc = pts.map(([y, p]) => ({ x: y, y: p }));
  return (
    <Card title="Figure 4. Personal meal-response prediction" subtitle={`Peak glucose rise within 2 h of ${m.meal_ppgr.n_meals_test} unseen meals (cf. Zeevi et al., Cell 2015)`}>
      <div className="grid gap-3 md:grid-cols-2">
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 14, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis type="number" dataKey="x" stroke="var(--axis)" tickLine={false} label={{ value: "Actual rise", position: "insideBottom", offset: -8, fontSize: 11, fill: "var(--muted)" }} />
            <YAxis type="number" dataKey="y" stroke="var(--axis)" tickLine={false} width={56} label={{ value: "Predicted", angle: -90, position: "insideLeft", offset: 2, fontSize: 11, fill: "var(--muted)", style: { textAnchor: "middle" } }} />
            <ZAxis range={[14, 14]} />
            <Scatter data={sc} fill="var(--s1)" fillOpacity={0.45} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
        <div>
          <div className="label mb-1">Pearson r, predicted against actual</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={6}>
              <XAxis type="number" domain={[-0.2, 0.8]} hide />
              <YAxis type="category" dataKey="s" width={130} tick={{ fontSize: 11, fill: "var(--ink-2)" }} axisLine={false} tickLine={false} />
              <ReferenceLine x={0} stroke="var(--axis)" />
              <Bar dataKey="v" radius={4} isAnimationActive={false}>
                {rows.map((r) => <Cell key={r.s} fill={r.s === MAIN ? "var(--s1)" : "var(--axis)"} />)}
                <LabelList dataKey="v" content={(p: Any) => <text x={Math.max(p.x, p.x + p.width) + 6} y={p.y + p.height / 2 + 4} fontSize={11} fill="var(--ink)">{Number(p.value).toFixed(2)}</text>} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-ink2">Carbohydrate count alone does not predict an individual's response; the personalised twin plus streams does.</p>
        </div>
      </div>
    </Card>
  );
}

function ColdStartCard({ tv }: { tv: Any }) {
  const t = tv.cold_start.table;
  const days = [0, 0.5, 1, 2, 4];
  const rows = days.map((d) => ({ d, ehr: t[`EHR prior|${d.toFixed(1)}`]?.rmse_120, pop: t[`Population prior|${d.toFixed(1)}`]?.rmse_120 }));
  return (
    <Card title="Figure 5. Day-zero personalisation from the health record" subtitle="Twin-only 2-hour RMSE on later days vs days of onboarding data">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 8, right: 40, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="d" type="number" domain={[0, 4]} ticks={days} tickFormatter={(v) => `${v} d`} stroke="var(--axis)" tickLine={false} />
          <YAxis domain={[25, "auto"]} stroke="var(--axis)" tickLine={false} width={44} />
          <Line dataKey="ehr" name="EHR-informed prior" stroke="var(--s1)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--s1)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          <Line dataKey="pop" name="Population prior" stroke="var(--s2)" strokeWidth={2} dot={{ r: 4, fill: "var(--s2)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          <Tooltip formatter={(v: number) => `${v.toFixed(1)} mg/dL`} labelFormatter={(l) => `${l} days of onboarding data`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "var(--shadow-pop)" }} />
        </LineChart>
      </ResponsiveContainer>
      <Legend items={[{ label: "EHR-informed prior", color: "var(--s1)" }, { label: "Population prior", color: "var(--s2)" }]} />
      <p className="mt-2 text-xs text-ink2">Before any sensor data, the EHR prior cuts 2-hour error by {((1 - rows[0].ehr / rows[0].pop) * 100).toFixed(0)} % ({rows[0].pop?.toFixed(1)} → {rows[0].ehr?.toFixed(1)} mg/dL). After about a day of CGM the streams dominate: the record makes the twin usable from day one, the wearables make it personal.</p>
    </Card>
  );
}

function PhysiologyCard({ m }: { m: Any }) {
  const t = m.twin;
  const items = [
    ["Twin insulin sensitivity vs HOMA-IR", t.si_vs_homa_ir_spearman],
    ["Twin disposition index vs HbA1c", t.di_vs_hba1c_spearman],
    ["Twin basal glucose vs lab fasting glucose", t.gb_vs_fpg_spearman],
  ];
  return (
    <Card title="Table 2. Plausibility of the personalised physiology" subtitle="Spearman correlation across the 45 real participants (sign as physiology predicts)">
      <ul className="space-y-2">
        {items.map(([k, v]) => (
          <li key={k as string} className="flex items-center justify-between border-b border-[var(--grid)] py-2 text-[13px] last:border-0">
            <span className="text-ink2">{k}</span><span className="font-semibold text-ink">ρ = {(v as number).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {["30", "60", "90", "120"].map((h) => (
          <div key={h} className="rounded border px-2 py-2">
            <div className="text-[11px] text-muted">{h} min</div>
            <div className="mt-0.5 text-[13px]"><span className="text-faint line-through">{t.prior_rmse[h].toFixed(0)}</span> <span className="text-faint">→</span> <b className="text-ink">{t.personalised_rmse[h].toFixed(0)}</b></div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink2">Personalisation (onboarding fit) lowers the physiology-only forecast error from the EHR-prior twin to the personalised twin (mg/dL). The priors use HOMA-IR and fasting glucose, so the correlations partly reflect the prior by design.</p>
    </Card>
  );
}

function SyntheticCard({ b }: { b: Any }) {
  const r = b.regression;
  const hy = b.episodes_hypo_by_threshold?.["0.25"] ?? b.episodes_hypo?.[MAIN];
  return (
    <Card title="Table 3. Synthetic Indian cohort (Bharat)" subtitle={`${b.n_patients} fictional Indian patients, held out by fold; adds sulfonylurea/insulin hypoglycaemia, sleep and step streams`}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border bg-[var(--border)]">
        <Mini label="2-h RMSE" v={`${r[MAIN]["120"].rmse.toFixed(1)}`} s={`persistence ${r.Persistence["120"].rmse.toFixed(1)}`} />
        <Mini label="Hypo AUROC (1 h)" v={b.events.ev_hypo[MAIN].auroc?.toFixed(2)} s={`prevalence ${(b.events.ev_hypo[MAIN].prevalence * 100).toFixed(1)} %`} />
        <Mini label="Hypo episodes flagged ≥10 min ahead (alert ≥25 %)" v={hy ? `${(hy.episode_sensitivity * 100).toFixed(0)} %` : "–"} s={hy ? `${hy.detected_ge15min}/${hy.episodes} · lead ${Math.round(hy.median_lead_min)} min · ${hy.false_alerts_per_day.toFixed(2)} false/day` : ""} />
        <Mini label="Hyper AUROC (2 h)" v={b.events.ev_hyper[MAIN].auroc.toFixed(2)} s={`interval coverage ${(b.intervals["120"].coverage * 100).toFixed(0)} %`} />
      </div>
      <p className="mt-2 text-xs text-ink2">Synthetic results test the pipeline on Indian diets and drug mixes; they are not evidence of real-world accuracy and are never mixed with the real-data numbers.</p>
    </Card>
  );
}

function Mini({ label, v, s }: { label: string; v?: string; s?: string }) {
  return <div className="bg-card px-3.5 py-2.5"><div className="text-xs leading-snug text-muted">{label}</div><div className="mt-1 text-[18px] font-semibold leading-tight text-ink">{v}</div><div className="mt-0.5 text-xs leading-snug text-muted">{s}</div></div>;
}
