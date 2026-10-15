import clsx from "clsx";
import { PlayCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Card, StatTile, StatusPill } from "../components/ui";
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
    <div className={clsx("space-y-4", loading && "refetching")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Remote monitoring clinic</h1>
          <p className="text-sm text-ink2">As of {fmtDateTime(data.time)} · each patient has a personalised digital twin synced to their CGM, smartwatch and health record</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Patients monitored" value={k.monitored} sub="Bharat synthetic cohort" />
        <StatTile label="Urgent now" value={k.urgent} sub="Predicted or current hypoglycaemia" accent={k.urgent ? "var(--critical)" : undefined} />
        <StatTile label="Warnings" value={k.warning} sub="Predicted >180 mg/dL within 2 h" />
        <StatTile label="Mean time in range" value={k.mean_tir.toFixed(0)} unit="%" sub="Last 7 days, target >70 %" />
        <StatTile label="Alerts, last 24 h" value={k.alerts_24h} sub="Across the clinic" />
      </div>

      <Card title="Demo stories" subtitle="Jump to the moment just before each clinical event; then press Replay to watch the twin anticipate it">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.stories.map((s) => (
            <button key={s.patient_id} onClick={() => open(s.patient_id, s.minute)}
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-left hover:border-brand hover:bg-brandsoft/40">
              <PlayCircle size={18} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <div className="text-sm font-semibold">{s.name} <span className="font-normal text-muted">· {fmtDateTime(s.time)}</span></div>
                <div className="text-xs text-ink2">{s.headline.replace(" -> ", " → ")}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card pad={false} title="Triage list" subtitle="Sorted by predicted risk. Probabilities come from out-of-fold models that never saw the patient."
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city"
                className="w-44 rounded-md border bg-card py-1 pl-7 pr-2 text-sm" />
            </div>
          </div>
        }>
        <div className="flex flex-wrap gap-1 px-4 pb-2 pt-3">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={clsx("rounded-full border px-2.5 py-0.5 text-xs", filter === f.id ? "border-brand bg-brandsoft font-semibold text-brand" : "text-ink2 hover:bg-page")}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="whitespace-nowrap border-y bg-page/60 text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Patient</th>
                <th className="px-2 py-2 font-medium">Condition</th>
                <th className="px-2 py-2 text-right font-medium">Glucose</th>
                <th className="px-2 py-2 text-right font-medium">60 min*</th>
                <th className="px-2 py-2 font-medium">Risk &gt;180 (2 h)</th>
                <th className="px-2 py-2 font-medium">Risk &lt;70 (1 h)</th>
                <th className="px-2 py-2 text-right font-medium">TIR 7d</th>
                <th className="px-2 py-2 text-right font-medium">TBR 7d</th>
                <th className="px-4 py-2 text-right font-medium">Alerts 24 h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <Row key={p.patient_id} p={p} onClick={() => open(p.patient_id)} />)}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-1 pt-2 text-[11px] text-muted">* forecast if no new food is eaten. Alerts are counted as episodes (a new alert needs 60 min without one).</p>
      </Card>
    </div>
  );
}

function Row({ p, onClick }: { p: CohortRow; onClick: () => void }) {
  const tr = trend(p.slope);
  const gs = glucoseState(p.glucose);
  const bar = (v: number, c: string) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-page"><div className="h-full rounded-full" style={{ width: `${Math.max(3, v * 100)}%`, background: c }} /></div>
      <span className="tnum w-9 text-xs font-medium">{Math.round(v * 100)}%</span>
    </div>
  );
  return (
    <tr onClick={onClick} className="cursor-pointer border-b last:border-0 hover:bg-page/70">
      <td className="px-4 py-2"><StatusPill status={p.status} /></td>
      <td className="px-2 py-2">
        <div className="font-medium">{p.name} {p.featured && <Badge tone="brand">story</Badge>}{p.uploaded && <Badge tone="brand">uploaded</Badge>}</div>
        <div className="text-xs text-muted">{p.age}{p.sex} · {p.city} · {p.patient_id}</div>
      </td>
      <td className="px-2 py-2">
        <div className="text-sm">{p.group_label}</div>
        <div className="text-xs text-muted">HbA1c {p.hba1c}% · {p.regimen.length ? p.regimen.join(", ") : "no drugs"}</div>
      </td>
      <td className="tnum px-2 py-2 text-right">
        <span className="font-semibold">{Math.round(p.glucose)}</span> <span title={tr.label} className="text-ink2">{tr.arrow}</span>
        <div className="text-[11px]" style={{ color: gs.label === "In range" ? "var(--muted)" : gs.color }}>{gs.label}</div>
      </td>
      <td className="tnum px-2 py-2 text-right text-ink2">{Math.round(p.pred_60)}</td>
      <td className="px-2 py-2">{bar(p.p_hyper, "var(--serious)")}</td>
      <td className="px-2 py-2">{bar(p.p_hypo, "var(--critical)")}</td>
      <td className="tnum px-2 py-2 text-right">{p.tir_7d?.toFixed(0)}%</td>
      <td className="tnum px-2 py-2 text-right">{p.tbr_7d?.toFixed(1)}%</td>
      <td className="tnum px-4 py-2 text-right">{p.alerts_24h}</td>
    </tr>
  );
}
