import { MessageSquareText, RefreshCw, Send } from "lucide-react";
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
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title={<span className="inline-flex items-center gap-1.5"><MessageSquareText size={15} />Clinical copilot</span>}
        subtitle="A grounded narrative of the twin's state for the treating doctor"
        right={resp && <Badge tone="brand">{resp.engine === "llm" ? `Language-model engine · ${resp.model}` : "Rule engine (offline)"}</Badge>}>
        <div className={busy ? "refetching" : ""}>
          {resp ? <div className="markdown text-sm leading-relaxed"><ReactMarkdown>{resp.text}</ReactMarkdown></div> : <div className="h-60" />}
          {resp?.note && <p className="mt-2 text-xs text-muted">{resp.note}</p>}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this patient's twin…" className="flex-1 rounded-md border bg-card px-3 py-1.5 text-sm" />
          <button className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm text-onbrand" disabled={busy}><Send size={14} />Ask</button>
          <button type="button" onClick={() => ask()} className="rounded-md border px-2 text-ink2 hover:bg-page" title="Regenerate"><RefreshCw size={14} /></button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((x) => <button key={x} onClick={() => { setQ(x); ask(x); }} className="rounded-full border px-2.5 py-0.5 text-xs text-ink2 hover:border-brand hover:text-brand">{x}</button>)}
        </div>
      </Card>
      <Card title="Guardrails">
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-ink2">
          <li>Uses only the twin's computed data (forecasts, risks, drivers, AGP, what-if results); no outside facts about the patient.</li>
          <li>Never gives dosing instructions; medication points are framed for clinician review.</li>
          <li>Quotes forecast intervals, and labels simulation output as model estimates.</li>
          <li>Works offline: without an API key a deterministic rule engine writes the summary, so the clinic never loses the feature.</li>
          <li>Optional hosted language-model engine (Anthropic API) with automatic fallback; enable it by setting <code>ANTHROPIC_API_KEY</code> on the server.</li>
        </ul>
        <p className="mt-3 text-[11px] text-muted">{resp?.llm_available ? "LLM engine configured." : "LLM engine not configured: using the rule engine."}</p>
      </Card>
    </div>
  );
}
