import type { ReactNode } from "react";
import { Card, PageHeader } from "../components/ui";

function Box({ title, items, core = false }: { title: string; items: string[]; core?: boolean }) {
  return (
    <div className={`flex-1 rounded border px-3.5 py-3 ${core ? "border-brand bg-brandsoft" : "bg-card"}`}>
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <ul className="bullets mt-1.5 space-y-0.5 text-xs leading-snug text-ink2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
const Arrow = () => <div className="flex items-center justify-center text-faint" aria-hidden><span className="rotate-90 lg:rotate-0">→</span></div>;
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-[14px] font-semibold text-muted">{n}.</span>
      <div><div className="text-[14px] font-semibold text-ink">{title}</div><div className="mt-0.5 text-[13px] leading-relaxed text-ink2">{children}</div></div>
    </li>
  );
}

export default function About() {
  return (
    <div className="space-y-5">
      <PageHeader title="Method" meta="How each patient's twin is built, kept in sync with their sensors and corrected by machine learning" />
      <Card title="System architecture">
        <div className="grid items-stretch gap-2.5 lg:grid-cols-[1fr_16px_1.3fr_16px_1fr_16px_1fr]">
          <div className="flex flex-col gap-2.5">
            <Box title="Health record (FHIR R4)" items={["Demographics, diagnoses", "HbA1c, fasting glucose and insulin, lipids, eGFR", "Medications (WHO ATC)", "TCF7L2, polygenic risk"]} />
            <Box title="Live streams, every 5 min" items={["CGM glucose", "Heart rate, steps, METs", "Sleep stages, HRV", "Meal log (Indian foods)", "Or a CSV export at onboarding"]} />
          </div>
          <Arrow />
          <div className="flex"><Box core title="Physiological model" items={[
            "Extended Bergman minimal model with gut absorption", "Exercise, sleep debt, dawn effect, circadian rhythm", "Metformin, SU, DPP-4i, SGLT2i, AGI, TZD, insulin",
            "Personalised: record prior × onboarding data", "Kept in sync with every CGM sample"]} /></div>
          <Arrow />
          <div className="flex"><Box core title="Machine-learning layer" items={["XGBoost residual forecaster, 30–120 min", "Conformal 90 % intervals", "Hyper, spike and hypo risk", "TreeSHAP explanations by stream"]} /></div>
          <Arrow />
          <div className="flex flex-col gap-2.5">
            <Box title="Clinician dashboard" items={["Risk-sorted triage", "Alerts with reasons", "What-if simulator", "AGP report, FHIR export", "New-patient onboarding"]} />
            <Box title="Copilot" items={["Grounded summaries", "Offline rule engine", "Optional hosted model"]} />
          </div>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="From data to decision">
          <ol>
            <Step n={1} title="Cold start from the record">Routine labs (HbA1c, fasting glucose and insulin via HOMA-IR and HOMA-B, weight) set the twin's prior physiology, so it is useful on day zero.</Step>
            <Step n={2} title="Personalise during onboarding">The first days of CGM, meals and activity refine insulin sensitivity, beta-cell response, absorption speed, exercise response and dawn effect (a maximum a posteriori fit of the twin's own forecasts).</Step>
            <Step n={3} title="Stay in sync">Each new CGM sample corrects the virtual patient's state; unobserved insulin, gut content and exercise effects evolve through the physiology.</Step>
            <Step n={4} title="Forecast and explain">The machine-learning layer predicts glucose 30 to 120 minutes ahead from all streams plus the twin's forecast, with calibrated intervals and a per-stream explanation of every alert.</Step>
            <Step n={5} title="Simulate before acting">The doctor tests meal swaps, walks, sleep and medication changes on the patient's own physiology and sees the expected change in peak and time above range.</Step>
          </ol>
        </Card>
        <div className="space-y-5">
          <Card title="Safety and privacy">
            <ul className="bullets space-y-1.5 text-[13px] leading-relaxed text-ink2">
              <li>Digital Personal Data Protection Act 2023: purpose-bound consent per patient, notice in the patient's language, data minimisation and retention limits. Only fictional or de-identified open data is used.</li>
              <li>No leakage: patient-level cross-validation; every on-screen prediction comes from a model that never saw that patient.</li>
              <li>Decision support, not autonomous care: no dosing instructions; medication points are framed for clinician review.</li>
              <li>Uncertainty is always shown (conformal intervals) and simulations are labelled as model estimates. Alert colours follow medical-alarm priority (IEC 60601-1-8).</li>
            </ul>
          </Card>
          <Card title="Standards">
            <ul className="bullets space-y-1.5 text-[13px] leading-relaxed text-ink2">
              <li>HL7 FHIR R4 bundles, with a structure compatible with ABDM health records</li>
              <li>LOINC labs and HL7 CGM IG summary codes; SNOMED CT and ICD-10 diagnoses; WHO ATC medications</li>
              <li>International Consensus on Time in Range targets and the Ambulatory Glucose Profile</li>
              <li>Indian Diabetes Risk Score; Asian-Indian BMI and waist cut-offs</li>
            </ul>
          </Card>
          <Card title="Data provenance">
            <ul className="bullets space-y-1.5 text-[13px] leading-relaxed text-ink2">
              <li><b className="font-semibold text-ink">Real data (validation):</b> CGMacros, PhysioNet (CC BY-NC-SA 4.0): 45 adults with Dexcom or Libre CGM, Fitbit, meals and labs. Downloaded by script, not redistributed.</li>
              <li><b className="font-semibold text-ink">Synthetic data (demo):</b> the Bharat cohort of 80 fictional Indian patients, generated from physiology with ICMR-INDIAB informed demographics and IFCT 2017 based foods.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
