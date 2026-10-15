import clsx from "clsx";
import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Card, PageHeader, Stats, StatusPill } from "../components/ui";
import { useFetch, type Cohort as CohortT, type CohortRow } from "../lib/api";
import { useClock } from "../lib/clock";
import { fmtDateTime, glucoseState, trend } from "../lib/format";

const FILTERS = [
  { id: "all", label: "All" }, { id: "alerts", label: "Needs attention" }, { id: "t2d", label: "Type 2 diabetes" },
  { id: "prediabetes", label: "Prediabetes" }, { id: "featured", label: "Demo stories" },
] as const;

export default function Cohort() {
  const { minute, setMinute } = useClock();
  const { data, loading } = useFetch<CohortT>(`/api/cohort?minute=${minute}`);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const rows = useMemo(() => {
    let r = data?.patients ?? [];
    if (filter === "alerts") r = r.filter((p) => p.status === "urgent" || p.status === "warning");
    if (filter === "t2d" || filter === "prediabetes") r = r.filter((p) => p.group === filter);
    if (filter === "featured") r = r.filter((p) => p.featured);
    if (q) r = r.filter((p) => (p.name + p.city + p.patient_id).toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [data, filter, q]);

  if (!data) return <div className="py-20 text-center text-muted">Loading cohort…</div>;
  const k = data.kpis;
  const open = (pid: string, m?: number) => { if (m != null) setMinute(m); nav(`/patient/${pid}${m != null ? `?m=${m}` : location.search}`); };

  return (
    <div className={clsx("space-y-6", loading && "refetching")}>
      <PageHeader eyebrow={`Remote monitoring · ${fmtDateTime(data.time)}`} title="Who needs attention now">
        Every patient has a personalised digital twin kept in sync with their CGM, smartwatch and health record. The list is sorted by
        predicted risk, and every probability comes from a model that never saw that patient.
      </PageHeader>

      <Stats className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" items={[
        { label: "Patients monitored", value: k.monitored, sub: "Bharat synthetic cohort" },
        { label: "Urgent now", value: k.urgent, sub: "Current or predicted hypoglycaemia", accent: k.urgent ? "var(--critical)" : undefined },
        { label: "Warnings", value: k.warning, sub: "Predicted above 180 mg/dL within 2 h" },
        { label: "Mean time in range", value: k.mean_tir.toFixed(0), unit: "%", sub: "Last 7 days · target above 70 %" },
        { label: "Alerts, last 24 h", value: k.alerts_24h, sub: "Across the clinic" },
      ]} />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Demo stories</h2>
          <p className="text-xs text-muted">Opens the moment before each clinical event; press Replay to watch the twin anticipate it</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.stories.map((s) => (
            <button key={s.patient_id} onClick={() => open(s.patient_id, s.minute)}
              className="card group flex flex-col items-start gap-1 px-4 py-3.5 text-left transition-[border-color,box-shadow] hover:border-strong hover:shadow-pop">
              <div className="flex w-full items-center justify-between gap-2">
                <span className="eyebrow">{fmtDateTime(s.time)}</span>
                <ArrowUpRight size={15} className="text-faint transition-colors group-hover:text-ink" />
              </div>
              <div className="text-[14px] font-semibold text-ink">{s.name}</div>
              <div className="text-[13px] leading-snug text-ink2">{s.headline.replace(" -> ", " → ")}</div>
            </button>
          ))}
        </div>
      </section>

      <Card pad={false} title="Triage list" subtitle="Sorted by predicted risk at the clinic clock"
        right={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city or ID" className="input input-sm w-56 pl-8" />
          </div>
        }>
        <div className="flex flex-wrap gap-1.5 px-5 pb-3">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className="chip">{f.label}</button>
          ))}
        </div>
        <div className="overflow-x-auto border-t">
          <table className="data-table min-w-[1000px]">
            <thead>
              <tr>
                <th className="pl-5">Status</th>
                <th>Patient</th>
                <th>Condition</th>
                <th className="num">Glucose</th>
                <th className="num">In 60 min*</th>
                <th>Risk above 180, 2 h</th>
                <th>Risk below 70, 1 h</th>
                <th className="num">TIR 7 d</th>
                <th className="num">TBR 7 d</th>
                <th className="num pr-5">Alerts 24 h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <Row key={p.patient_id} p={p} onClick={() => open(p.patient_id)} />)}
            </tbody>
          </table>
        </div>
        <p className="border-t px-5 pt-2.5 text-[11px] text-muted">* Forecast if no new food is eaten. Alerts are counted as episodes: a new alert needs 60 minutes without one.</p>
      </Card>
    </div>
  );
}

function Row({ p, onClick }: { p: CohortRow; onClick: () => void }) {
  const tr = trend(p.slope);
  const gs = glucoseState(p.glucose);
  const bar = (v: number, c: string) => (
    <div className="flex items-center gap-2.5">
      <div className="h-1 w-20 overflow-hidden rounded-full bg-[var(--grid)]"><div className="h-full rounded-full" style={{ width: `${Math.max(3, v * 100)}%`, background: c }} /></div>
      <span className="tnum w-9 text-xs font-medium text-ink">{Math.round(v * 100)}%</span>
    </div>
  );
  return (
    <tr onClick={onClick} className="cursor-pointer transition-colors hover:bg-surface">
      <td className="pl-5" style={p.status === "urgent" ? { boxShadow: "inset 3px 0 0 var(--critical)" } : undefined}><StatusPill status={p.status} /></td>
      <td>
        <div className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-ink">{p.name}
          {p.featured && <Badge tone="accent">Story</Badge>}{p.uploaded && <Badge tone="brand">Uploaded</Badge>}</div>
        <div className="mt-0.5 whitespace-nowrap text-xs text-muted">{p.age}{p.sex} · {p.city} · {p.patient_id}</div>
      </td>
      <td>
        <div className="text-ink">{p.group_label}</div>
        <div className="mt-0.5 max-w-[260px] truncate text-xs text-muted" title={p.regimen.join(", ")}>HbA1c {p.hba1c}% · {p.regimen.length ? p.regimen.join(", ") : "no drugs"}</div>
      </td>
      <td className="num">
        <span className="text-[15px] font-semibold text-ink">{Math.round(p.glucose)}</span> <span title={tr.label} className="text-ink2">{tr.arrow}</span>
        <div className="text-[11px] font-medium" style={{ color: gs.label === "In range" ? "var(--muted)" : gs.ink }}>{gs.label}</div>
      </td>
      <td className="num text-ink2">{Math.round(p.pred_60)}</td>
      <td>{bar(p.p_hyper, "var(--warning)")}</td>
      <td>{bar(p.p_hypo, "var(--critical)")}</td>
      <td className="num">{p.tir_7d?.toFixed(0)}%</td>
      <td className="num">{p.tbr_7d?.toFixed(1)}%</td>
      <td className="num pr-5">{p.alerts_24h}</td>
    </tr>
  );
}
