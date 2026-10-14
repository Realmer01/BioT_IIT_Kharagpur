import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Agp, AgpSummary } from "../lib/api";
import { TIR_COLORS, TIR_LABELS } from "../lib/format";

const ORDER = ["tar_l2", "tar_l1", "tir", "tbr_l1", "tbr_l2"] as const;

/** Standard AGP time-in-ranges bar (consensus colours, always labelled). */
export function TirBar({ s, height = 220 }: { s: AgpSummary; height?: number }) {
  return (
    <div className="flex items-stretch gap-3" style={{ height }}>
      <div className="flex w-9 flex-col gap-[2px] overflow-hidden rounded-md">
        {ORDER.map((k) => (
          <div key={k} title={`${TIR_LABELS[k]}: ${s[k].toFixed(1)}%`} style={{ flexGrow: Math.max(s[k], 0.6), background: TIR_COLORS[k] }} />
        ))}
      </div>
      <ul className="flex flex-col justify-between py-0.5 text-xs">
        {ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIR_COLORS[k] }} />
            <span className="w-28 text-ink2">{TIR_LABELS[k]}</span>
            <span className="tnum font-semibold text-ink">{s[k].toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ambulatory glucose profile: median, IQR and 5-95th percentile by time of day. */
export function AgpChart({ agp, height = 260 }: { agp: Agp; height?: number }) {
  const rows = agp.profile.map((p) => ({ m: p.minute_of_day, p50: p.p50, iqr: [p.p25, p.p75], outer: [p.p5, p.p95] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <ReferenceArea y1={70} y2={180} fill="var(--band)" stroke="none" />
        <XAxis dataKey="m" type="number" domain={[0, 1440]} ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]}
          tickFormatter={(v) => `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:00`} stroke="var(--axis)" tickLine={false} />
        <YAxis domain={[40, 350]} ticks={[54, 70, 180, 250, 350]} stroke="var(--axis)" tickLine={false} width={48} />
        <Area dataKey="outer" stroke="none" fill="var(--s1)" fillOpacity={0.12} isAnimationActive={false} name="5–95th percentile" />
        <Area dataKey="iqr" stroke="none" fill="var(--s1)" fillOpacity={0.3} isAnimationActive={false} name="25–75th percentile" />
        <Line dataKey="p50" stroke="var(--s1)" strokeWidth={2} dot={false} isAnimationActive={false} name="Median" />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const r: any = payload[0].payload;
          const hh = `${String(Math.floor(r.m / 60)).padStart(2, "0")}:${String(r.m % 60).padStart(2, "0")}`;
          return (
            <div className="card px-3 py-2 text-xs shadow">
              <div className="font-semibold">{hh}</div>
              <div>Median <b className="tnum">{Math.round(r.p50)}</b></div>
              <div className="text-ink2">IQR {Math.round(r.iqr[0])}–{Math.round(r.iqr[1])} · 5–95% {Math.round(r.outer[0])}–{Math.round(r.outer[1])}</div>
            </div>
          );
        }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** One thin stacked bar per day: daily time in ranges. */
export function DailyTir({ agp }: { agp: Agp }) {
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {agp.daily.map((d) => (
        <div key={d.date} className="flex w-9 shrink-0 flex-col items-center gap-1">
          <div className="flex h-28 w-4 flex-col gap-[2px] overflow-hidden rounded" title={`${d.date}: TIR ${d.tir.toFixed(0)}%`}>
            {ORDER.map((k) => <div key={k} style={{ flexGrow: Math.max(d[k], 0.0001), background: TIR_COLORS[k] }} />)}
          </div>
          <span className="tnum text-[10px] text-ink2">{d.tir.toFixed(0)}%</span>
          <span className="text-[10px] text-muted">{new Date(d.date).getDate()}</span>
        </div>
      ))}
    </div>
  );
}
