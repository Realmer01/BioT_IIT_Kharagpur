import clsx from "clsx";
import { ArrowRight, Check, FileUp, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Note, PageHeader } from "../components/ui";
import { getJSON, type OnboardProfile, type OnboardResult } from "../lib/api";
import { useClock } from "../lib/clock";

const BLANK: OnboardProfile = {
  name: "", age: "", sex: "F", weight_kg: "", height_cm: "", hba1c: "", fpg: "", fasting_insulin: "", egfr: "",
  diabetes_years: "", sbp: "", dbp: "", city: "", state: "", language: "", medications: [],
};
const USUAL_DOSE: Record<string, number> = {
  Metformin: 1000, Glimepiride: 2, Gliclazide: 80, Teneligliptin: 20, Sitagliptin: 100, Vildagliptin: 100,
  Dapagliflozin: 10, Empagliflozin: 10, Voglibose: 0.6, Pioglitazone: 15, "Insulin glargine": 14,
};
const unitOf = (drug: string) => (drug === "Insulin glargine" ? "U/day" : "mg/day");
const STAGES = [
  "Reading the export",
  "Placing it on the clinic timeline",
  "Setting the prior from the health record",
  "Personalising the physiology on the first days",
  "Scoring forecasts and alerts on the rest",
];
const PHENO: [string, string, number][] = [
  ["insulin_sensitivity", "Insulin sensitivity", 2],
  ["beta_cell_response", "Beta-cell response", 2],
  ["basal_glucose", "Basal glucose (mg/dL)", 0],
  ["absorption_speed", "Meal absorption speed", 2],
  ["dawn_effect", "Dawn effect", 2],
];
const box = "input";
const input = "input";
const step = (n: number, title: string) => <span className="flex items-baseline gap-2.5"><span className="display text-[17px] leading-none text-accent">{String(n).padStart(2, "0")}</span>{title}</span>;

interface FileInfo { name: string; rows: number; first: string; last: string; columns: string[] }

function describe(name: string, text: string): FileInfo {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0] ?? "").includes(";") ? ";" : (lines[0] ?? "").includes("\t") ? "\t" : ",";
  const first = (l?: string) => (l ?? "").split(sep)[0]?.replace(/"/g, "") ?? "";
  return { name, rows: Math.max(0, lines.length - 1), first: first(lines[1]), last: first(lines[lines.length - 1]), columns: (lines[0] ?? "").split(sep).map((c) => c.replace(/"/g, "").trim()) };
}

function Field({ label, hint, required, children, className }: { label: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-ink2">{label}{required && <span className="text-criticalink"> *</span>}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function Onboard() {
  const [profile, setProfile] = useState<OnboardProfile>(BLANK);
  const [csv, setCsv] = useState<string>("");
  const [file, setFile] = useState<FileInfo | null>(null);
  const [drugs, setDrugs] = useState<string[]>(Object.keys(USUAL_DOSE));
  const [status, setStatus] = useState<"idle" | "building" | "done" | "error">("idle");
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getJSON<{ drugs: string[] }>("/api/onboard/format").then((f) => setDrugs(f.drugs)).catch(() => {}); }, []);
  useEffect(() => {
    if (status !== "building") return;
    setStage(0);
    const t = window.setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 650);
    return () => window.clearInterval(t);
  }, [status]);

  const set = <K extends keyof OnboardProfile>(k: K, v: OnboardProfile[K]) => setProfile((p) => ({ ...p, [k]: v }));
  const num = (k: keyof OnboardProfile) => ({
    type: "number", inputMode: "decimal" as const, className: input, value: profile[k] as number | "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === "" ? "" : Number(e.target.value)) as never),
  });

  const loadFile = async (f: File) => {
    if (f.size > 25e6) { setError("That file is larger than 25 MB. Export a shorter period (2 weeks is plenty)."); return; }
    const text = await f.text();
    setCsv(text); setFile(describe(f.name, text)); setError(null);
  };
  const loadSample = async () => {
    const s = await getJSON<{ profile: OnboardProfile; csv: string; filename: string }>("/api/onboard/sample");
    setProfile({ ...BLANK, ...s.profile });
    setCsv(s.csv); setFile(describe(s.filename, s.csv)); setError(null); setStatus("idle");
  };
  const reset = () => { setProfile(BLANK); setCsv(""); setFile(null); setResult(null); setError(null); setStatus("idle"); };

  const missing = [profile.age === "" && "age", profile.weight_kg === "" && "weight", profile.hba1c === "" && "HbA1c", !csv && "a CGM file"].filter(Boolean) as string[];
  const build = async () => {
    setStatus("building"); setError(null);
    const clean = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v === "" ? null : v]));
    try {
      const r = await fetch("/api/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: clean, csv }) });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(typeof body.detail === "string" ? body.detail : "The form has an invalid value; check the numbers and try again.");
      }
      setResult(await r.json()); setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus("error");
    }
  };

  if (status === "done" && result) return <Result r={result} onAnother={reset} />;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Onboarding" title="Add a patient to the clinic"
        right={<button onClick={loadSample} className="btn-secondary h-9"><FileUp size={15} strokeWidth={1.8} />Load sample patient</button>}>
        Build a twin from a short health record and a CGM export. The record sets the twin's starting point on day zero, the first part of the
        recording personalises it, and everything after that is forecast by models that have never seen this patient.
      </PageHeader>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card title={step(1, "Health record")} subtitle="Age, weight and HbA1c are enough to start; every other value sharpens the prior">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Name" className="col-span-2"><input className={input} value={profile.name} onChange={(e) => set("name", e.target.value)} placeholder="Patient name" /></Field>
              <Field label="Age" required hint="years"><input {...num("age")} /></Field>
              <Field label="Sex">
                <div className="segmented flex h-9 w-full">
                  {(["F", "M"] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={profile.sex === s} onClick={() => set("sex", s)} className="flex-1 text-[13px]">{s === "F" ? "Female" : "Male"}</button>
                  ))}
                </div>
              </Field>
              <Field label="Weight" required hint="kg"><input {...num("weight_kg")} /></Field>
              <Field label="Height" hint="cm"><input {...num("height_cm")} /></Field>
              <Field label="HbA1c" required hint="%"><input {...num("hba1c")} step="0.1" /></Field>
              <Field label="Fasting glucose" hint="mg/dL"><input {...num("fpg")} placeholder="from CGM if blank" /></Field>
              <Field label="Fasting insulin" hint="µU/mL"><input {...num("fasting_insulin")} /></Field>
              <Field label="eGFR" hint="mL/min"><input {...num("egfr")} /></Field>
              <Field label="Years since diagnosis"><input {...num("diabetes_years")} /></Field>
              <Field label="Blood pressure" hint="mmHg">
                <div className="flex items-center gap-1"><input {...num("sbp")} placeholder="sys" /><span className="text-muted">/</span><input {...num("dbp")} placeholder="dia" /></div>
              </Field>
              <Field label="City"><input className={input} value={profile.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="State"><input className={input} value={profile.state} onChange={(e) => set("state", e.target.value)} /></Field>
              <Field label="Preferred language" className="col-span-2 sm:col-span-1"><input className={input} value={profile.language} onChange={(e) => set("language", e.target.value)} /></Field>
            </div>
          </Card>

          <Card title={step(2, "Diabetes medicines")} subtitle="Each one sets a drug effect in the twin's physiology"
            right={<button onClick={() => set("medications", [...profile.medications, { drug: drugs.find((d) => !profile.medications.some((m) => m.drug === d)) ?? drugs[0], dose: USUAL_DOSE[drugs.find((d) => !profile.medications.some((m) => m.drug === d)) ?? drugs[0]] ?? 0 }])}
              className="btn-secondary h-7 px-2.5 text-xs"><Plus size={13} />Add medicine</button>}>
            {profile.medications.length === 0 ? (
              <p className="text-sm text-muted">None added: the twin will assume lifestyle management only.</p>
            ) : (
              <ul className="divide-y">
                {profile.medications.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                    <select value={m.drug} className={clsx(box, "min-w-0 flex-1")}
                      onChange={(e) => set("medications", profile.medications.map((x, j) => j === i ? { drug: e.target.value, dose: USUAL_DOSE[e.target.value] ?? x.dose } : x))}>
                      {drugs.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <input type="number" step="any" value={m.dose} className={clsx(box, "w-24 text-right")}
                      onChange={(e) => set("medications", profile.medications.map((x, j) => j === i ? { ...x, dose: Number(e.target.value) } : x))} />
                    <span className="w-14 text-xs text-muted">{unitOf(m.drug)}</span>
                    <button onClick={() => set("medications", profile.medications.filter((_, j) => j !== i))} title="Remove" className="btn-icon h-8 w-8"><X size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={step(3, "CGM and wearable data")} subtitle="One CSV: glucose is required; heart rate, steps and logged meals are used when present">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={clsx("cursor-pointer rounded-lg border border-dashed border-strong px-4 py-7 text-center transition-colors", drag ? "border-brand bg-brandsoft" : "bg-surface hover:border-brand")}>
              <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
              {file ? (
                <div className="text-sm">
                  <div className="font-semibold text-ink">{file.name}</div>
                  <div className="tnum mt-0.5 text-xs text-ink2">{file.rows.toLocaleString()} row{file.rows === 1 ? "" : "s"} · {file.first} to {file.last}</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {file.columns.map((c) => <span key={c} className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px] text-ink2">{c}</span>)}
                  </div>
                  <div className="mt-2 text-xs text-muted">Click or drop to replace</div>
                </div>
              ) : (
                <div className="text-sm text-ink2">
                  <FileUp size={20} className="mx-auto mb-1.5 text-muted" />
                  Drop a CSV here or <span className="font-medium text-brand underline underline-offset-2">choose a file</span>
                  <div className="mt-1 text-xs text-muted">At least 24 hours of readings; 1 to 2 weeks gives the best personalisation</div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-16">
          <Card title="Build the twin">
            {status === "building" ? (
              <ol className="space-y-2 text-sm">
                {STAGES.map((s, i) => (
                  <li key={s} className={clsx("flex items-center gap-2", i > stage ? "text-muted" : "text-ink")}>
                    {i < stage ? <Check size={15} style={{ color: "var(--good-ink)" }} /> : i === stage ? <Loader2 size={15} className="animate-spin text-brand" /> : <span className="inline-block h-[15px] w-[15px] rounded-full border" />}
                    {s}
                  </li>
                ))}
              </ol>
            ) : (
              <>
                <button disabled={missing.length > 0} onClick={build} className="btn-primary h-10 w-full text-sm font-semibold">
                  Build twin<ArrowRight size={15} />
                </button>
                <p className="mt-2 text-xs text-muted">
                  {missing.length ? `Still needed: ${missing.join(", ")}.` : "Takes a few seconds. The data stays on this server and can be removed from the patient page."}
                </p>
                {error && <div className="mt-3 rounded-r-md border-l-2 border-critical bg-criticalsoft px-3 py-2 text-xs text-ink"><b className="text-criticalink">Could not build the twin.</b> {error}</div>}
              </>
            )}
          </Card>

          <Card title="File format" subtitle="Column names are case-insensitive; names used by common CGM exports are also recognised">
            <table className="w-full text-xs">
              <tbody>
                {[
                  ["timestamp", "required", "2026-10-05 07:35"],
                  ["glucose_mgdl", "required", "mg/dL; mmol/L is detected and converted"],
                  ["heart_rate", "optional", "beats per minute"],
                  ["steps", "optional", "steps from this row until the next"],
                  ["carbs_g", "optional", "grams, on the row where a meal starts"],
                  ["protein_g, fat_g, fiber_g, meal", "optional", "meal detail and name"],
                ].map(([c, req, d]) => (
                  <tr key={c} className="border-b align-top last:border-0">
                    <td className="py-2 pr-2 font-mono text-[11px] text-ink">{c}</td>
                    <td className={clsx("py-2 pr-2", req === "required" ? "font-semibold text-ink" : "text-muted")}>{req}</td>
                    <td className="py-2 text-ink2">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              The recording is moved by whole days onto the clinic's 14-day timeline, so times of day are kept. Use the sample patient to see a complete file.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Result({ r, onAnother }: { r: OnboardResult; onAnother: () => void }) {
  const { setMinute } = useClock();
  const nav = useNavigate();
  const s = r.summary;
  const open = () => { setMinute(s.replay_minute); nav(`/patient/${r.patient_id}?m=${s.replay_minute}`); };
  const gain = s.prior_rmse_120 && s.fit_rmse_120 ? 1 - s.fit_rmse_120 / s.prior_rmse_120 : null;
  const notes = [
    s.unit !== "mg/dL" && `Glucose was in ${s.unit}.`,
    s.fpg_note && `Fasting glucose ${s.fpg_note}.`,
    s.shift_days !== 0 && `Recording moved ${Math.abs(s.shift_days)} days ${s.shift_days > 0 ? "forward" : "back"} onto the clinic timeline.`,
    !s.has_heart_rate && "No heart rate column: the twin runs without it.",
    !s.has_steps && "No steps column: activity is assumed light.",
    s.meals === 0 && "No meals logged: forecasts assume no new food, which is what they are trained for.",
  ].filter(Boolean) as string[];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="card px-6 py-5">
        <div className="eyebrow">Twin ready · {r.patient_id}</div>
        <h1 className="display mt-1 text-[30px] leading-tight text-ink">{r.name}</h1>
        <p className="mt-1 text-sm text-ink2">
          Personalised on the first {Math.round(s.onboard_hours)} hours of the recording. The remaining {Math.max(0, s.hours - s.onboard_hours).toFixed(0)} hours
          are forecast and scored exactly as they would have been live, so you can replay them and check the alerts against what happened.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          {[
            ["CGM readings", s.readings.toLocaleString(), `${s.days} days, every ${s.interval_min} min`],
            ["Meals logged", String(s.meals), s.meals ? "used as model inputs" : "none in the file"],
            ["Wearable streams", [s.has_heart_rate && "HR", s.has_steps && "steps"].filter(Boolean).join(" + ") || "none", `${s.coverage_pct}% CGM coverage`],
            ["2-h twin error", s.fit_rmse_120 != null ? `${s.fit_rmse_120.toFixed(0)}` : "–",
              s.prior_rmse_120 != null ? `mg/dL, from ${s.prior_rmse_120.toFixed(0)} on the record alone` : "mg/dL"],
          ].map(([k, v, sub]) => (
            <div key={k}>
              <div className="text-xs text-muted">{k}</div>
              <div className="display mt-1 text-[28px] leading-none">{v}</div>
              <div className="text-xs text-ink2">{sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={open} className="btn-primary h-9 px-4 text-sm">Open twin<ArrowRight size={15} /></button>
          <button onClick={onAnother} className="btn-secondary h-9 px-3.5 text-sm"><RotateCcw size={14} />Onboard another</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="What the recording taught the twin" subtitle={gain != null ? `Personalisation cut the twin's own 2-hour forecast error by ${Math.round(gain * 100)}% on the onboarding window` : "Physiology before and after personalisation"}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-1 font-normal">Parameter</th><th className="pb-1 text-right font-normal">From record</th><th className="pb-1 text-right font-normal">Personalised</th></tr></thead>
            <tbody>
              {PHENO.map(([k, label, d]) => {
                const a = s.prior_phenotype[k], b = s.phenotype[k];
                if (a == null || b == null) return null;
                const ch = a ? (b - a) / Math.abs(a) : 0;
                return (
                  <tr key={k} className="border-t">
                    <td className="py-1.5 text-ink2">{label}</td>
                    <td className="tnum py-1.5 text-right text-muted">{a.toFixed(d)}</td>
                    <td className="tnum py-1.5 text-right font-semibold">{b.toFixed(d)}
                      {Math.abs(ch) >= 0.05 && <span className="ml-1.5 text-[11px] font-normal text-ink2">{ch > 0 ? "▲" : "▼"}{Math.abs(ch * 100).toFixed(0)}%</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title="How the file was read">
          <dl className="space-y-1.5 text-sm">
            {Object.entries(s.columns).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-ink2">{{ time: "Time", glucose: "Glucose", hr: "Heart rate", steps: "Steps", carbs: "Carbohydrate", protein: "Protein", fat: "Fat", fiber: "Fibre", meal: "Meal name" }[k] ?? k}</dt>
                <dd className="truncate font-mono text-xs text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {notes.length > 0 && <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-ink2">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
