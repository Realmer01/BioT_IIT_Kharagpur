import clsx from "clsx";
import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import ClockBar from "./components/ClockBar";
import { useClock } from "./lib/clock";
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
    <button onClick={() => setTheme(dark ? "light" : "dark")} className="text-left text-xs text-muted hover:text-ink">
      {dark ? "Light theme" : "Dark theme"}
    </button>
  );
}

const NAV = [
  { group: "Clinic", items: [{ to: "/", label: "Remote monitoring", short: "Clinic" }, { to: "/onboard", label: "New patient", short: "New patient" }] },
  { group: "Model", items: [{ to: "/validation", label: "Validation", short: "Validation" }, { to: "/about", label: "Method", short: "Method" }] },
];
const FLAT = NAV.flatMap((g) => g.items);

export default function App() {
  const { ready } = useClock();
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar px-3 pb-4 pt-4 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <img src="/logo.svg" className="h-7 w-7" alt="" />
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">MadhuTwin</div>
        </div>
        <nav className="mt-6 space-y-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-2 pb-1 text-xs font-medium text-muted">{g.group}</div>
              {g.items.map(({ to, label }) => (
                <NavLink key={to} to={to + location.search} end={to === "/"}
                  className={({ isActive }) => clsx("block rounded px-2 py-1.5 text-[14px] transition-colors",
                    isActive ? "bg-[var(--border)] font-semibold text-ink" : "text-ink2 hover:bg-hoverbg hover:text-ink")}>
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2 text-[11.5px] leading-relaxed text-muted">
          <p>Clinical decision support, not a medical device. Cohort patients are synthetic; uploaded patients are marked.</p>
          <ThemeToggle />
          <p className="text-faint">Team BioT · IIT Kharagpur</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-card">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <img src="/logo.svg" className="h-6 w-6" alt="" /><span className="font-semibold">MadhuTwin</span>
            </div>
            {ready && <ClockBar />}
            <div className="md:hidden"><ThemeToggle /></div>
          </div>
          <nav className="flex gap-4 overflow-x-auto whitespace-nowrap border-t px-4 md:hidden">
            {FLAT.map(({ to, short }) => (
              <NavLink key={to} to={to + location.search} end={to === "/"}
                className={({ isActive }) => clsx("-mb-px border-b-2 py-2 text-[13px]", isActive ? "border-brand font-semibold text-ink" : "border-transparent text-muted")}>{short}</NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-7 md:py-6">
          {ready ? (
            <Routes>
              <Route path="/" element={<Cohort />} />
              <Route path="/patient/:pid" element={<PatientPage />} />
              <Route path="/onboard" element={<Onboard />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/about" element={<About />} />
            </Routes>
          ) : <div className="py-20 text-center text-muted">Loading…</div>}
        </main>
      </div>
    </div>
  );
}
