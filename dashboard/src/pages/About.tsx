import { ArrowDown, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, PageHeader } from "../components/ui";

function Box({ title, kicker, items, tone = "plain" }: { title: string; kicker?: string; items: string[]; tone?: "plain" | "core" | "out" }) {
  const cls = tone === "core" ? "border-brand/25 bg-brandsoft" : tone === "out" ? "bg-surface" : "bg-card";
  return (
    <div className={`flex-1 rounded-lg border px-4 py-3.5 ${cls}`}>
      {kicker && <div className="eyebrow mb-1 text-[10px]">{kicker}</div>}
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <ul className="dot-list mt-2 space-y-1 text-xs leading-snug text-ink2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
const Arrow = () => (
  <div className="flex items-center justify-center text-faint">
    <ArrowDown size={18} strokeWidth={1.6} className="lg:hidden" /><ArrowRight size={18} strokeWidth={1.6} className="hidden lg:block" />
  </div>
);
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 border-t py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <span className="display text-[22px] leading-none text-accent">{String(n).padStart(2, "0")}</span>
      <div><div className="text-[13.5px] font-semibold text-ink">{title}</div><div className="mt-0.5 text-[13px] leading-relaxed text-ink2">{children}</div></div>
    </li>
  );
}

export default function About() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="How it works" title="A physiological twin, corrected by machine learning">
        Each patient gets a personalised model of their glucose and insulin system, kept in sync with live wearable streams, with a
        machine-learning layer that corrects what physiology misses and explains every alert.
      </PageHeader>
      <Card title="System architecture">
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.3fr_auto_1fr_auto_1fr]">
          <div className="flex flex-col gap-3">
            <Box kicker="Static" title="Health record (FHIR R4)" items={["Demographics, diagnoses", "HbA1c, fasting glucose and insulin, lipids, eGFR", "Medications (WHO ATC)", "TCF7L2, polygenic risk"]} />
            <Box kicker="Dynamic" title="Live streams, every 5 min" items={["CGM glucose", "Heart rate, steps, METs", "Sleep stages, HRV", "Meal log (Indian foods)"]} />
          </div>
          <Arrow />
          <div className="flex"><Box tone="core" kicker="Twin" title="Physiological model" items={[
            "Extended Bergman minimal model with gut absorption", "Exercise, sleep debt, dawn effect, circadian rhythm", "Metformin, SU, DPP-4i, SGLT2i, AGI, TZD, insulin",
            "Personalised: record prior × onboarding data", "Kept in sync with every CGM sample"]} /></div>
          <Arrow />
          <div className="flex"><Box tone="core" kicker="Learning" title="Hybrid ML layer" items={["XGBoost residual forecaster, 30–120 min", "Conformal 90 % intervals", "Hyper, spike and hypo risk", "TreeSHAP explanations by stream"]} /></div>
          <Arrow />
          <div className="flex flex-col gap-3">
            <Box tone="out" kicker="Clinician" title="Dashboard" items={["Risk-sorted triage", "Alerts with reasons", "What-if simulator", "AGP report, FHIR export"]} />
            <Box tone="out" kicker="Assist" title="Copilot" items={["Grounded summaries", "Offline rule engine", "Optional hosted model"]} />
          </div>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="From data to decision">
          <ol>
            <Step n={1} title="Cold start from the record">Routine labs (HbA1c, fasting glucose and insulin via HOMA-IR and HOMA-B, weight) set the twin's prior physiology, so it is useful on day zero.</Step>
            <Step n={2} title="Personalise during onboarding">The first days of CGM, meals and activity refine insulin sensitivity, beta-cell response, absorption speed, exercise response and dawn effect (a maximum a posteriori fit of the twin's own forecasts).</Step>
            <Step n={3} title="Stay in sync">Each new CGM sample corrects the virtual patient's state; unobserved insulin, gut content and exercise effects evolve through the physiology.</Step>
            <Step n={4} title="Forecast and explain">The ML layer predicts glucose 30 to 120 minutes ahead from all streams plus the twin's forecast, with calibrated intervals and a per-stream explanation of every alert.</Step>
            <Step n={5} title="Simulate before acting">The doctor tests meal swaps, walks, sleep and medication changes on the patient's own physiology and sees the expected change in peak and time above range.</Step>
          </ol>
        </Card>
        <div className="space-y-5">
          <Card title="Safety and privacy by design">
            <ul className="dot-list space-y-2 text-[13px] leading-relaxed text-ink2">
              <li>Digital Personal Data Protection Act 2023: purpose-bound consent per patient, notice in the patient's language, data minimisation and retention limits; only fictional or de-identified open data is used.</li>
              <li>No leakage: patient-level cross-validation, and every on-screen prediction comes from a model that never saw that patient.</li>
              <li>Decision support, not autonomous care: no dosing instructions; medication suggestions are framed for clinician review.</li>
              <li>Uncertainty is always shown (conformal intervals) and simulations are labelled as model estimates. Alert colours follow medical-alarm priority (IEC 60601-1-8).</li>
            </ul>
          </Card>
          <Card title="Standards">
            <ul className="dot-list space-y-2 text-[13px] leading-relaxed text-ink2">
              <li>HL7 FHIR R4 bundles (structure compatible with ABDM health records)</li>
              <li>LOINC labs and HL7 CGM IG summary codes; SNOMED CT and ICD-10 diagnoses; WHO ATC medications</li>
              <li>International Consensus on Time in Range targets and the Ambulatory Glucose Profile</li>
              <li>Indian Diabetes Risk Score; Asian-Indian BMI and waist cut-offs</li>
            </ul>
          </Card>
          <Card title="Data provenance">
            <ul className="dot-list space-y-2 text-[13px] leading-relaxed text-ink2">
              <li><b className="font-semibold text-ink">Real (evidence):</b> CGMacros, PhysioNet (CC BY-NC-SA 4.0): 45 adults with Dexcom or Libre CGM, Fitbit, meals and labs. Downloaded by script, not redistributed.</li>
              <li><b className="font-semibold text-ink">Synthetic (demo):</b> the Bharat cohort of 80 fictional Indian patients, generated from physiology with ICMR-INDIAB informed demographics and IFCT 2017 based foods.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
