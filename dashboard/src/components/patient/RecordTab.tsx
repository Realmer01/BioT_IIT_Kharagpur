import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getJSON, type Patient } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { Card } from "../ui";

type Flag = "High" | "Low" | null;
type Lab = [string, number | string | null | undefined, string, (v: number) => Flag];
const hi = (bad: boolean): Flag => (bad ? "High" : null);
const lo = (bad: boolean): Flag => (bad ? "Low" : null);
const flag = (f: Flag) => (f ? <span className="text-xs font-semibold text-criticalink">{f}</span> : null);

export default function RecordTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const male = p.sex === "M";
  const labs: Lab[] = [
    ["HbA1c", p.hba1c, "% · normal under 5.7", (v) => hi(v >= 5.7)],
    ["Fasting plasma glucose", p.fpg, `mg/dL · 70–99${p.fpg_note ? ` · ${p.fpg_note}` : ""}`, (v) => (v > 99 ? "High" : v < 70 ? "Low" : null)],
    ["Fasting insulin", p.fasting_insulin, "µU/mL · 2–25", (v) => hi(v > 25)],
    ["C-peptide", p.c_peptide, "ng/mL · 0.5–2.0", (v) => (v < 0.5 ? "Low" : v > 2.0 ? "High" : null)],
    ["HOMA-IR", p.homa_ir, "insulin resistance above 2.5", (v) => hi(v > 2.5)],
    ["Triglycerides", p.tg, "mg/dL · under 150", (v) => hi(v >= 150)],
    ["HDL cholesterol", p.hdl, `mg/dL · above ${male ? 40 : 50}`, (v) => lo(v < (male ? 40 : 50))],
    ["LDL cholesterol", p.ldl, "mg/dL · under 100", (v) => hi(v >= 100)],
    ["eGFR (CKD-EPI)", p.egfr, "mL/min/1.73 m² · 60 or more", (v) => lo(v < 60)],
    ["Urine albumin/creatinine", p.urine_acr, "mg/g · under 30", (v) => hi(v >= 30)],
    ["ALT", p.alt, "U/L · under 40", (v) => hi(v >= 40)],
    ["Vitamin B12", p.vitamin_b12, "pg/mL · 200–900", (v) => lo(v < 200)],
    ["BMI", p.bmi, "kg/m² · Asian-Indian 18.5–22.9", (v) => hi(v >= 23)],
    ["Waist", p.waist_cm, `cm · under ${male ? 90 : 80}`, (v) => hi(v >= (male ? 90 : 80))],
    ["Blood pressure", p.sbp != null && p.dbp != null ? `${p.sbp}/${p.dbp}` : null, "mmHg · under 130/80", () => hi((p.sbp ?? 0) >= 130 || (p.dbp ?? 0) >= 80)],
  ];
  const exportFhir = async () => {
    const b = await getJSON<object>(`/api/patients/${p.patient_id}/fhir?minute=${minute}`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/fhir+json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${p.patient_id}_fhir_bundle.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const hist = p.hba1c_history.map((h) => ({ d: h.date, v: h.hba1c }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Diagnoses" subtitle="ICD-10 and SNOMED CT coded" pad={false}>
        <div className="overflow-x-auto"><table className="data-table">
          <thead><tr><th className="pl-5">Condition</th><th>ICD-10</th><th>SNOMED CT</th><th className="num pr-5">Onset</th></tr></thead>
          <tbody>
            {p.diagnoses.map((d) => (
              <tr key={d.code}>
                <td className="pl-5 text-ink">{d.display.replace(">=", "≥")}</td>
                <td className="font-mono text-xs text-ink2">{d.code}</td>
                <td className="font-mono text-xs text-ink2">{d.snomed}</td>
                <td className="num whitespace-nowrap pr-5 text-xs text-muted">{d.onset ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      <Card title="Medications" subtitle="WHO ATC coded · the prescribed regimen (the twin does not see missed doses)" pad={false}>
        <div className="overflow-x-auto"><table className="data-table">
          <thead><tr><th className="pl-5">Drug</th><th>Daily dose</th><th>Frequency</th><th className="num pr-5">ATC</th></tr></thead>
          <tbody>
            {[...p.regimen, ...p.other_medications].map((r) => (
              <tr key={r.drug}>
                <td className="pl-5 font-medium text-ink">{r.drug}</td>
                <td className="text-ink2">{r.daily_dose_mg ?? r.daily_units} {r.daily_units ? "U" : "mg"}</td>
                <td className="text-xs text-ink2">{r.frequency}</td>
                <td className="num pr-5 font-mono text-xs text-muted">{r.atc}</td>
              </tr>
            ))}
            {p.regimen.length + p.other_medications.length === 0 && <tr><td colSpan={4} className="pl-5 text-muted">No medicines recorded</td></tr>}
          </tbody>
        </table></div>
      </Card>
      <Card title="Laboratory and vitals" subtitle="Latest values with adult reference ranges (Asian-Indian cut-offs for BMI and waist)" pad={false}>
        <div className="overflow-x-auto"><table className="data-table">
          <tbody>
            {labs.map(([name, v, ref, check]) => (
              <tr key={name}>
                <td className="pl-5 text-ink2">{name}</td>
                <td className="num whitespace-nowrap font-semibold text-ink">{v == null ? <span className="font-normal text-faint">not recorded</span> : v}</td>
                <td className="w-[52px] whitespace-nowrap px-0">{v == null ? null : flag(check(typeof v === "number" ? v : 0))}</td>
                <td className="pr-5 text-xs text-muted">{ref}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      <div className="space-y-5">
        <Card title="HbA1c history" subtitle="Quarterly results; the dashed line is the individualised 7 % target">
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={hist} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="d" tickFormatter={(d) => d.slice(2, 7)} stroke="var(--axis)" tickLine={false} />
              <YAxis domain={[(m: number) => Math.floor(m - 0.5), (m: number) => Math.ceil(m + 0.5)]} stroke="var(--axis)" tickLine={false} width={40}
                allowDecimals={false} tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={7} stroke="var(--axis)" strokeDasharray="4 3" />
              <Line dataKey="v" stroke="var(--s1)" strokeWidth={2} dot={{ r: 3.5, fill: "var(--s1)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="panel px-2.5 py-1.5 text-xs shadow-pop">{payload[0].payload.d}: <b>{payload[0].payload.v}%</b></div> : null} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Genetic and risk markers">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <div><dt className="text-xs text-muted">TCF7L2 rs7903146</dt><dd className="mt-0.5 font-semibold text-ink">{p.tcf7l2_rs7903146 == null ? <span className="font-normal text-faint">not tested</span> : <>{p.tcf7l2_rs7903146} <span className="text-xs font-normal text-ink2">({p.tcf7l2_rs7903146 === "CC" ? "no" : p.tcf7l2_rs7903146 === "CT" ? "one" : "two"} risk allele{p.tcf7l2_rs7903146 === "TT" ? "s" : ""}; impairs insulin secretion)</span></>}</dd></div>
            <div><dt className="text-xs text-muted">T2D polygenic risk</dt><dd className="mt-0.5 font-semibold text-ink">{p.prs_percentile == null ? <span className="font-normal text-faint">not tested</span> : `${p.prs_percentile}th percentile`}</dd></div>
            <div><dt className="text-xs text-muted">Family history of T2D</dt><dd className="mt-0.5 font-semibold text-ink">{p.family_history_t2d}</dd></div>
            <div><dt className="text-xs text-muted">Indian Diabetes Risk Score</dt><dd className="mt-0.5 font-semibold text-ink">{p.idrs == null ? <span className="font-normal text-faint">not recorded</span> : <>{p.idrs} <span className="text-xs font-normal text-ink2">{p.idrs >= 60 ? "(high risk)" : p.idrs >= 30 ? "(moderate)" : "(low)"}</span></>}</dd></div>
          </dl>
        </Card>
        <Card title="Consent, privacy and interoperability"
          right={<button onClick={exportFhir} className="btn-secondary">Export FHIR R4 bundle</button>}>
          <dl className="space-y-2 text-xs leading-relaxed text-ink2">
            <div><dt className="inline font-semibold text-ink">Purpose · </dt><dd className="inline">{p.consent.purpose} (granted {p.consent.granted}; DPDP notice in {p.consent.dpdp_notice_language})</dd></div>
            <div><dt className="inline font-semibold text-ink">Shared with · </dt><dd className="inline">{p.consent.data_shared_with.join(", ")} · retention {p.consent.retention_days} days</dd></div>
            <div><dt className="inline font-semibold text-ink">Data sources · </dt><dd className="inline">{p.data_sources.map((d) => d.stream).join(" · ")}</dd></div>
            <div><dt className="inline font-semibold text-ink">Standards · </dt><dd className="inline">FHIR R4 (ABDM-compatible structure), LOINC, SNOMED CT, ICD-10, WHO ATC; CGM summary codes per the HL7 CGM IG</dd></div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
