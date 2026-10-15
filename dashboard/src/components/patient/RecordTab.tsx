import { Download } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getJSON, type Patient } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { Card } from "../ui";

type Lab = [string, number | string | null | undefined, string, (v: number) => boolean];
const flag = (bad: boolean) => (bad ? <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--critical)" }}>▲ out of range</span> : null);

export default function RecordTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const male = p.sex === "M";
  const labs: Lab[] = [
    ["HbA1c", p.hba1c, "% (normal <5.7)", (v) => v >= 5.7],
    ["Fasting plasma glucose", p.fpg, `mg/dL (70–99)${p.fpg_note ? `, ${p.fpg_note}` : ""}`, (v) => v > 99],
    ["Fasting insulin", p.fasting_insulin, "µU/mL (2–25)", (v) => v > 25],
    ["C-peptide", p.c_peptide, "ng/mL (0.5–2.0)", (v) => v < 0.5 || v > 2.0],
    ["HOMA-IR", p.homa_ir, "(insulin resistance >2.5)", (v) => v > 2.5],
    ["Triglycerides", p.tg, "mg/dL (<150)", (v) => v >= 150],
    ["HDL cholesterol", p.hdl, `mg/dL (>${male ? 40 : 50})`, (v) => v < (male ? 40 : 50)],
    ["LDL cholesterol", p.ldl, "mg/dL (<100)", (v) => v >= 100],
    ["eGFR (CKD-EPI)", p.egfr, "mL/min/1.73m² (≥60)", (v) => v < 60],
    ["Urine albumin/creatinine", p.urine_acr, "mg/g (<30)", (v) => v >= 30],
    ["ALT", p.alt, "U/L (<40)", (v) => v >= 40],
    ["Vitamin B12", p.vitamin_b12, "pg/mL (200–900)", (v) => v < 200],
    ["BMI", p.bmi, "kg/m² (Asian-Indian 18.5–22.9)", (v) => v >= 23],
    ["Waist", p.waist_cm, `cm (<${male ? 90 : 80})`, (v) => v >= (male ? 90 : 80)],
    ["Blood pressure", p.sbp != null && p.dbp != null ? `${p.sbp}/${p.dbp}` : null, "mmHg (<130/80)", () => (p.sbp ?? 0) >= 130 || (p.dbp ?? 0) >= 80],
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
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Diagnoses" subtitle="ICD-10 and SNOMED CT coded">
        <table className="w-full text-sm"><tbody>
          {p.diagnoses.map((d) => (
            <tr key={d.code} className="border-b last:border-0">
              <td className="py-1.5">{d.display.replace(">=", "≥")}</td>
              <td className="tnum text-xs text-muted">ICD-10 {d.code}</td>
              <td className="tnum text-xs text-muted">SNOMED {d.snomed}</td>
              <td className="tnum text-right text-xs text-ink2">{d.onset ?? ""}</td>
            </tr>
          ))}
        </tbody></table>
      </Card>
      <Card title="Medications" subtitle="WHO ATC coded · prescribed regimen (the twin does not see missed doses)">
        <table className="w-full text-sm"><tbody>
          {[...p.regimen, ...p.other_medications].map((r) => (
            <tr key={r.drug} className="border-b last:border-0">
              <td className="py-1.5 font-medium">{r.drug}</td>
              <td className="text-ink2">{r.daily_dose_mg ?? r.daily_units} {r.daily_units ? "U/day" : "mg/day"}</td>
              <td className="text-xs text-ink2">{r.frequency}</td>
              <td className="tnum text-right text-xs text-muted">{r.atc}</td>
            </tr>
          ))}
        </tbody></table>
      </Card>
      <Card title="Laboratory & vitals" subtitle="Latest values with adult reference ranges (Asian-Indian cut-offs for BMI and waist)">
        <table className="w-full text-sm"><tbody>
          {labs.map(([name, v, ref, bad]) => (
            <tr key={name} className="border-b last:border-0">
              <td className="py-1.5 text-ink2">{name}</td>
              <td className="tnum text-right font-semibold">
                {v == null ? <span className="font-normal text-muted">not recorded</span> : <>{v}{typeof v === "number" ? flag(bad(v)) : flag(bad(0))}</>}
              </td>
              <td className="pl-3 text-xs text-muted">{ref}</td>
            </tr>
          ))}
        </tbody></table>
      </Card>
      <div className="space-y-4">
        <Card title="HbA1c history" subtitle="Quarterly results; dashed line = 7 % individualised target">
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={hist} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="d" tickFormatter={(d) => d.slice(2, 7)} stroke="var(--axis)" tickLine={false} />
              <YAxis domain={[(m: number) => Math.floor(m - 0.5), (m: number) => Math.ceil(m + 0.5)]} stroke="var(--axis)" tickLine={false} width={40}
                allowDecimals={false} tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={7} stroke="var(--axis)" strokeDasharray="4 3" />
              <Line dataKey="v" stroke="var(--s1)" strokeWidth={2} dot={{ r: 4, fill: "var(--s1)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="card px-2 py-1 text-xs">{payload[0].payload.d}: <b>{payload[0].payload.v}%</b></div> : null} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Genetic & risk markers">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs text-muted">TCF7L2 rs7903146</dt><dd className="font-semibold">{p.tcf7l2_rs7903146 == null ? <span className="font-normal text-muted">not tested</span> : <>{p.tcf7l2_rs7903146} <span className="text-xs font-normal text-ink2">({p.tcf7l2_rs7903146 === "CC" ? "no" : p.tcf7l2_rs7903146 === "CT" ? "one" : "two"} risk allele{p.tcf7l2_rs7903146 === "TT" ? "s" : ""}; impairs insulin secretion)</span></>}</dd></div>
            <div><dt className="text-xs text-muted">T2D polygenic risk</dt><dd className="font-semibold">{p.prs_percentile == null ? <span className="font-normal text-muted">not tested</span> : `${p.prs_percentile}th percentile`}</dd></div>
            <div><dt className="text-xs text-muted">Family history of T2D</dt><dd className="font-semibold">{p.family_history_t2d}</dd></div>
            <div><dt className="text-xs text-muted">Indian Diabetes Risk Score</dt><dd className="font-semibold">{p.idrs == null ? <span className="font-normal text-muted">not recorded</span> : <>{p.idrs} <span className="text-xs font-normal text-ink2">{p.idrs >= 60 ? "(high risk)" : p.idrs >= 30 ? "(moderate)" : "(low)"}</span></>}</dd></div>
          </dl>
        </Card>
        <Card title="Consent, privacy & interoperability"
          right={<button onClick={exportFhir} className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-onbrand"><Download size={13} />Export FHIR R4 bundle</button>}>
          <ul className="space-y-1 text-xs text-ink2">
            <li><b className="text-ink">Purpose:</b> {p.consent.purpose} (granted {p.consent.granted}; DPDP notice in {p.consent.dpdp_notice_language})</li>
            <li><b className="text-ink">Shared with:</b> {p.consent.data_shared_with.join(", ")} · retention {p.consent.retention_days} days</li>
            <li><b className="text-ink">Data sources:</b> {p.data_sources.map((d) => d.stream).join(" · ")}</li>
            <li><b className="text-ink">Standards:</b> FHIR R4 (ABDM-compatible structure), LOINC, SNOMED CT, ICD-10, WHO ATC; CGM summary codes per HL7 CGM IG</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
