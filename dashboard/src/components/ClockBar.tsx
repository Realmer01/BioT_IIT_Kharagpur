import { ChevronLeft, ChevronRight, FastForward, Pause, Play, Rewind } from "lucide-react";
import { useClock } from "../lib/clock";
import { fmtDay, fmtTime } from "../lib/format";

/** Replay control: scrub the virtual clinic clock across the 14-day monitoring window. */
export default function ClockBar() {
  const { minute, endMinute, setMinute, step, playing, togglePlay, timeOf } = useClock();
  const t = timeOf(minute);
  const days = Math.ceil((endMinute + 5) / 1440);
  const day = Math.floor(minute / 1440);
  const icon = { size: 15, strokeWidth: 1.9 };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Day" value={day} onChange={(e) => setMinute(Number(e.target.value) * 1440 + (minute % 1440))}
        className="input input-sm w-auto pr-8">
        {Array.from({ length: days }, (_, d) => <option key={d} value={d}>{fmtDay(timeOf(d * 1440))}</option>)}
      </select>
      <input aria-label="Time of day" type="range" min={0} max={1435} step={5} value={minute % 1440}
        onChange={(e) => setMinute(day * 1440 + Number(e.target.value))} className="w-32 sm:w-44" />
      <span className="tnum w-11 text-[13px] font-semibold text-ink">{fmtTime(t)}</span>
      <div className="flex items-center rounded-md border bg-card p-0.5">
        <button className="btn-icon h-7 w-7" title="Back 1 hour" onClick={() => step(-60)}><Rewind {...icon} /></button>
        <button className="btn-icon h-7 w-7" title="Back 5 minutes" onClick={() => step(-5)}><ChevronLeft {...icon} /></button>
        <button onClick={togglePlay} title={playing ? "Pause replay" : "Play replay"} className="btn-primary mx-0.5 h-7 px-2.5">
          {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}{playing ? "Pause" : "Replay"}
        </button>
        <button className="btn-icon h-7 w-7" title="Forward 5 minutes" onClick={() => step(5)}><ChevronRight {...icon} /></button>
        <button className="btn-icon h-7 w-7" title="Forward 1 hour" onClick={() => step(60)}><FastForward {...icon} /></button>
      </div>
    </div>
  );
}
