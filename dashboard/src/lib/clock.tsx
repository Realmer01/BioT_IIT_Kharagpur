import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getJSON } from "./api";

/** Global replay clock. The Bharat cohort spans 14 days; the clinician (or the demo)
 *  can scrub to any moment and every view re-renders "as of" that minute. */
interface ClockCtx {
  minute: number; start: Date; endMinute: number; ready: boolean; playing: boolean;
  setMinute: (m: number) => void; togglePlay: () => void; step: (d: number) => void; timeOf: (m: number) => Date;
}
const Ctx = createContext<ClockCtx | null>(null);

export function ClockProvider({ children }: { children: ReactNode }) {
  const [minute, setMinuteRaw] = useState<number>(() => Number(new URLSearchParams(location.search).get("m")) || 0);
  const [start, setStart] = useState(new Date("2026-09-30T00:00:00"));
  const [endMinute, setEnd] = useState(14 * 1440 - 5);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    getJSON<{ default_minute: number; end_minute: number; start: string }>("/api/health").then((h) => {
      setStart(new Date(h.start));
      setEnd(h.end_minute);
      setMinuteRaw((m) => (m > 0 ? m : h.default_minute));
      setReady(true);
    });
  }, []);

  const setMinute = useCallback((m: number) => setMinuteRaw(Math.max(240, Math.min(endMinute, Math.round(m / 5) * 5))), [endMinute]);
  const step = useCallback((d: number) => setMinuteRaw((m) => Math.max(240, Math.min(endMinute, m + d))), [endMinute]);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  useEffect(() => {
    if (playing) timer.current = window.setInterval(() => step(5), 700);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, step]);

  useEffect(() => {
    if (!ready) return;
    const u = new URL(location.href);
    u.searchParams.set("m", String(minute));
    history.replaceState(null, "", u);
  }, [minute, ready]);

  const timeOf = useCallback((m: number) => new Date(start.getTime() + m * 60000), [start]);
  const value = useMemo(() => ({ minute, start, endMinute, ready, playing, setMinute, togglePlay, step, timeOf }),
    [minute, start, endMinute, ready, playing, setMinute, togglePlay, step, timeOf]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClock() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useClock outside provider");
  return c;
}
