import clsx from "clsx";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getJSON, postJSON, type Food, type Patient, type Recommendations, type WhatIf } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { fmtDateTime, fmtTime } from "../../lib/format";
import { Card } from "../ui";

interface Sc {
  label: string; food: string; portion: number; mealMin: number; walk: number; walkStart: number; walkMets: number;
  sleep: number | null; drug: string;
}
const DRUGS: Record<string, { label: string; add?: object; remove?: string }> = {
  none: { label: "No change" },
  met: { label: "Add metformin 1000 mg", add: { drug: "Metformin", class: "biguanide", daily_dose_mg: 1000 } },
  dpp4: { label: "Add teneligliptin 20 mg (DPP-4i)", add: { drug: "Teneligliptin", class: "dpp4", daily_dose_mg: 20 } },
  sglt2: { label: "Add dapagliflozin 10 mg (SGLT2i)", add: { drug: "Dapagliflozin", class: "sglt2", daily_dose_mg: 10 } },
  agi: { label: "Add voglibose 0.2 mg tid (AGI)", add: { drug: "Voglibose", class: "agi", daily_dose_mg: 0.6 } },
  stop_su: { label: "Stop sulfonylurea", remove: "sulfonylurea" },
};
const COLORS = ["var(--ink-2)", "var(--s1)", "var(--s2)", "var(--s3)"];

function slotFor(hour: number) { return hour < 10.5 ? "breakfast" : hour < 16 ? "lunch" : "dinner"; }

export default function WhatIfTab({ p }: { p: Patient }) {
  const { minute, timeOf } = useClock();
  const [foods, setFoods] = useState<Food[]>([]);
  const [sc, setSc] = useState<Sc[]>([]);
  const [res, setRes] = useState<WhatIf | null>(null);
  const [busy, setBusy] = useState(false);
  const hour = timeOf(minute).getHours() + timeOf(minute).getMinutes() / 60;
  const slot = slotFor(hour);
  const region = String(p.lifestyle.diet_region ?? "S");

  useEffect(() => { getJSON<Food[]>("/api/foods").then(setFoods); }, []);
  const options = useMemo(() => foods.filter((f) => f.slots.some((s) => ["breakfast", "lunch", "dinner", "snack", "sweet"].includes(s))), [foods]);

  useEffect(() => {
    if (!foods.length) return;
    const local = foods.filter((f) => f.slots.includes(slot) && (f.regions.includes(region) || f.regions.includes("all")));
    const def = local.sort((a, b) => b.carbs * b.gi - a.carbs * a.gi)[0]?.id ?? "rice_sambar";
    const base: Sc = { label: "Planned", food: def, portion: 1, mealMin: 15, walk: 0, walkStart: 35, walkMets: 4, sleep: null, drug: "none" };
    setSc([base, { ...base, label: "With 15-min walk", walk: 15 }]);
  }, [foods, slot, region]);

  useEffect(() => {
    if (!sc.length) return;
    const t = setTimeout(() => {
      setBusy(true);
      postJSON<WhatIf>(`/api/patients/${p.patient_id}/whatif`, {
        minute, horizon: 240,
        scenarios: sc.map((s) => ({
          label: s.label,
          meals: s.food ? [{ minute: s.mealMin, food_id: s.food, portion: s.portion }] : [],
          activity: s.walk ? [{ minute: s.walkStart, duration: s.walk, mets: s.walkMets }] : [],
          sleep_hours: s.sleep, add_drug: DRUGS[s.drug].add ?? null, remove_class: DRUGS[s.drug].remove ?? null,
        })),
      }).then(setRes).finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [sc, minute, p.patient_id]);

  const [sugg, setSugg] = useState<Recommendations | null>(null);
  const suggest = () => getJSON<Recommendations>(`/api/patients/${p.patient_id}/recommendations?minute=${minute}`).then(setSugg);
  useEffect(() => setSugg(null), [minute]);

  const set = (i: number, patch: Partial<Sc>) => setSc((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const rows = useMemo(() => {
    if (!res) return [];
    return res.scenarios[0].curve.map((pt, k) => {
      const r: Record<string, number> = { m: pt.minute };
      res.scenarios.forEach((s, j) => (r[`s${j}`] = s.curve[k].g));
      return r;
    });
  }, [res]);
  const base = res?.scenarios[0];

  return (
    <div className="space-y-4">
      <Card title="What-if simulator" subtitle={`Simulate the next 4 hours from ${fmtDateTime(timeOf(minute))} on this patient's personalised twin. Baseline + up to 3 alternatives.`}
        right={<button onClick={suggest} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-page"><Wand2 size={13} />Twin suggestions</button>}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sc.map((s, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} className="w-full bg-transparent text-sm font-semibold outline-none" />
                {i > 0 && <button onClick={() => setSc((x) => x.filter((_, j) => j !== i))} className="text-muted hover:text-critical" title="Remove"><Trash2 size={14} /></button>}
              </div>
              <label className="block text-[11px] text-muted">Meal</label>
              <select value={s.food} onChange={(e) => set(i, { food: e.target.value })} className="mb-2 w-full rounded border bg-card px-1.5 py-1 text-xs">
                <option value="">No meal</option>
                {options.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.carbs} g carbs · GI {f.gi}</option>)}
              </select>
              <Slider label="Portion" v={s.portion} min={0.5} max={1.5} step={0.25} fmt={(v) => `${v}×`} on={(v) => set(i, { portion: v })} />
              <Slider label="Meal starts in" v={s.mealMin} min={0} max={180} step={5} fmt={(v) => `${v} min`} on={(v) => set(i, { mealMin: v })} />
              <label className="block text-[11px] text-muted">Walk</label>
              <div className="mb-2 flex gap-1">
                {[0, 10, 15, 30].map((w) => (
                  <button key={w} onClick={() => set(i, { walk: w })} className={clsx("flex-1 rounded border py-0.5 text-xs", s.walk === w ? "border-brand bg-brandsoft font-semibold text-brand" : "text-ink2")}>{w ? `${w}m` : "None"}</button>
                ))}
              </div>
              {s.walk > 0 && <Slider label="Walk starts in" v={s.walkStart} min={0} max={200} step={5} fmt={(v) => `${v} min`} on={(v) => set(i, { walkStart: v })} />}
              <Slider label="Sleep last night" v={s.sleep ?? 7} min={4} max={9} step={0.5} fmt={(v) => (s.sleep == null ? "as recorded" : `${v} h`)} on={(v) => set(i, { sleep: v })} />
              <label className="block text-[11px] text-muted">Medication</label>
              <select value={s.drug} onChange={(e) => set(i, { drug: e.target.value })} className="w-full rounded border bg-card px-1.5 py-1 text-xs">
                {Object.entries(DRUGS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            </div>
          ))}
          {sc.length < 4 && (
            <button onClick={() => setSc((x) => [...x, { ...x[0], label: `Alternative ${x.length}` }])}
              className="flex min-h-[120px] items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-ink2 hover:border-brand hover:text-brand">
              <Plus size={16} />Add alternative
            </button>
          )}
        </div>
      </Card>

      {sugg && (
        <Card title="Twin suggestions" subtitle={`Auto-evaluated interventions, ranked · compared with: ${sugg.baseline.label}`}
          right={<button onClick={() => setSugg(null)} className="text-xs text-muted hover:text-ink">Close</button>}>
          <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sugg.recommendations.slice(0, 6).map((r, i) => {
              const hypo = r.kind === "hypo";
              const d = hypo ? r.delta_tbr_min : r.delta_tar_min;
              return (
                <li key={r.label} className="flex items-start gap-2 rounded-lg border px-3 py-2">
                  <span className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", i === 0 ? "bg-brand text-onbrand" : "bg-page text-ink2")}>{i + 1}</span>
                  <div className="text-xs">
                    <div className="font-medium text-ink">{r.label}</div>
                    <div className="text-ink2">{hypo ? `time <70: ${d > 0 ? "+" : ""}${d} min · lowest ${Math.round(r.min)}` : `time >180: ${d > 0 ? "+" : ""}${d} min · peak ${r.delta_peak > 0 ? "+" : ""}${Math.round(r.delta_peak)} mg/dL`}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Card title="Predicted glucose, next 4 hours" subtitle={res?.method}>
        <div className={clsx(busy && "refetching")}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <ReferenceArea y1={70} y2={180} fill="var(--band)" stroke="none" />
              <XAxis dataKey="m" type="number" domain={[0, 240]} ticks={[0, 30, 60, 90, 120, 150, 180, 210, 240]}
                tickFormatter={(v) => fmtTime(timeOf(minute + v))} stroke="var(--axis)" tickLine={false} />
              <YAxis domain={[40, (max: number) => Math.max(250, Math.ceil((max + 20) / 50) * 50)]} stroke="var(--axis)" tickLine={false} width={48} />
              <ReferenceLine y={70} stroke="var(--critical)" />
              <ReferenceLine y={180} stroke="var(--warning)" />
              {res?.scenarios.map((s, j) => (
                <Line key={j} dataKey={`s${j}`} name={s.label} stroke={COLORS[j]} strokeWidth={j === 0 ? 2.5 : 2}
                  strokeDasharray={j === 0 ? "6 4" : undefined} dot={false} isAnimationActive={false} />
              ))}
              <Tooltip content={({ active, payload, label }) => !active || !payload?.length ? null : (
                <div className="card px-3 py-2 text-xs shadow">
                  <div className="mb-1 font-semibold">{fmtTime(timeOf(minute + Number(label)))} (+{label} min)</div>
                  {payload.map((pp: any) => <div key={pp.dataKey} className="flex justify-between gap-4"><span className="text-ink2">{pp.name}</span><b className="tnum">{Math.round(pp.value)}</b></div>)}
                </div>
              )} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {res && base && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Scenario</th><th className="text-right font-medium">Peak</th><th className="text-right font-medium">Lowest</th>
                <th className="text-right font-medium">Time &gt;180</th><th className="text-right font-medium">Time &lt;70</th><th className="text-right font-medium">Mean</th><th className="text-right font-medium">vs baseline</th>
              </tr></thead>
              <tbody>
                {res.scenarios.map((s, j) => {
                  const d = s.time_above_180_min - base.time_above_180_min;
                  return (
                    <tr key={j} className="border-b last:border-0">
                      <td className="py-1.5"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[j] }} />{s.label}</td>
                      <td className="tnum text-right">{Math.round(s.peak)}</td><td className="tnum text-right">{Math.round(s.min)}</td>
                      <td className="tnum text-right">{s.time_above_180_min} min</td><td className="tnum text-right">{s.time_below_70_min} min</td>
                      <td className="tnum text-right">{Math.round(s.mean)}</td>
                      <td className="tnum text-right" style={{ color: j === 0 ? "var(--muted)" : d < 0 ? "var(--good-ink)" : "var(--ink-2)" }}>
                        {j === 0 ? "baseline" : `${d > 0 ? "+" : ""}${d} min >180 · peak ${s.peak - base.peak > 0 ? "+" : ""}${Math.round(s.peak - base.peak)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">Machine learning sets the expected path; the patient's calibrated physiology computes how each change would alter it (counterfactual). Estimates for shared decision-making, not prescriptions.</p>
      </Card>
    </div>
  );
}

function Slider({ label, v, min, max, step, fmt, on }: { label: string; v: number; min: number; max: number; step: number; fmt: (v: number) => string; on: (v: number) => void }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px]"><span className="text-muted">{label}</span><span className="tnum text-ink">{fmt(v)}</span></div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-full" />
    </div>
  );
}
