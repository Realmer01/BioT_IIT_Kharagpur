import type { Patient } from "../../lib/api";
import { Card } from "../ui";

const ITEMS: { k: string; label: string; unit: string; nd: number; help: string }[] = [
  { k: "insulin_sensitivity", label: "Insulin sensitivity", unit: "×10⁻⁴", nd: 2, help: "How strongly insulin lowers glucose (low = insulin resistant)" },
  { k: "beta_cell_response", label: "Beta-cell response", unit: "", nd: 3, help: "Insulin released per mg/dL rise in glucose" },
  { k: "disposition_index", label: "Disposition index", unit: "", nd: 2, help: "Beta-cell function adjusted for insulin resistance; falls as T2D progresses" },
  { k: "glucose_effectiveness", label: "Glucose effectiveness", unit: "%/min", nd: 2, help: "Glucose clearance independent of insulin" },
  { k: "absorption_speed", label: "Meal absorption speed", unit: "×", nd: 2, help: "How fast carbohydrate reaches the blood (above 1 = faster than typical)" },
  { k: "exercise_response", label: "Exercise response", unit: "", nd: 2, help: "Glucose lowering per MET of activity" },
  { k: "dawn_effect", label: "Dawn effect", unit: "mg/dL/min", nd: 3, help: "Early-morning liver glucose output (dawn phenomenon)" },
];

/** The twin's personalised physiology, estimated from EHR prior + 4 days of streams. */
export default function PhenotypeCard({ p }: { p: Patient }) {
  return (
    <Card title="Twin phenotype" subtitle="Physiology the twin inferred for this patient (record prior × CGM and wearable data). The marker is the patient's percentile in the clinic.">
      <ul className="space-y-3">
        {ITEMS.map((it) => {
          const v = p.phenotype[it.k];
          const pc = p.phenotype_percentile[it.k] ?? 50;
          return (
            <li key={it.k} title={it.help}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-ink">{it.label}</span>
                <span className="whitespace-nowrap"><b className="font-semibold text-ink">{v?.toFixed(it.nd)}</b> <span className="text-muted">{it.unit}</span> <span className="text-faint">·</span> <span className="text-muted">p{Math.round(pc)}</span></span>
              </div>
              <div className="relative mt-1.5 h-1 rounded-full bg-[var(--grid)]">
                <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--axis)]" />
                <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--card)]" style={{ left: `${pc}%`, background: "var(--s1)" }} />
              </div>
              <div className="mt-1 text-[11px] leading-snug text-muted">{it.help}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
