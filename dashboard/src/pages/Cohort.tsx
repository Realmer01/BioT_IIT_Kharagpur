import clsx from "clsx";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Census, PageHeader, STATUS_MARK, StatusPill } from "../components/ui";
import { useFetch, type Cohort as CohortT, type CohortRow, type Status } from "../lib/api";
import { useClock } from "../lib/clock";
import { fmtDay, fmtTime, glucoseState, trend } from "../lib/format";

const ORDER: Status[] = ["urgent", "warning", "watch", "stable"];

export default function Cohort() {
  const { minute, setMinute } = useClock();
  const { data, loading } = useFetch<CohortT>(`/api/cohort?minute=${minute}`);
  const [status, setStatus] = useState<Status | null>(null);
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const counts = useMemo(() => {
    const c: Record<string, number> = { urgent: 0, warning: 0, watch: 0, stable: 0 };
    (data?.patients ?? []).forEach((p) => (c[p.status] += 1));
    return c;
  }, [data]);
  const rows = useMemo(() => {
    let r = data?.patients ?? [];
    if (status) r = r.filter((p) => p.status === status);
    if (group !== "all") r = r.filter((p) => p.group === group);
    if (q) r = r.filter((p) => (p.name + p.city + p.patient_id).toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [data, status, group, q]);

  if (!data) return <div className="py-20 text-center text-muted">Loading clinic…</div>;
  const k = data.kpis;
  const open = (pid: string, m?: number) => { if (m != null) setMinute(m); nav(`/patient/${pid}${m != null ? `?m=${m}` : location.search}`); };

  return (
    <div className={clsx("space-y-5", loading && "refetching")}>
      <PageHeader title="Remote monitoring" meta={`${k.monitored} patients, each with a personalised twin · sorted by predicted risk over the next two hours`}
        right={
          <div className="flex items-center gap-2">
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="input input-sm w-auto" aria-label="Condition">
              <option value="all">All conditions</option><option value="t2d">Type 2 diabetes</option><option value="prediabetes">Prediabetes</option>
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city or ID" className="input input-sm w-52" aria-label="Search patients" />
          </div>
        } />

      <Census active={status} onSelect={(s) => setStatus((cur) => (cur === s ? null : (s as Status)))} items={[
        ...ORDER.map((s) => ({ key: s, label: STATUS_MARK[s].label, value: counts[s], marker: STATUS_MARK[s].mark })),
        { key: "tir", label: "Mean time in range, 7 days", value: k.mean_tir.toFixed(0), unit: "%" },
        { key: "alerts", label: "Alerts in the last 24 h", value: k.alerts_24h },
      ]} />

      <section className="panel">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-[15px]">Demo stories</h2>
          <span className="text-xs text-muted">Each opens just before a clinical event. Press Replay to watch the alert arrive.</span>
        </header>
        <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {data.stories.map((s) => (
            <button key={s.patient_id} onClick={() => open(s.patient_id, s.minute)} className="bg-card px-4 py-3 text-left transition-colors hover:bg-surface">
              <div className="font-mono text-xs text-muted">{fmtDay(s.time)} {fmtTime(s.time)}</div>
              <div className="mt-0.5 text-[14px] font-semibold text-ink">{s.name}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-ink2">{s.headline.replace(" -> ", ", ")}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-[15px]">Triage{status && <span className="font-normal text-muted"> · {STATUS_MARK[status].label.toLowerCase()} only</span>}</h2>
          <span className="text-xs text-muted">{rows.length} of {data.patients.length} patients{status && <> · <button className="link" onClick={() => setStatus(null)}>show all</button></>}</span>
        </header>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th className="pl-4">Status</th>
                <th>Patient</th>
                <th>Condition</th>
                <th className="num">Glucose</th>
                <th className="num">In 60 min*</th>
                <th>Above 180 within 2 h</th>
                <th>Below 70 within 1 h</th>
                <th className="num">TIR 7 d</th>
                <th className="num pr-4">TBR 7 d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <Row key={p.patient_id} p={p} onClick={() => open(p.patient_id)} />)}
              {rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted">No patients match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted">* Forecast if no new food is eaten. Alerts are counted as episodes: a new alert needs 60 minutes without one.</p>
      </section>
    </div>
  );
}

function Row({ p, onClick }: { p: CohortRow; onClick: () => void }) {
  const tr = trend(p.slope);
  const gs = glucoseState(p.glucose);
  const bar = (v: number, c: string) => (
    <div className="flex items-center gap-2.5">
      <div className="h-[3px] w-10 bg-[var(--grid)]"><div className="h-full" style={{ width: `${Math.max(2, v * 100)}%`, background: c }} /></div>
      <span className="w-9 text-xs font-medium text-ink">{Math.round(v * 100)}%</span>
    </div>
  );
  return (
    <tr onClick={onClick} className="cursor-pointer transition-colors hover:bg-surface" style={p.status === "urgent" ? { background: "var(--row-alarm)" } : undefined}>
      <td className="pl-4"><StatusPill status={p.status} /></td>
      <td>
        <div className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-ink">{p.name}
          {p.featured && <Badge>Demo story</Badge>}{p.uploaded && <Badge tone="brand">Uploaded</Badge>}</div>
        <div className="mt-0.5 whitespace-nowrap text-xs text-muted"><span className="font-mono">{p.patient_id}</span> · {p.age}{p.sex} · {p.city}</div>
      </td>
      <td>
        <div className="text-ink">{p.group_label}</div>
        <div className="mt-0.5 max-w-[200px] truncate text-xs text-muted" title={p.regimen.join(", ")}>HbA1c {p.hba1c}% · {p.regimen.length ? p.regimen.join(", ") : "no drugs"}</div>
      </td>
      <td className="num whitespace-nowrap">
        <span className="text-[15px] font-semibold text-ink">{Math.round(p.glucose)}</span> <span title={tr.label} className="text-ink2">{tr.arrow}</span>
        <div className="text-[11.5px]" style={{ color: gs.label === "In range" ? "var(--muted)" : gs.ink }}>{gs.label}</div>
      </td>
      <td className="num text-ink2">{Math.round(p.pred_60)}</td>
      <td>{bar(p.p_hyper, "var(--warning)")}</td>
      <td>{bar(p.p_hypo, "var(--critical)")}</td>
      <td className="num">{p.tir_7d?.toFixed(0)}%</td>
      <td className="num pr-4">{p.tbr_7d?.toFixed(1)}%</td>
    </tr>
  );
}
