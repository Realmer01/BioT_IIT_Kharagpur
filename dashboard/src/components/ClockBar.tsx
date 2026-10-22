import { useClock } from "../lib/clock";
import { fmtDay, fmtTime } from "../lib/format";

/** Replay control: scrub the virtual clinic clock across the 14-day monitoring window. */
export default function ClockBar() {
  const { minute, endMinute, setMinute, step, playing, togglePlay, timeOf } = useClock();
  const t = timeOf(minute);
  const days = Math.ceil((endMinute + 5) / 1440);
  const day = Math.floor(minute / 1440);
  const stepBtn = "h-7 border-l border-strong px-2 text-xs text-ink2 transition-colors first:border-l-0 hover:bg-surface hover:text-ink";
  const stamp = t.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 md:w-auto md:flex-1">
      <div className="flex items-baseline gap-2.5">
        <span className="text-xs text-muted">Clinic time</span>
        <span className="font-mono text-[13px] font-medium text-ink">{stamp} {fmtTime(t)}</span>
        {playing && <span className="text-xs font-medium text-brand">replaying</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Day" value={day} onChange={(e) => setMinute(Number(e.target.value) * 1440 + (minute % 1440))} className="input input-sm h-7 w-auto pr-8 text-xs">
          {Array.from({ length: days }, (_, d) => <option key={d} value={d}>{fmtDay(timeOf(d * 1440))}</option>)}
        </select>
        <input aria-label="Time of day" type="range" min={0} max={1435} step={5} value={minute % 1440}
          onChange={(e) => setMinute(day * 1440 + Number(e.target.value))} className="w-28 sm:w-40" />
        <div className="flex overflow-hidden rounded border border-strong bg-card">
          <button className={stepBtn} title="Back one hour" onClick={() => step(-60)}>−1 h</button>
          <button className={stepBtn} title="Back five minutes" onClick={() => step(-5)}>−5 min</button>
        </div>
        <button onClick={togglePlay} className="btn-primary h-7 w-[76px] px-2 text-xs">{playing ? "Pause" : "Replay"}</button>
        <div className="flex overflow-hidden rounded border border-strong bg-card">
          <button className={stepBtn} title="Forward five minutes" onClick={() => step(5)}>+5 min</button>
          <button className={stepBtn} title="Forward one hour" onClick={() => step(60)}>+1 h</button>
        </div>
      </div>
    </div>
  );
}
