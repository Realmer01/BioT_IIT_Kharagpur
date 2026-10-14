import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Timeline } from "../lib/api";
import { fmtTime } from "../lib/format";

const SLOT: Record<string, string> = { breakfast: "Bkfst", lunch: "Lunch", dinner: "Dinner", snack: "Snack", drink: "Tea", sweet: "Sweet" };

interface Row { ts: number; cgm?: number; pred?: number; band?: [number, number]; twin?: number; track?: number; future?: number }

export default function GlucoseChart({ tl, showFuture, showTrack, showTwin, height = 300 }:
  { tl: Timeline; showFuture: boolean; showTrack: boolean; showTwin: boolean; height?: number }) {
  const { rows, domain, now, yMax } = useMemo(() => {
    const m = new Map<number, Row>();
    const get = (t: string) => { const ts = new Date(t).getTime(); if (!m.has(ts)) m.set(ts, { ts }); return m.get(ts)!; };
    tl.cgm.forEach((p) => (get(p.t).cgm = p.g));
    tl.forecast.forEach((p) => { const r = get(p.t); r.pred = p.pred; r.band = [p.lo, p.hi]; r.twin = p.twin; });
    if (showTrack) tl.forecast_track_60.forEach((p) => (get(p.t).track = p.pred));
    if (showFuture) tl.future_actual.forEach((p) => { if (new Date(p.t).getTime() <= new Date(tl.forecast.at(-1)!.t).getTime()) get(p.t).future = p.g; });
    const rows = [...m.values()].sort((a, b) => a.ts - b.ts);
    const now = new Date(tl.time).getTime();
    const lo = tl.cgm.length ? new Date(tl.cgm[0].t).getTime() : now - 864e5;
    const hi = tl.forecast.length ? new Date(tl.forecast.at(-1)!.t).getTime() : now;
    const vmax = Math.max(220, ...rows.map((r) => Math.max(r.cgm ?? 0, r.band?.[1] ?? 0, r.future ?? 0)));
    return { rows, domain: [lo, hi] as [number, number], now, yMax: Math.min(400, Math.ceil((vmax + 15) / 50) * 50) };
  }, [tl, showFuture, showTrack]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const step = 3 * 3600e3;
    let t = Math.ceil(domain[0] / step) * step;
    for (; t <= domain[1]; t += step) out.push(t);
    return out;
  }, [domain]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 18, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <ReferenceArea y1={70} y2={180} fill="var(--band)" stroke="none" ifOverflow="extendDomain" />
        <XAxis dataKey="ts" type="number" scale="time" domain={domain} ticks={ticks} tickFormatter={(v) => fmtTime(new Date(v))}
          stroke="var(--axis)" tickLine={false} />
        <YAxis domain={[40, yMax]} ticks={[54, 70, 120, 180, 250, 300, 350, 400].filter((v) => v <= yMax)} stroke="var(--axis)" tickLine={false} width={48} />
        <ReferenceLine y={70} stroke="var(--critical)" strokeWidth={1} label={{ value: "70", position: "right", fill: "var(--critical)", fontSize: 10 }} />
        <ReferenceLine y={180} stroke="var(--warning)" strokeWidth={1} label={{ value: "180", position: "right", fill: "var(--ink-2)", fontSize: 10 }} />
        <ReferenceArea x1={now} x2={domain[1]} fill="var(--page)" fillOpacity={0.55} stroke="none" />
        {tl.meals.map((ml) => (
          <ReferenceLine key={ml.t + ml.name} x={new Date(ml.t).getTime()} stroke="var(--axis)" strokeWidth={1}
            label={{ value: `${SLOT[ml.slot] ?? "Meal"} ${Math.round(ml.carbs)}g`, position: "insideTopLeft", fill: "var(--ink-2)", fontSize: 10 }} />
        ))}
        <ReferenceLine x={now} stroke="var(--ink-2)" strokeWidth={1.5} label={{ value: "Now", position: "top", fill: "var(--ink)", fontSize: 11, fontWeight: 600 }} />
        <Area dataKey="band" stroke="none" fill="var(--s2)" fillOpacity={0.18} isAnimationActive={false} connectNulls name="90% interval" />
        {showTwin && <Line dataKey="twin" stroke="var(--ink-2)" strokeDasharray="2 3" strokeWidth={2} dot={false} isAnimationActive={false} name="Physiology only" />}
        {showTrack && <Line dataKey="track" stroke="var(--s3)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls name="Forecast made 60 min earlier" />}
        <Line dataKey="cgm" stroke="var(--s1)" strokeWidth={2} dot={false} isAnimationActive={false} name="CGM glucose" />
        {showFuture && <Line dataKey="future" stroke="var(--s1)" strokeOpacity={0.45} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls name="What actually happened" />}
        <Line dataKey="pred" stroke="var(--s2)" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls name="Twin forecast" />
        <Tooltip content={<Tip />} cursor={{ stroke: "var(--axis)" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Tip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: number }) {
  if (!active || !payload?.length) return null;
  const r: Row = payload[0].payload;
  const line = (name: string, v?: number, c?: string) => v == null ? null : (
    <div className="flex justify-between gap-4"><span className="flex items-center gap-1.5 text-ink2">
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />{name}</span><span className="tnum font-semibold text-ink">{Math.round(v)}</span></div>
  );
  return (
    <div className="card min-w-[190px] px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{fmtTime(new Date(label!))}</div>
      {line("CGM", r.cgm, "var(--s1)")}
      {line("Forecast", r.pred, "var(--s2)")}
      {r.band && <div className="flex justify-between gap-4 text-ink2"><span className="pl-3.5">90% interval</span><span className="tnum">{Math.round(r.band[0])}–{Math.round(r.band[1])}</span></div>}
      {line("Physiology only", r.twin, "var(--ink-2)")}
      {line("Predicted 60 min before", r.track, "var(--s3)")}
      {line("Actual (revealed)", r.future, "var(--s1)")}
      <div className="mt-1 text-[10px] text-muted">mg/dL</div>
    </div>
  );
}
