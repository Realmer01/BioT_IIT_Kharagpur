import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { useFetch, type Agp, type Patient } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { AgpChart, DailyTir, TirBar } from "../Agp";
import { Card, StatTile } from "../ui";

export default function AgpTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const [days, setDays] = useState(14);
  const { data, loading } = useFetch<Agp>(`/api/patients/${p.patient_id}/agp?minute=${minute}&days=${days}`);
  if (!data) return <div className="py-16 text-center text-muted">Loading AGP…</div>;
  const s = data.summary;
  return (
    <div className={clsx("space-y-4", loading && "refetching")}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink2">Ambulatory Glucose Profile per the International Consensus on Time in Range · {s.days} days · sensor active {s.active_pct.toFixed(0)}%</p>
        <div className="flex gap-1">{[7, 14].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={clsx("rounded px-2 py-0.5 text-xs", days === d ? "bg-brandsoft font-semibold text-brand" : "text-ink2 hover:bg-page")}>{d} days</button>
        ))}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Time in range 70–180" value={s.tir.toFixed(0)} unit="%" sub="target >70 %" />
        <StatTile label="Time below 70" value={s.tbr.toFixed(1)} unit="%" sub="target <4 %" />
        <StatTile label="Time above 180" value={s.tar.toFixed(0)} unit="%" sub="target <25 %" />
        <StatTile label="Mean glucose" value={s.mean_glucose.toFixed(0)} unit="mg/dL" />
        <StatTile label="GMI" value={s.gmi.toFixed(1)} unit="%" sub={`lab HbA1c ${p.hba1c}%`} />
        <StatTile label="Variability (CV)" value={s.cv.toFixed(0)} unit="%" sub="target ≤36 %" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card title="Time in ranges">
          <TirBar s={s} />
          <ul className="mt-4 space-y-1 border-t pt-3 text-xs">
            {Object.entries(data.targets).map(([k, ok]) => (
              <li key={k} className="flex items-center gap-1.5">
                {ok ? <Check size={13} style={{ color: "var(--good)" }} /> : <X size={13} style={{ color: "var(--critical)" }} />}
                <span className="text-ink2">{k.replace("_l2", " level 2").replace("tbr", "TBR").replace("tar", "TAR").replace("tir", "TIR").replace("cv", "CV")}</span>
                <span className="ml-auto text-muted">{ok ? "met" : "not met"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Glucose profile by time of day" subtitle="Median (line), 25–75th (dark band) and 5–95th percentile (light band); target zone shaded">
          <AgpChart agp={data} />
        </Card>
      </div>
      <Card title="Daily time in range" subtitle="One bar per day; label = % in range">
        <DailyTir agp={data} />
      </Card>
    </div>
  );
}
