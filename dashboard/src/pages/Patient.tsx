import { ArrowLeft, FileHeart, FlaskRound, LineChart, MessageSquareText, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AgpTab from "../components/patient/AgpTab";
import CopilotTab from "../components/patient/CopilotTab";
import LiveTab from "../components/patient/LiveTab";
import RecordTab from "../components/patient/RecordTab";
import WhatIfTab from "../components/patient/WhatIfTab";
import { Badge, Note, Tabs } from "../components/ui";
import { useFetch, type Patient } from "../lib/api";

type Tab = "live" | "whatif" | "agp" | "record" | "copilot";
const ICON = { size: 15, strokeWidth: 1.8 };

export default function PatientPage() {
  const { pid = "" } = useParams();
  const { data: p } = useFetch<Patient>(`/api/patients/${pid}`);
  const [tab, setTab] = useState<Tab>("live");
  const nav = useNavigate();
  if (!p) return <div className="py-20 text-center text-muted">Loading twin…</div>;
  const show = (v: number | null) => (v == null ? "–" : `${v}`);
  const years = (y: number) => (y < 1 ? `${Math.max(1, Math.round(y * 12))} months` : `${y.toFixed(0)} year${y.toFixed(0) === "1" ? "" : "s"}`);
  const remove = async () => {
    if (!confirm(`Remove ${p.name} and their uploaded data from this clinic?`)) return;
    await fetch(`/api/patients/${p.patient_id}`, { method: "DELETE" });
    nav("/onboard");
  };
  const rx = p.regimen.map((r) => `${r.drug} ${r.daily_dose_mg ?? r.daily_units ?? ""}${r.daily_units ? " U" : " mg"}`);
  const figures: [string, string, string?][] = [
    ["HbA1c", `${p.hba1c}`, "%"], ["Fasting glucose", show(p.fpg), "mg/dL"], ["BMI", p.bmi == null ? "–" : p.bmi.toFixed(1)],
    ["eGFR", show(p.egfr), "mL/min"], ["Blood pressure", p.sbp != null && p.dbp != null ? `${p.sbp}/${p.dbp}` : "–"], ["IDRS", show(p.idrs)],
  ];
  const meta = [
    `${p.age} ${p.sex === "F" ? "female" : "male"}`,
    `${p.group_label}${p.diabetes_years ? ` for ${years(p.diabetes_years)}` : ""}`,
    [p.city, p.state].filter((x) => x && x !== "—").join(", "),
    p.occupation && p.occupation !== "—" ? p.occupation : "",
    p.language && p.language !== "—" ? `prefers ${p.language}` : "",
  ].filter(Boolean);
  return (
    <div className="space-y-5">
      <div className="card px-5 pb-4 pt-4">
        <div>
          <div className="flex min-w-0 items-start gap-3.5">
            <Link to={"/" + location.search} className="btn-icon -ml-1.5 mt-1" title="Back to clinic"><ArrowLeft size={17} strokeWidth={1.8} /></Link>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-surface font-serif text-[17px] font-semibold text-ink">
              {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <h1 className="display text-[26px] leading-tight text-ink">{p.name}</h1>
                <span className="font-mono text-xs text-muted">{p.patient_id}</span>
              </div>
              <div className="mt-0.5 text-[13px] text-ink2">{meta.join(" · ")}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={p.uploaded ? "brand" : "neutral"}>{p.uploaded ? "Uploaded data" : "Synthetic patient"}</Badge>
                <Badge><ShieldCheck size={11} strokeWidth={2} className="shrink-0" />DPDP consent on file</Badge>
                {p.diagnoses.slice(0, 4).map((d) => <Badge key={d.code}>{d.display.replace(">=", "≥")}</Badge>)}
              </div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-[var(--border)] sm:grid-cols-6">
            {figures.map(([k, v, u]) => (
              <div key={k} className="bg-surface px-4 py-2.5">
                <dt className="whitespace-nowrap text-[11px] text-muted">{k}</dt>
                <dd className="mt-0.5 whitespace-nowrap"><span className="text-[16px] font-semibold text-ink">{v}</span>{u && v !== "–" && <span className="ml-0.5 text-[11px] text-muted">{u}</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-3.5 border-t pt-3 text-[13px] text-ink2">
          <span className="label mr-2 text-[10.5px]">Medications</span>{rx.length ? rx.join(" · ") : "none (lifestyle management)"}
          {p.other_medications.length > 0 && <span className="text-muted"> · also {p.other_medications.map((r) => r.drug).join(", ")}</span>}
        </div>
        {(p.headline || (p.uploaded && p.upload_summary)) && (
          <div className="mt-3 space-y-2">
            {p.headline && <Note label="Demo story">{p.headline.replace(" -> ", " → ")}</Note>}
            {p.uploaded && p.upload_summary && (
              <Note tone="brand" label="Uploaded"
                right={<button onClick={remove} className="btn-ghost h-7 px-2 text-xs hover:text-criticalink"><Trash2 size={13} />Remove patient</button>}>
                {p.upload_summary.readings.toLocaleString()} CGM readings over {p.upload_summary.days} days and {p.upload_summary.meals} meals.
                Personalised on the first {Math.round(p.upload_summary.onboard_hours)} h; everything after that is forecast by a model that never saw this patient.
              </Note>
            )}
          </div>
        )}
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "live", label: "Live twin", icon: <LineChart {...ICON} /> },
        { id: "whatif", label: "What-if simulator", icon: <SlidersHorizontal {...ICON} /> },
        { id: "agp", label: "AGP report", icon: <FileHeart {...ICON} /> },
        { id: "record", label: "Health record", icon: <FlaskRound {...ICON} /> },
        { id: "copilot", label: "Copilot", icon: <MessageSquareText {...ICON} /> },
      ]} />
      {tab === "live" && <LiveTab p={p} />}
      {tab === "whatif" && <WhatIfTab p={p} />}
      {tab === "agp" && <AgpTab p={p} />}
      {tab === "record" && <RecordTab p={p} />}
      {tab === "copilot" && <CopilotTab p={p} />}
    </div>
  );
}
