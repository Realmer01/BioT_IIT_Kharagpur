import { useEffect, useRef, useState } from "react";

export async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** Fetch hook that keeps the previous data while refetching (no skeleton flash). */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!url) return;
    const id = ++seq.current;
    setLoading(true);
    getJSON<T>(url)
      .then((d) => { if (id === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (id === seq.current) setError(String(e)); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [url]);
  return { data, loading, error };
}

// ------------------------------------------------------------------ types
export type Status = "urgent" | "warning" | "watch" | "stable";

export interface CohortRow {
  patient_id: string; name: string; age: number; sex: string; city: string; group: string; group_label: string;
  hba1c: number; regimen: string[]; featured: boolean; headline?: string; glucose: number; slope: number;
  pred_60: number; p_hyper: number; p_hypo: number; p_spike: number; tir_7d?: number; tbr_7d?: number;
  gmi_7d?: number; alerts_24h: number; status: Status; priority: number; last_sample_min_ago: number;
}
export interface Story { patient_id: string; minute: number; time: string; headline: string; name: string }
export interface Cohort {
  time: string; minute: number; patients: CohortRow[]; stories: Story[];
  kpis: { monitored: number; urgent: number; warning: number; mean_tir: number; alerts_24h: number };
}

export interface Driver { feature: string; text: string; impact: number; direction: string }
export interface StreamShare { stream: string; label: string; share: number; signed: number }
export interface Alert {
  type: "low" | "hypo" | "hyper" | "high" | "spike"; severity: "urgent" | "warning" | "info"; probability: number; title: string;
  eta_min: number | null; predicted_peak?: number; predicted_min?: number; drivers: Driver[]; streams: StreamShare[]; actions: string[];
}
export interface Risk {
  patient_id: string; time: string; glucose: number; slope: number;
  probabilities: { hyper_2h: number; hypo_1h: number; spike_2h: number };
  forecast: Record<string, { pred: number; lo: number; hi: number }>;
  alerts: Alert[];
  context: { sleep_last_h?: number; steps_today?: number; minutes_since_meal?: number; carbs_last_3h?: number; gut_carbs?: number };
}
export interface ForecastPt { t: string; minute: number; pred: number; lo: number; hi: number; twin: number }
export interface Timeline {
  patient_id: string; time: string; minute: number;
  cgm: { t: string; g: number }[];
  wearable: { t: string; hr: number | null; steps: number; mets: number; sleep: number | null }[];
  meals: { t: string; name: string; slot: string; carbs: number; kcal: number; gi: number }[];
  forecast: ForecastPt[];
  forecast_track_60: { t: string; pred: number; lo: number; hi: number }[];
  future_actual: { t: string; g: number }[];
}
export interface Rx { drug: string; class?: string; atc?: string; daily_dose_mg?: number; daily_units?: number; frequency?: string }
export interface Patient {
  patient_id: string; name: string; sex: string; age: number; city: string; state: string; language: string; occupation: string;
  group: string; group_label: string; featured: boolean; headline?: string; story?: string; story_minute?: number; source: string;
  height_cm: number; weight_kg: number; bmi: number; waist_cm: number; sbp: number; dbp: number;
  hba1c: number; fpg: number; fasting_insulin: number; c_peptide: number; homa_ir: number; homa_b: number;
  tg: number; hdl: number; ldl: number; total_chol: number; egfr: number; urine_acr: number; alt: number; vitamin_b12: number;
  diabetes_years: number; family_history_t2d: string; tcf7l2_rs7903146: string; prs_percentile: number; idrs: number;
  diagnoses: { code: string; snomed: string; display: string; onset: string | null }[];
  regimen: Rx[]; other_medications: Rx[]; hba1c_history: { date: string; hba1c: number }[];
  lifestyle: Record<string, string | number | boolean>;
  consent: { purpose: string; granted: string; dpdp_notice_language: string; data_shared_with: string[]; retention_days: number };
  phenotype: Record<string, number>; phenotype_percentile: Record<string, number>; fold: number;
  data_sources: { stream: string; detail: string }[];
  usual_foods?: Record<string, string>;
}
export interface Rec { label: string; kind: string; delta_peak: number; delta_tar_min: number; delta_tbr_min: number; peak: number; min: number }
export interface ScenarioResult {
  label: string; curve: { minute: number; t: string; g: number }[]; peak: number; min: number;
  time_above_180_min: number; time_below_70_min: number; iauc: number; mean: number;
}
export interface Recommendations {
  time: string; baseline: { label: string; peak: number; min: number; time_above_180_min: number; time_below_70_min: number };
  recommendations: Rec[]; scenarios: ScenarioResult[];
}
export interface WhatIf { time: string; glucose: number; horizon: number; scenarios: ScenarioResult[]; method: string }
export interface Food { id: string; name: string; carbs: number; protein: number; fat: number; fiber: number; kcal: number; gi: number; slots: string[]; regions: string[] }
export interface AgpSummary {
  days: number; active_pct: number; mean_glucose: number; gmi: number; cv: number;
  tbr_l2: number; tbr_l1: number; tir: number; tar_l1: number; tar_l2: number; tbr: number; tar: number; tight_tir: number;
}
export interface Agp {
  summary: AgpSummary; targets: Record<string, boolean>;
  profile: { minute_of_day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  daily: { date: string; tbr_l2: number; tbr_l1: number; tir: number; tar_l1: number; tar_l2: number; mean_glucose: number }[];
}
