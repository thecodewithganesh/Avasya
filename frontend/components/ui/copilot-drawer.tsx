"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CopilotMessage, EvidenceRecord } from "@/types/rag";
import type { Habitation } from "@/types/api";
import { explainWithAvasya, getHabitationEvidence, searchEvidence } from "@/lib/evidence-api";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

const SUGGESTED = [
  "Why is this habitation high risk?",
  "What evidence supports relocation?",
  "What hazards affect this habitation?",
  "What relocation destinations are available?",
  "Why was this destination recommended?",
  "Show the evidence supporting this decision.",
];

const errorText: Record<NonNullable<CopilotMessage["error"]>, string> = {
  "llm-unavailable": "LLM unavailable — the explanation service is not connected in this environment.",
  "retrieval-failed": "Evidence retrieval failed — no answer was generated.",
  "connection-unavailable": "Connection unavailable — AVASYA CoPilot cannot reach the backend.",
};

/**
 * AVASYA COPILOT — evidence-grounded officer assistant drawer.
 * Answers are composed strictly from persisted contract values for the
 * currently selected habitation (context never drifts to another case) and
 * every AVASYA reply carries the SYNTHETIC DEMO marker in mock mode. When a
 * question cannot be answered from available data, the drawer says so instead
 * of improvising.
 */
export default function CopilotDrawer({ habitation, onClose }: { habitation: Habitation; onClose: () => void }) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getHabitationEvidence(habitation.id)
      .then((bundle) => active && setEvidence(bundle.evidence))
      .catch(() => undefined);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      active = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [habitation.id, onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const officer: CopilotMessage = { id: `m${messages.length}-q`, role: "officer", text: trimmed, citations: [] };
    const pendingId = `m${messages.length}-a`;
    setMessages((current) => [...current, officer, { id: pendingId, role: "avasya", text: "", citations: [], pending: true }]);
    setInput("");

    const answer = (text: string, citations: EvidenceRecord[] = []): CopilotMessage => ({
      id: pendingId,
      role: "avasya" as const,
      text,
      citations,
    });

    try {
      const lower = trimmed.toLowerCase();
      if (/high risk|why.*risk/.test(lower)) {
        const assessment = await import("@/lib/api").then((mod) => mod.getHabitationRisk(habitation.id));
        const explanation = await explainWithAvasya({
          habitationId: habitation.id,
          assessment,
          habitation,
        });
        setMessages((current) => [...current.filter((m) => m.id !== pendingId), answer(explanation.explanation, explanation.evidenceUsed)]);
        return;
      }
      if (/evidence|support|decision|recommend/.test(lower)) {
        const bundle = await getHabitationEvidence(habitation.id);
        if (bundle.evidence.length === 0) {
          setMessages((current) => [...current.filter((m) => m.id !== pendingId), answer("No evidence found for this habitation in the current store.")]);
          return;
        }
        setMessages((current) => [
          ...current.filter((m) => m.id !== pendingId),
          answer(
            `${bundle.evidence.length} evidence record${bundle.evidence.length === 1 ? "" : "s"} are associated with this habitation. Sources and snippets are shown below.`,
            bundle.evidence.slice(0, 3),
          ),
        ]);
        return;
      }
      if (/hazard/.test(lower)) {
        setMessages((current) => [
          ...current.filter((m) => m.id !== pendingId),
          answer(
            habitation.hazard
              ? `The persisted record associates this habitation with ${habitation.hazard.toLowerCase()}. Missing hazard geometry is not treated as absence of hazard.`
              : "No hazard classification has been supplied for this habitation. Absence of a hazard field is not interpreted as no hazard.",
          ),
        ]);
        return;
      }
      if (/destination|capacity/.test(lower)) {
        const recommendation = await import("@/lib/api")
          .then((mod) => mod.getRecommendationFor(habitation.id))
          .catch(() => undefined);
        setMessages((current) => [
          ...current.filter((m) => m.id !== pendingId),
          answer(
            recommendation?.destinationId
              ? `The recommendation targets destination ${recommendation.destinationId} with a ${recommendation.capacityStatus.toLowerCase()} capacity gate. The officer makes the final call.`
              : "No relocation recommendation has been issued for this habitation, so no destination is associated yet.",
            evidence.filter((record) => record.hazardType === "Relocation").slice(0, 1),
          ),
        ]);
        return;
      }
      const fallback = await searchEvidence(trimmed).catch(() => undefined);
      if (fallback && fallback.results.length > 0) {
        setMessages((current) => [
          ...current.filter((m) => m.id !== pendingId),
          answer(`${fallback.results.length} evidence record(s) matched those terms in the synthetic demo store.`, fallback.results.slice(0, 2)),
        ]);
        return;
      }
      setMessages((current) => [
        ...current.filter((m) => m.id !== pendingId),
        answer("I can only answer from evidence associated with this habitation and its persisted assessment. Try one of the suggested questions."),
      ]);
    } catch {
      setMessages((current) => [
        ...current.filter((m) => m.id !== pendingId),
        { id: pendingId, role: "avasya" as const, text: "", citations: [], error: "retrieval-failed" as const },
      ]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--overlay-scrim)]" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--color-line)] bg-[var(--color-bg)] shadow-2xl"
        role="complementary"
        aria-label="AVASYA CoPilot"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] p-4">
          <div>
            <div className="eyebrow text-accent">AVASYA COPILOT</div>
            <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">Evidence-grounded officer assistant</h2>
            <p className="mono mt-1 text-[10px] text-[var(--color-fg-3)]">
              CONTEXT: {habitation.id} · {habitation.name.toUpperCase()}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close AVASYA CoPilot" className="btn-ghost rounded-[5px] p-1.5">
            <X size={16} />
          </button>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div>
              <p className="text-[12px] leading-5 text-[var(--color-fg-2)]">
                Ask about this habitation&apos;s risk, evidence, or recommendation. Answers come only from the persisted assessment and evidence store — never invented.
              </p>
              <div className="mt-3 space-y-1.5">
                {SUGGESTED.map((question) => (
                  <button key={question} type="button" onClick={() => ask(question)} className="w-full border border-[var(--color-line)] bg-[var(--panel-wash)] p-2.5 text-left text-[12px] text-[var(--color-fg-2)] transition-colors hover:border-accent/50 hover:text-[var(--color-fg)]">
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) =>
            message.role === "officer" ? (
              <div key={message.id} className="ml-8 border border-accent/30 bg-accent/[0.06] p-2.5 text-[12px] leading-5 text-[var(--color-fg)]">{message.text}</div>
            ) : (
              <div key={message.id}>
                {message.pending ? (
                  <p className="text-[12px] text-accent" role="status">Retrieving evidence…</p>
                ) : message.error ? (
                  <p className="border border-immediate/30 bg-immediate/[0.06] p-2.5 text-[12px] leading-5 text-immediate" role="alert">{errorText[message.error]}</p>
                ) : (
                  <div className="mr-4 border border-[var(--color-line)] bg-[var(--panel-wash)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="eyebrow text-[9px]">AVASYA</span>
                      <DataProvenanceBadge provenance="SYNTHETIC_DEMO" />
                    </div>
                    <p className="mt-1.5 text-[12px] leading-5 text-[var(--color-fg)]">{message.text}</p>
                    {message.citations.length > 0 && (
                      <div className="mt-2.5 space-y-2 border-t border-[var(--color-line)] pt-2.5">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-3)]">Sources</div>
                        {message.citations.map((record, index) => (
                          <div key={record.sourceId ?? index} className="text-[11px] leading-4 text-[var(--color-fg-2)]">
                            <span className="mono mr-1.5 text-accent">[{index + 1}]</span>
                            {record.title}
                            {record.sourceId && <span className="mono ml-1.5 text-[9.5px] text-[var(--color-fg-3)]">{record.sourceId}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        <form
          className="flex gap-2 border-t border-[var(--color-line)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`Ask about ${habitation.id}…`}
            aria-label="Ask AVASYA CoPilot"
            className="min-w-0 flex-1 border border-[var(--color-line)] bg-[var(--panel-wash)] px-3 py-2 text-[12px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-3)] focus:border-accent/60"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim()}>
            Ask
          </button>
        </form>
      </aside>
    </div>
  );
}
