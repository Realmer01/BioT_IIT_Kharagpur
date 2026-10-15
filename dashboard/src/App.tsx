import clsx from "clsx";
import { FlaskConical, Info, Moon, Sun, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import ClockBar from "./components/ClockBar";
import { useClock } from "./lib/clock";
import { fmtDay, fmtTime } from "./lib/format";
import About from "./pages/About";
import Cohort from "./pages/Cohort";
import Onboard from "./pages/Onboard";
import PatientPage from "./pages/Patient";
import Validation from "./pages/Validation";

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("mt-theme") || ""; } catch { return ""; }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("mt-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const dark = theme === "dark" || (!theme && matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button onClick={() => setTheme(dark ? "light" : "dark")} title={dark ? "Light theme" : "Dark theme"} className="btn-icon">
      {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  );
}

const NAV = [
  { group: "Clinic", items: [
    { to: "/", label: "Remote monitoring", short: "Clinic", icon: Users },
    { to: "/onboard", label: "New patient", short: "New patient", icon: UserPlus },
  ] },
  { group: "Model", items: [
    { to: "/validation", label: "Evidence", short: "Evidence", icon: FlaskConical },
    { to: "/about", label: "How it works", short: "How it works", icon: Info },
  ] },
];
const FLAT = NAV.flatMap((g) => g.items);

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.svg" className={compact ? "h-7 w-7" : "h-8 w-8"} alt="" />
      <div className="leading-none">
        <div className="font-serif text-[18px] font-semibold tracking-[-0.01em] text-ink">MadhuTwin</div>
        {!compact && <div className="mt-1 text-[11px] text-muted">Diabetes digital twin</div>}
      </div>
    </div>
  );
}

export default function App() {
  const { ready, minute, timeOf } = useClock();
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 pb-4 pt-5 md:flex">
        <div className="px-2.5"><Brand /></div>
        <nav className="mt-7 space-y-5">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="label px-2.5 pb-1.5 text-[10.5px]">{g.group}</div>
              <div className="space-y-0.5">
                {g.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to + location.search} end={to === "/"}
                    className={({ isActive }) => clsx("group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] transition-colors",
                      isActive ? "bg-brandsoft font-semibold text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-ink2 hover:bg-page hover:text-ink")}>
                    {({ isActive }) => (<><Icon size={16} strokeWidth={1.75} className={isActive ? "text-ink" : "text-faint group-hover:text-ink2"} />{label}</>)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2.5 text-[11px] leading-relaxed text-muted">
          <div className="border-t pt-3">
            <div className="font-medium text-ink2">Clinical decision support</div>
            <div>Not a medical device. Cohort patients are fictional; uploaded patients are marked. Evidence uses real CGMacros data.</div>
          </div>
          <div className="text-faint">Team BioT · IIT Kharagpur</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-card/85 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:px-6">
            <div className="md:hidden"><Brand compact /></div>
            <div className="hidden items-baseline gap-2 sm:flex">
              <span className="label text-[10.5px]">Clinic clock</span>
              <span className="text-[13px] text-ink2">{ready ? `${fmtDay(timeOf(minute))}, ${fmtTime(timeOf(minute))}` : "…"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {ready && <ClockBar />}
              <ThemeToggle />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto whitespace-nowrap border-t px-3 md:hidden">
            {FLAT.map(({ to, short }) => (
              <NavLink key={to} to={to + location.search} end={to === "/"}
                className={({ isActive }) => clsx("-mb-px border-b-2 px-2 py-2 text-[13px]", isActive ? "border-brand font-semibold text-ink" : "border-transparent text-muted")}>{short}</NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 md:px-8 md:py-7">
          {ready ? (
            <Routes>
              <Route path="/" element={<Cohort />} />
              <Route path="/patient/:pid" element={<PatientPage />} />
              <Route path="/onboard" element={<Onboard />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/about" element={<About />} />
            </Routes>
          ) : <div className="py-20 text-center text-muted">Loading twins…</div>}
        </main>
      </div>
    </div>
  );
}
