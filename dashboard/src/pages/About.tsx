import { ArrowDown, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "../components/ui";

function Box({ title, items, tone = "plain" }: { title: string; items: string[]; tone?: "plain" | "core" | "out" }) {
  const cls = tone === "core" ? "border-brand bg-brandsoft/50" : tone === "out" ? "bg-page" : "bg-card";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${cls}`}>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      <ul className="mt-1 space-y-0.5 text-xs text-ink2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
const Arrow = ({ down }: { down?: boolean }) => (
  <div className="flex items-center justify-center text-muted">{down ? <ArrowDown size={18} /> : <ArrowRight size={18} />}</div>
);
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-onbrand">{n}</span>
      <div><div className="text-sm font-semibold">{title}</div><div className="text-sm text-ink2">{children}</div></div>
    </li>
  );
}

export default function About() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">How MadhuTwin works</h1>
        <p className="max-w-3xl text-sm text-ink2">A hybrid digital twin: a personalised physiological model of each patient's glucose–insulin system, kept in sync with live wearable streams, with a machine-learning layer that corrects what physiology misses.</p>
      </div>
      <Card title="System architecture">
        <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1.3fr_auto_1fr_auto_1fr]">
          <div className="space-y-2">
            <Box title="Static record (EHR, FHIR R4)" items={["Demographics, diagnoses", "HbA1c, FPG, insulin, lipids, eGFR", "Medications (ATC)", "TCF7L2, polygenic risk"]} />
            <Box title="Live streams (5-min)" items={["CGM glucose", "Heart rate, steps, METs", "Sleep stages, HRV", "Meal log (Indian foods)"]} />
          </div>
          <Arrow />
          <Box tone="core" title="Physiological twin" items={[
            "Extended Bergman minimal model + gut absorption", "Exercise, sleep debt, dawn effect, circadian rhythm", "Pharmacology: metformin, SU, DPP-4i, SGLT2i, AGI, TZD, insulin",
            "Personalised: EHR prior × onboarding data (MAP)", "Synced to CGM continuously (observer)"]} />
          <Arrow />
          <Box tone="core" title="Hybrid ML layer" items={["XGBoost residual forecaster, 30–120 min", "Conformal 90 % intervals", "Hyper / spike / hypo risk", "TreeSHAP explanations by stream"]} />
          <Arrow />
          <div className="space-y-2">
            <Box tone="out" title="Clinician dashboard" items={["Risk-sorted triage", "Alerts with reasons", "What-if simulator", "AGP report, FHIR export"]} />
            <Box tone="out" title="Copilot" items={["Grounded summaries", "Offline rule engine", "Optional hosted model"]} />
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="From data to decision">
          <ol className="space-y-3">
            <Step n={1} title="Cold start from the record">Routine labs (HbA1c, fasting glucose and insulin via HOMA-IR/HOMA-B, weight) set the twin's prior physiology, so it is useful on day zero.</Step>
            <Step n={2} title="Personalise during onboarding">The first days of CGM, meals and activity refine insulin sensitivity, beta-cell response, absorption speed, exercise response and dawn effect (maximum a posteriori fit of the twin's own forecasts).</Step>
            <Step n={3} title="Stay in sync">Each new CGM sample corrects the virtual patient's state; unobserved insulin, gut content and exercise effects evolve through the physiology.</Step>
            <Step n={4} title="Forecast and explain">The ML layer predicts glucose 30–120 min ahead using all streams plus the twin's forecast, with calibrated intervals and a per-stream explanation of every alert.</Step>
            <Step n={5} title="Simulate before acting">The doctor tests meal swaps, walks, sleep and medication changes on the patient's own physiology and sees the expected change in peak and time above range.</Step>
          </ol>
        </Card>
        <div className="space-y-4">
          <Card title="Safety and privacy by design">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
              <li>Digital Personal Data Protection Act 2023: purpose-bound consent recorded per patient, notice in the patient's language, data minimisation, retention limits; only fictional or de-identified open data used.</li>
              <li>No leakage: patient-level cross-validation; every on-screen prediction comes from a model that never saw that patient.</li>
              <li>Decision support, not autonomous care: no dosing instructions; medication suggestions are framed for clinician review.</li>
              <li>Uncertainty is always shown (conformal intervals); simulations are labelled as model estimates.</li>
            </ul>
          </Card>
          <Card title="Standards">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
              <li>HL7 FHIR R4 bundles (structure compatible with ABDM health records)</li>
              <li>LOINC labs and HL7 CGM IG summary codes; SNOMED CT and ICD-10 diagnoses; WHO ATC medications</li>
              <li>International Consensus on Time in Range targets and the Ambulatory Glucose Profile</li>
              <li>Indian Diabetes Risk Score; Asian-Indian BMI and waist cut-offs</li>
            </ul>
          </Card>
          <Card title="Data provenance">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
              <li><b>Real (evidence):</b> CGMacros, PhysioNet (CC BY-NC-SA 4.0): 45 adults with Dexcom/Libre CGM, Fitbit, meals and labs. Downloaded by script, not redistributed.</li>
              <li><b>Synthetic (demo):</b> Bharat cohort of 80 fictional Indian patients generated from physiology with ICMR-INDIAB informed demographics and IFCT 2017 based foods.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
