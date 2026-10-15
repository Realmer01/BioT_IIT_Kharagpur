import { ArrowLeft, MessageSquareText, FileHeart, FlaskRound, LineChart, ShieldCheck, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AgpTab from "../components/patient/AgpTab";
import CopilotTab from "../components/patient/CopilotTab";
import LiveTab from "../components/patient/LiveTab";
import RecordTab from "../components/patient/RecordTab";
import WhatIfTab from "../components/patient/WhatIfTab";
import { Badge, Tabs } from "../components/ui";
import { useFetch, type Patient } from "../lib/api";

type Tab = "live" | "whatif" | "agp" | "record" | "copilot";

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
  return (
    <div className="space-y-4">
      <div className="card px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link to={"/" + location.search} className="mt-1 rounded-md p-1 text-ink2 hover:bg-page" title="Back to clinic"><ArrowLeft size={18} /></Link>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brandsoft text-base font-semibold text-brand">
              {p.name.split(" ").map((x) => x[0]).join("")}
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{p.name} <span className="text-sm font-normal text-muted">· {p.age}{p.sex} · {p.patient_id}</span></h1>
              <div className="text-sm text-ink2">
                {[`${p.group_label}${p.diabetes_years ? ` for ${years(p.diabetes_years)}` : ""}`,
                  [p.city, p.state].filter((x) => x && x !== "—").join(", "),
                  p.occupation && p.occupation !== "—" ? p.occupation : "",
                  p.language && p.language !== "—" ? `prefers ${p.language}` : ""].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.uploaded
                  ? <Badge tone="brand"><Upload size={11} />Uploaded data</Badge>
                  : <Badge tone="brand"><FlaskRound size={11} />Synthetic patient</Badge>}
                <Badge><ShieldCheck size={11} />DPDP consent: {p.consent.purpose.toLowerCase()}</Badge>
                {p.diagnoses.slice(0, 4).map((d) => <Badge key={d.code}>{d.display.replace(">=", "≥")}</Badge>)}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-sm sm:grid-cols-6">
            {[["HbA1c", `${p.hba1c}%`], ["FPG", show(p.fpg)], ["BMI", p.bmi == null ? "–" : p.bmi.toFixed(1)], ["eGFR", show(p.egfr)],
              ["BP", p.sbp != null && p.dbp != null ? `${p.sbp}/${p.dbp}` : "–"], ["IDRS", show(p.idrs)]].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className="tnum font-semibold">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="mt-2 text-xs text-ink2"><span className="text-muted">Medications:</span> {rx.length ? rx.join(" · ") : "none (lifestyle management)"}
          {p.other_medications.length > 0 && <span className="text-muted"> · also {p.other_medications.map((r) => r.drug).join(", ")}</span>}
        </div>
        {p.headline && <div className="mt-2 rounded-md bg-brandsoft/60 px-2.5 py-1.5 text-xs text-ink"><b>Demo story:</b> {p.headline.replace(" -> ", " → ")}</div>}
        {p.uploaded && p.upload_summary && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-brandsoft/60 px-2.5 py-1.5 text-xs text-ink">
            <span><b>Onboarded from an upload:</b> {p.upload_summary.readings.toLocaleString()} CGM readings over {p.upload_summary.days} days, {p.upload_summary.meals} meals.
              The twin was personalised on the first {Math.round(p.upload_summary.onboard_hours)} h; everything after that is forecast by a model that never saw this patient.</span>
            <button onClick={remove} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-ink2 hover:border-critical hover:text-critical"><Trash2 size={12} />Remove patient</button>
          </div>
        )}
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "live", label: "Live twin", icon: <LineChart size={15} /> },
        { id: "whatif", label: "What-if simulator", icon: <SlidersHorizontal size={15} /> },
        { id: "agp", label: "AGP report", icon: <FileHeart size={15} /> },
        { id: "record", label: "Health record", icon: <FlaskRound size={15} /> },
        { id: "copilot", label: "Copilot", icon: <MessageSquareText size={15} /> },
      ]} />
      {tab === "live" && <LiveTab p={p} />}
      {tab === "whatif" && <WhatIfTab p={p} />}
      {tab === "agp" && <AgpTab p={p} />}
      {tab === "record" && <RecordTab p={p} />}
      {tab === "copilot" && <CopilotTab p={p} />}
    </div>
  );
}
