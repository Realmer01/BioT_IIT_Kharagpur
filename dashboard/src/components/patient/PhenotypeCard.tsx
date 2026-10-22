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
    <Card title="Personalised physiology" divider pad={false} subtitle="Estimated from the record and the first days of sensor data. Position shows the clinic percentile.">
      <table className="data-table">
        <thead><tr><th className="pl-4">Parameter</th><th className="num">Value</th><th className="pr-4">Clinic percentile</th></tr></thead>
        <tbody>
          {ITEMS.map((it) => {
            const v = p.phenotype[it.k];
            const pc = p.phenotype_percentile[it.k] ?? 50;
            return (
              <tr key={it.k} title={it.help}>
                <td className="pl-4">
                  <div className="text-ink">{it.label}</div>
                  <div className="text-[11.5px] leading-snug text-muted">{it.help}</div>
                </td>
                <td className="num whitespace-nowrap"><span className="font-semibold text-ink">{v?.toFixed(it.nd)}</span>{it.unit && <span className="ml-1 text-xs text-muted">{it.unit}</span>}</td>
                <td className="pr-4">
                  <div className="flex items-center gap-2">
                    <div className="relative h-[3px] w-20 bg-[var(--grid)]">
                      <div className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--axis)]" />
                      <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pc}%`, background: "var(--s1)" }} />
                    </div>
                    <span className="w-8 text-xs text-muted">p{Math.round(pc)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
