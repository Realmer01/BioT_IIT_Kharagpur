import { ChevronLeft, ChevronRight, Pause, Play, Rewind, FastForward } from "lucide-react";
import { useClock } from "../lib/clock";
import { fmtDay, fmtTime } from "../lib/format";

/** Replay control: scrub the virtual clinic clock across the 14-day monitoring window. */
export default function ClockBar() {
  const { minute, endMinute, setMinute, step, playing, togglePlay, timeOf } = useClock();
  const t = timeOf(minute);
  const days = Math.ceil((endMinute + 5) / 1440);
  const day = Math.floor(minute / 1440);
  const btn = "rounded-md p-1.5 text-ink2 hover:bg-page hover:text-ink";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Day" value={day} onChange={(e) => setMinute(Number(e.target.value) * 1440 + (minute % 1440))}
        className="rounded-md border bg-card px-2 py-1 text-sm">
        {Array.from({ length: days }, (_, d) => <option key={d} value={d}>{fmtDay(timeOf(d * 1440))}</option>)}
      </select>
      <input aria-label="Time of day" type="range" min={0} max={1435} step={5} value={minute % 1440}
        onChange={(e) => setMinute(day * 1440 + Number(e.target.value))} className="w-36 sm:w-48" />
      <span className="tnum w-12 text-sm font-semibold">{fmtTime(t)}</span>
      <div className="flex items-center">
        <button className={btn} title="-1 h" onClick={() => step(-60)}><Rewind size={16} /></button>
        <button className={btn} title="-5 min" onClick={() => step(-5)}><ChevronLeft size={16} /></button>
        <button onClick={togglePlay} title={playing ? "Pause replay" : "Play replay"}
          className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-sm font-medium text-onbrand">
          {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Pause" : "Replay"}
        </button>
        <button className={btn} title="+5 min" onClick={() => step(5)}><ChevronRight size={16} /></button>
        <button className={btn} title="+1 h" onClick={() => step(60)}><FastForward size={16} /></button>
      </div>
    </div>
  );
}
