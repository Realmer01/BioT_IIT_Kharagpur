import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { postJSON, type Patient } from "../../lib/api";
import { useClock } from "../../lib/clock";
import { Badge, Card } from "../ui";

interface CopilotResp { engine: "rule" | "llm"; text: string; model?: string; note?: string; llm_available: boolean }
const QUICK = ["Why is this alert firing?", "What is the hypoglycaemia risk today?", "Would a walk after lunch help?", "How did sleep affect glucose?"];

export default function CopilotTab({ p }: { p: Patient }) {
  const { minute } = useClock();
  const [resp, setResp] = useState<CopilotResp | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = (question?: string) => {
    setBusy(true);
    postJSON<CopilotResp>(`/api/patients/${p.patient_id}/copilot`, { minute, question: question || null })
      .then(setResp).finally(() => setBusy(false));
  };
  useEffect(() => { ask(); }, [p.patient_id, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const foot = resp?.text.match(/<sub>([\s\S]*?)<\/sub>/)?.[1];
  const body = resp?.text.replace(/<sub>[\s\S]*?<\/sub>/g, "").trim();
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="Copilot" subtitle="Summary of the twin's current state for the treating doctor"
        right={resp && <Badge tone={resp.engine === "llm" ? "brand" : "neutral"}>{resp.engine === "llm" ? `Language model · ${resp.model}` : "Rule engine · offline"}</Badge>}>
        <div className={busy ? "refetching" : ""}>
          {resp ? <div className="markdown max-w-[76ch] text-[14px] leading-relaxed text-ink2"><ReactMarkdown>{body ?? ""}</ReactMarkdown></div> : <div className="h-60" />}
          {foot && <p className="mt-3 text-[11px] text-muted">{foot}</p>}
          {resp?.note && <p className="mt-3 text-xs text-muted">{resp.note}</p>}
        </div>
        <form className="mt-5 flex gap-2 border-t pt-4" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this patient's twin…" className="input flex-1" />
          <button className="btn-primary h-9 px-4" disabled={busy}>Ask</button>
          <button type="button" onClick={() => ask()} className="btn-secondary h-9">Regenerate</button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {QUICK.map((x) => <button key={x} onClick={() => { setQ(x); ask(x); }} className="chip">{x}</button>)}
        </div>
      </Card>
      <Card title="Guardrails">
        <ul className="bullets space-y-2 text-[13px] leading-relaxed text-ink2">
          {[
            "Uses only the twin's computed data (forecasts, risks, drivers, AGP, what-if results); no outside facts about the patient.",
            "Never gives dosing instructions; medication points are framed for clinician review.",
            "Quotes forecast intervals and labels simulation output as model estimates.",
            "Works offline: without an API key a deterministic rule engine writes the summary, so the clinic never loses the feature.",
          ].map((t) => <li key={t}>{t}</li>)}
          <li>An optional hosted language-model engine (Anthropic API) falls back automatically; enable it with <code>ANTHROPIC_API_KEY</code> on the server.</li>
        </ul>
        <p className="mt-4 border-t pt-3 text-xs text-muted">{resp?.llm_available ? "Language-model engine configured." : "Language-model engine not configured: using the rule engine."}</p>
      </Card>
    </div>
  );
}
