import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Timeline } from "../lib/api";
import { fmtTime } from "../lib/format";

const SLEEP_Y: Record<number, number> = { 0: 3, 3: 2, 1: 1, 2: 0 }; // hypnogram: wake top, deep bottom
const SLEEP_NAME = ["Deep", "Light", "REM", "Awake"];

/** Time-aligned small multiples (never a dual axis): heart rate, steps, sleep stages. */
export default function WearableStrips({ tl }: { tl: Timeline }) {
  const { rows, domain, now } = useMemo(() => {
    const rows = tl.wearable.map((w) => ({
      ts: new Date(w.t).getTime(), hr: w.sleep != null && w.hr != null ? w.hr : w.hr, steps: w.steps,
      sleep: w.sleep == null ? null : SLEEP_Y[Math.round(w.sleep)] ?? null,
    }));
    const now = new Date(tl.time).getTime();
    const lo = tl.cgm.length ? new Date(tl.cgm[0].t).getTime() : rows[0]?.ts ?? now;
    const hi = tl.forecast.length ? new Date(tl.forecast.at(-1)!.t).getTime() : now;
    return { rows, domain: [lo, hi] as [number, number], now };
  }, [tl]);

  const axis = (show: boolean) => (
    <XAxis dataKey="ts" type="number" scale="time" domain={domain} hide={!show} tickFormatter={(v) => fmtTime(new Date(v))}
      stroke="var(--axis)" tickLine={false} />
  );
  const hasSleep = rows.some((r) => r.sleep != null);
  const strip = (title: string, child: JSX.Element, h = 64) => (
    <div>
      <div className="mb-0.5 pl-1 text-[11px] font-medium text-ink2">{title}</div>
      <ResponsiveContainer width="100%" height={h}>{child}</ResponsiveContainer>
    </div>
  );
  const margin = { top: 2, right: 30, bottom: 0, left: -12 };
  return (
    <div className="space-y-1.5">
      {strip("Heart rate (bpm)",
        <ComposedChart data={rows} margin={margin}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          {axis(false)}
          <YAxis domain={[(v: number) => Math.floor((v - 5) / 10) * 10, (v: number) => Math.ceil((v + 5) / 10) * 10]} stroke="var(--axis)"
            tickLine={false} width={48} tickCount={3} allowDecimals={false} tickFormatter={(v) => String(Math.round(v))} />
          <ReferenceLine x={now} stroke="var(--ink-2)" />
          <Line dataKey="hr" stroke="var(--s3)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Tooltip content={<Tip unit="bpm" k="hr" />} />
        </ComposedChart>)}
      {strip("Steps (per 5 min)",
        <ComposedChart data={rows} margin={margin}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          {axis(!hasSleep)}
          <YAxis stroke="var(--axis)" tickLine={false} width={48} tickCount={3} allowDecimals={false} />
          <ReferenceLine x={now} stroke="var(--ink-2)" />
          <Bar dataKey="steps" fill="var(--s3)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Tooltip content={<Tip unit="steps" k="steps" />} />
        </ComposedChart>, hasSleep ? 56 : 80)}
      {hasSleep && strip("Sleep stages",
        <ComposedChart data={rows} margin={margin}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          {axis(true)}
          <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} interval={0} tickFormatter={(v) => SLEEP_NAME[v]} stroke="var(--axis)" tickLine={false} width={48}
            tick={{ fontSize: 10, fill: "var(--muted)" }} />
          <ReferenceLine x={now} stroke="var(--ink-2)" />
          <Line type="stepAfter" dataKey="sleep" stroke="var(--brand)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
          <Tooltip content={<Tip k="sleep" />} />
        </ComposedChart>, 92)}
    </div>
  );
}

function Tip({ active, payload, label, unit, k }: { active?: boolean; payload?: any[]; label?: number; unit?: string; k: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].payload[k];
  if (v == null) return null;
  const text = k === "sleep" ? SLEEP_NAME[v] : `${Math.round(v)} ${unit}`;
  return <div className="card px-2 py-1 text-xs shadow"><span className="text-muted">{fmtTime(new Date(label!))}</span> · <b>{text}</b></div>;
}
