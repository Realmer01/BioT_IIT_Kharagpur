import { Activity, FlaskConical, Info, Moon, Sun, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import ClockBar from "./components/ClockBar";
import { useClock } from "./lib/clock";
import { fmtDay } from "./lib/format";
import About from "./pages/About";
import Cohort from "./pages/Cohort";
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
    <button onClick={() => setTheme(dark ? "light" : "dark")} title="Toggle theme" className="rounded-md p-2 text-ink2 hover:bg-page">
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

const nav = [
  { to: "/", label: "Clinic", icon: Users },
  { to: "/validation", label: "Evidence", icon: FlaskConical },
  { to: "/about", label: "How it works", icon: Info },
];

export default function App() {
  const { ready, minute, timeOf } = useClock();
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-card px-3 py-4 md:flex">
        <div className="flex items-center gap-2 px-2">
          <img src="/logo.svg" className="h-8 w-8" alt="" />
          <div>
            <div className="text-[15px] font-semibold leading-tight">MadhuTwin</div>
            <div className="text-[11px] text-muted">Diabetes digital twin</div>
          </div>
        </div>
        <nav className="mt-6 space-y-0.5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to + location.search} end={to === "/"}
              className={({ isActive }) => `flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${isActive ? "bg-brandsoft font-semibold text-brand" : "text-ink2 hover:bg-page"}`}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-[11px] leading-snug text-muted">
          <div className="flex items-center gap-1.5"><Activity size={12} /> Clinical decision support · not a medical device</div>
          <div>Patients shown are fictional (synthetic). Model evidence uses real CGMacros data.</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <img src="/logo.svg" className="h-7 w-7" alt="" /><span className="font-semibold">MadhuTwin</span>
          </div>
          <div className="hidden text-xs text-muted sm:block">Virtual clinic clock · {ready ? fmtDay(timeOf(minute)) : "…"}</div>
          <div className="flex items-center gap-2">
            {ready && <ClockBar />}
            <ThemeToggle />
          </div>
        </header>
        <nav className="flex gap-1 border-b bg-card px-3 py-1 md:hidden">
          {nav.map(({ to, label }) => (
            <NavLink key={to} to={to + location.search} end={to === "/"} className={({ isActive }) => `rounded px-2 py-1 text-sm ${isActive ? "font-semibold text-brand" : "text-ink2"}`}>{label}</NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-4">
          {ready ? (
            <Routes>
              <Route path="/" element={<Cohort />} />
              <Route path="/patient/:pid" element={<PatientPage />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/about" element={<About />} />
            </Routes>
          ) : <div className="py-20 text-center text-muted">Loading twins…</div>}
        </main>
      </div>
    </div>
  );
}
