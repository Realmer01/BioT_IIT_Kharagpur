import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { useFetch, type Agp, type Patient } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { AgpChart, DailyTir, TirBar } from "../Agp";
import { Card, Segmented, Stats } from "../ui";

const TARGET_LABEL: Record<string, string> = {
  "tir>70%": "Time in range above 70 %", "tir>50%": "Time in range above 50 %", "tbr<4%": "Time below 70 under 4 %",
  "tbr<1%": "Time below 70 under 1 %", "tbr_l2<1%": "Time below 54 under 1 %", "tar<25%": "Time above 180 under 25 %",
  "tar_l2<5%": "Time above 250 under 5 %", "tar_l2<10%": "Time above 250 under 10 %", "cv<=36%": "Variability (CV) at most 36 %",
};

export default function AgpTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const [days, setDays] = useState(14);
  const { data, loading } = useFetch<Agp>(`/api/patients/${p.patient_id}/agp?minute=${minute}&days=${days}`);
  if (!data) return <div className="py-16 text-center text-muted">Loading AGP…</div>;
  const s = data.summary;
  return (
    <div className={clsx("space-y-5", loading && "refetching")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink2">Ambulatory Glucose Profile per the International Consensus on Time in Range · {s.days} days · sensor active {s.active_pct.toFixed(0)} %</p>
        <Segmented value={days} onChange={setDays} options={[7, 14].map((d) => ({ value: d, label: `${d} days` }))} />
      </div>
      <Stats className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6" items={[
        { label: "Time in range 70–180", value: s.tir.toFixed(0), unit: "%", sub: "target above 70 %" },
        { label: "Time below 70", value: s.tbr.toFixed(1), unit: "%", sub: "target under 4 %", accent: s.tbr >= 4 ? "var(--critical-ink)" : undefined },
        { label: "Time above 180", value: s.tar.toFixed(0), unit: "%", sub: "target under 25 %" },
        { label: "Mean glucose", value: s.mean_glucose.toFixed(0), unit: "mg/dL" },
        { label: "GMI", value: s.gmi.toFixed(1), unit: "%", sub: `lab HbA1c ${p.hba1c} %` },
        { label: "Variability (CV)", value: s.cv.toFixed(0), unit: "%", sub: "target at most 36 %" },
      ]} />
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card title="Time in ranges">
          <TirBar s={s} />
          <ul className="mt-4 space-y-1.5 border-t pt-3.5 text-xs">
            {Object.entries(data.targets).map(([k, ok]) => (
              <li key={k} className="flex items-center gap-2">
                {ok ? <Check size={13} strokeWidth={2.4} style={{ color: "var(--good)" }} /> : <X size={13} strokeWidth={2.4} style={{ color: "var(--critical)" }} />}
                <span className="text-ink2">{TARGET_LABEL[k] ?? k}</span>
                <span className="ml-auto font-medium" style={{ color: ok ? "var(--good-ink)" : "var(--critical-ink)" }}>{ok ? "met" : "not met"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Glucose profile by time of day" subtitle="Median line, 25–75th percentile (dark band) and 5–95th percentile (light band); target zone shaded">
          <AgpChart agp={data} />
        </Card>
      </div>
      <Card title="Daily time in range" subtitle="One bar per day; the label is the share of time in range">
        <DailyTir agp={data} />
      </Card>
    </div>
  );
}
