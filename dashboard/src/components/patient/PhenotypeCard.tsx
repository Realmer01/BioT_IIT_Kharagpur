import type { Patient } from "../../lib/api";
import { Card } from "../ui";

const ITEMS: { k: string; label: string; unit: string; nd: number; help: string }[] = [
  { k: "insulin_sensitivity", label: "Insulin sensitivity", unit: "×10⁻⁴", nd: 2, help: "How strongly insulin lowers glucose (low = insulin resistant)" },
  { k: "beta_cell_response", label: "Beta-cell response", unit: "", nd: 3, help: "Insulin released per mg/dL rise in glucose" },
  { k: "disposition_index", label: "Disposition index", unit: "", nd: 2, help: "Beta-cell function adjusted for insulin resistance; falls as T2D progresses" },
  { k: "glucose_effectiveness", label: "Glucose effectiveness", unit: "%/min", nd: 2, help: "Glucose clearance independent of insulin" },
  { k: "absorption_speed", label: "Meal absorption speed", unit: "×", nd: 2, help: "How fast carbohydrate reaches the blood (>1 = faster than typical)" },
  { k: "exercise_response", label: "Exercise response", unit: "", nd: 2, help: "Glucose lowering per MET of activity" },
  { k: "dawn_effect", label: "Dawn effect", unit: "mg/dL/min", nd: 3, help: "Early-morning liver glucose output (dawn phenomenon)" },
];

/** The twin's personalised physiology, estimated from EHR prior + 4 days of streams. */
export default function PhenotypeCard({ p }: { p: Patient }) {
  return (
    <Card title="Twin phenotype" subtitle="Physiology the twin inferred for this patient (EHR prior × CGM/wearable likelihood). Bar = percentile in the clinic.">
      <ul className="space-y-2.5">
        {ITEMS.map((it) => {
          const v = p.phenotype[it.k];
          const pc = p.phenotype_percentile[it.k] ?? 50;
          return (
            <li key={it.k} title={it.help}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-ink">{it.label}</span>
                <span><b className="tnum text-ink">{v?.toFixed(it.nd)}</b> <span className="text-muted">{it.unit}</span> <span className="tnum text-muted">· p{Math.round(pc)}</span></span>
              </div>
              <div className="relative mt-1 h-1.5 rounded-full bg-page">
                <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: `${pc}%`, background: "var(--s1)" }} />
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted">{it.help}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
