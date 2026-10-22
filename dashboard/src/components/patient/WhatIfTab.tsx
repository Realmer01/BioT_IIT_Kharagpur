import clsx from "clsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getJSON, postJSON, type Food, type Patient, type Recommendations, type WhatIf } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { fmtDateTime, fmtTime } from "../../lib/format";
import { Card, Legend } from "../ui";

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
    const usual = p.usual_foods?.[slot];
    const def = usual && foods.some((f) => f.id === usual) ? usual : local[0]?.id ?? "rice_sambar";
    const base: Sc = { label: `Usual ${slot}`, food: def, portion: 1, mealMin: 15, walk: 0, walkStart: 35, walkMets: 4, sleep: null, drug: "none" };
    setSc([base, { ...base, label: "With 15-min walk", walk: 15 }]);
  }, [foods, slot, region, p.usual_foods]);

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
  const yMax = useMemo(() => {
    const hi = Math.max(0, ...rows.flatMap((r) => Object.entries(r).filter(([k]) => k !== "m").map(([, v]) => v)));
    return Math.max(250, Math.ceil((hi + 20) / 50) * 50);
  }, [rows]);
  const yTicks = [70, 120, 180, 250, 300, 350, 400, 450, 500, 550, 600].filter((v) => v <= yMax);

  return (
    <div className="space-y-5">
      <Card title="Scenarios" divider pad={false}
        subtitle={`Next four hours from ${fmtDateTime(timeOf(minute))}, simulated on this patient's personalised twin. The first scenario is the baseline.`}
        right={<button onClick={suggest} className="btn-secondary">Suggest scenarios</button>}>
        <div className="flex divide-x overflow-x-auto">
          {sc.map((s, i) => (
            <div key={i} className="min-w-[250px] flex-1 p-4">
              <div className="mb-3 flex items-center gap-2">
                <i className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: COLORS[i] }} />
                <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Scenario name"
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[14px] font-semibold text-ink outline-none hover:border-strong focus:border-brand" />
                {i === 0 ? <span className="text-xs text-muted">Baseline</span>
                  : <button onClick={() => setSc((x) => x.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-criticalink" title="Remove scenario">Remove</button>}
              </div>
              <Field label="Meal">
                <select value={s.food} onChange={(e) => set(i, { food: e.target.value })} className="input input-sm">
                  <option value="">No meal</option>
                  {options.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {(() => { const f = foods.find((x) => x.id === s.food); return f ? <div className="mt-1 text-[11.5px] text-muted">{f.carbs} g carbohydrate · GI {f.gi} · {f.kcal} kcal</div> : null; })()}
              </Field>
              <Slider label="Portion" v={s.portion} min={0.5} max={1.5} step={0.25} fmt={(v) => `${v}×`} on={(v) => set(i, { portion: v })} />
              <Slider label="Meal starts in" v={s.mealMin} min={0} max={180} step={5} fmt={(v) => `${v} min`} on={(v) => set(i, { mealMin: v })} />
              <Field label="Walk, minutes">
                <div className="segmented flex w-full">
                  {[0, 10, 15, 30].map((w) => (
                    <button key={w} type="button" aria-pressed={s.walk === w} onClick={() => set(i, { walk: w })} className="flex-1">{w ? `${w}` : "None"}</button>
                  ))}
                </div>
              </Field>
              {s.walk > 0 && <Slider label="Walk starts in" v={s.walkStart} min={0} max={200} step={5} fmt={(v) => `${v} min`} on={(v) => set(i, { walkStart: v })} />}
              <Slider label="Sleep last night" v={s.sleep ?? 7} min={4} max={9} step={0.5} fmt={(v) => (s.sleep == null ? "as recorded" : `${v} h`)} on={(v) => set(i, { sleep: v })} />
              <Field label="Medication" last>
                <select value={s.drug} onChange={(e) => set(i, { drug: e.target.value })} className="input input-sm">
                  {Object.entries(DRUGS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                </select>
              </Field>
            </div>
          ))}
          {sc.length < 4 && (
            <div className="flex w-[170px] shrink-0 items-center justify-center p-4">
              <button onClick={() => setSc((x) => [...x, { ...x[0], label: `Alternative ${x.length}` }])} className="btn-secondary">Add scenario</button>
            </div>
          )}
        </div>
      </Card>

      {sugg && (
        <Card title="Suggested scenarios" divider pad={false} subtitle={`Evaluated automatically on the twin and ranked against ${sugg.baseline.label.toLowerCase()}`}
          right={<button onClick={() => setSugg(null)} className="btn-ghost h-7 px-2 text-xs">Close</button>}>
          <table className="data-table">
            <thead><tr><th className="w-8 pl-4">#</th><th>Intervention</th><th className="num">Change in time out of range</th><th className="num pr-4">Peak or lowest</th></tr></thead>
            <tbody>
              {sugg.recommendations.slice(0, 6).map((r, i) => {
                const hypo = r.kind === "hypo";
                const d = hypo ? r.delta_tbr_min : r.delta_tar_min;
                return (
                  <tr key={r.label}>
                    <td className="pl-4 text-muted">{i + 1}</td>
                    <td className="text-ink">{r.label}</td>
                    <td className="num" style={{ color: d < 0 ? "var(--good-ink)" : "var(--ink-2)" }}>{d > 0 ? "+" : ""}{d} min {hypo ? "below 70" : "above 180"}</td>
                    <td className="num pr-4 text-ink2">{hypo ? `lowest ${Math.round(r.min)}` : `peak ${r.delta_peak > 0 ? "+" : ""}${Math.round(r.delta_peak)}`} mg/dL</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Predicted glucose, next four hours" subtitle={res?.method}>
        <div className={clsx(busy && "refetching")}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <ReferenceArea y1={70} y2={180} fill="var(--band)" stroke="none" />
              <XAxis dataKey="m" type="number" domain={[0, 240]} ticks={[0, 30, 60, 90, 120, 150, 180, 210, 240]}
                tickFormatter={(v) => fmtTime(timeOf(minute + v))} stroke="var(--axis)" tickLine={false} />
              <YAxis domain={[40, yMax]} ticks={yTicks} stroke="var(--axis)" tickLine={false} width={48} />
              <ReferenceLine y={70} stroke="var(--critical)" />
              <ReferenceLine y={180} stroke="var(--warning)" />
              {res?.scenarios.map((s, j) => (
                <Line key={j} dataKey={`s${j}`} name={s.label} stroke={COLORS[j]} strokeWidth={j === 0 ? 2.25 : 2}
                  strokeDasharray={j === 0 ? "6 4" : undefined} dot={false} isAnimationActive={false} />
              ))}
              <Tooltip content={({ active, payload, label }) => !active || !payload?.length ? null : (
                <div className="panel min-w-[180px] px-3 py-2 text-xs shadow-pop">
                  <div className="mb-1.5 font-semibold text-ink">{fmtTime(timeOf(minute + Number(label)))} <span className="font-normal text-muted">(+{label} min)</span></div>
                  {payload.map((pp: any) => <div key={pp.dataKey} className="flex justify-between gap-4"><span className="text-ink2">{pp.name}</span><b className="text-ink">{Math.round(pp.value)}</b></div>)}
                </div>
              )} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {res && <div className="mt-2"><Legend items={res.scenarios.map((s, j) => ({ label: s.label, color: COLORS[j], dash: j === 0 }))} /></div>}
        {res && base && (
          <div className="-mx-4 mt-4 overflow-x-auto border-t">
            <table className="data-table min-w-[680px]">
              <thead><tr>
                <th className="pl-4">Scenario</th><th className="num">Peak</th><th className="num">Lowest</th>
                <th className="num">Time above 180</th><th className="num">Time below 70</th><th className="num">Mean</th><th className="num pr-4">Compared with baseline</th>
              </tr></thead>
              <tbody>
                {res.scenarios.map((s, j) => {
                  const d = s.time_above_180_min - base.time_above_180_min;
                  const dm = Math.round(s.mean - base.mean);
                  const dp = Math.round(s.peak - base.peak);
                  const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
                  return (
                    <tr key={j}>
                      <td className="pl-4 font-medium text-ink"><span className="mr-2 inline-block h-2 w-2" style={{ background: COLORS[j] }} />{s.label}</td>
                      <td className="num">{Math.round(s.peak)}</td><td className="num">{Math.round(s.min)}</td>
                      <td className="num">{s.time_above_180_min} min</td><td className="num">{s.time_below_70_min} min</td>
                      <td className="num">{Math.round(s.mean)}</td>
                      <td className="num pr-4 font-medium" style={{ color: j === 0 ? "var(--muted)" : dm < 0 || d < 0 ? "var(--good-ink)" : "var(--ink-2)" }}>
                        {j === 0 ? "baseline" : `peak ${sign(dp)} · mean ${sign(dm)} · ${sign(d)} min above 180`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="-mx-4 -mb-4 border-t px-4 py-2 text-[11.5px] leading-snug text-muted">Machine learning sets the expected path; the patient's calibrated physiology computes how each change would alter it. Estimates for shared decision-making, not prescriptions.</p>
      </Card>
    </div>
  );
}

function Field({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-3"}>
      <div className="mb-1 text-xs text-muted">{label}</div>
      {children}
    </div>
  );
}

function Slider({ label, v, min, max, step, fmt, on }: { label: string; v: number; min: number; max: number; step: number; fmt: (v: number) => string; on: (v: number) => void }) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="font-medium text-ink">{fmt(v)}</span></div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-full" />
    </div>
  );
}

