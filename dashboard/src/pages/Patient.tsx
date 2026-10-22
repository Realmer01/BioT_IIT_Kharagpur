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

export default function PatientPage() {
  const { pid = "" } = useParams();
  const { data: p } = useFetch<Patient>(`/api/patients/${pid}`);
  const [tab, setTab] = useState<Tab>("live");
  const nav = useNavigate();
  if (!p) return <div className="py-20 text-center text-muted">Loading patient…</div>;
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
      <div>
        <Link to={"/" + location.search} className="text-[13px] text-muted hover:text-ink">← Remote monitoring</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] leading-tight text-ink">{p.name}</h1>
          <span className="font-mono text-[13px] text-muted">{p.patient_id}</span>
          <Badge tone={p.uploaded ? "brand" : "neutral"}>{p.uploaded ? "Uploaded data" : "Synthetic patient"}</Badge>
          <Badge>DPDP consent on file</Badge>
        </div>
        <div className="mt-1 text-[13.5px] text-ink2">{meta.join(" · ")}</div>
        <div className="mt-0.5 text-[13px] text-muted">{p.diagnoses.map((d) => d.display.replace(">=", "≥")).join(" · ")}</div>

        <dl className="mt-4 flex flex-wrap border-y py-2.5">
          {figures.map(([k, v, u]) => (
            <div key={k} className="mr-8 py-0.5">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="whitespace-nowrap"><span className="text-[16px] font-semibold text-ink">{v}</span>{u && v !== "–" && <span className="ml-1 text-xs text-muted">{u}</span>}</dd>
            </div>
          ))}
          <div className="py-0.5">
            <dt className="text-xs text-muted">Medications</dt>
            <dd className="text-[14px] text-ink">{rx.length ? rx.join(" · ") : "None (lifestyle management)"}
              {p.other_medications.length > 0 && <span className="text-muted"> · also {p.other_medications.map((r) => r.drug).join(", ")}</span>}</dd>
          </div>
        </dl>
        {(p.headline || (p.uploaded && p.upload_summary)) && (
          <div className="mt-3 space-y-2">
            {p.headline && <Note label="Demo story.">{p.headline.replace(" -> ", ", ")}.</Note>}
            {p.uploaded && p.upload_summary && (
              <Note label="Uploaded record."
                right={<button onClick={remove} className="btn-secondary h-7 px-2.5 text-xs hover:border-critical hover:text-criticalink">Remove patient</button>}>
                {p.upload_summary.readings.toLocaleString()} CGM readings over {p.upload_summary.days} days and {p.upload_summary.meals} meals.
                Personalised on the first {Math.round(p.upload_summary.onboard_hours)} h; everything after that is forecast by a model that never saw this patient.
              </Note>
            )}
          </div>
        )}
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "live", label: "Live twin" }, { id: "whatif", label: "What-if" }, { id: "agp", label: "AGP report" },
        { id: "record", label: "Health record" }, { id: "copilot", label: "Copilot" },
      ]} />
      {tab === "live" && <LiveTab p={p} />}
      {tab === "whatif" && <WhatIfTab p={p} />}
      {tab === "agp" && <AgpTab p={p} />}
      {tab === "record" && <RecordTab p={p} />}
      {tab === "copilot" && <CopilotTab p={p} />}
    </div>
  );
}
