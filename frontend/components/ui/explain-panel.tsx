"use client";

import { useState } from "react";
import type { AiExplanation } from "@/types/rag";
import { explainWithAvasya } from "@/lib/evidence-api";
import type { Habitation, Recommendation, RiskAssessment } from "@/types/api";
import EvidenceCard from "@/components/ui/evidence-card";

/**
 * EXPLAIN WITH AVASYA — risk result + retrieved evidence + explanation.
 * In mock mode the "explanation" is a clearly labeled SYNTHETIC DEMO
 * restatement of persisted values; in live mode the loader throws until M's
 * Qwen3 endpoint exists, and the panel shows an honest LLM-unavailable state.
 * The rule engine computes the risk — the LLM only explains it.
 */
export default function ExplainPanel({
  habitation,
  assessment,
  recommendation,
}: {
  habitation: Habitation;
  assessment: RiskAssessment;
  recommendation?: Recommendation;
}) {
  const [state, setState] = useState<"idle" | "retrieving" | "generating" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>();
  const [explanation, setExplanation] = useState<AiExplanation>();

  const run = async () => {
    setState("retrieving");
    setMessage(undefined);
    try {
      // Retrieval stage is implicit in the current contract; surface it so the
      // officer sees the pipeline order (evidence → explanation).
      await new Promise((resolve) => setTimeout(resolve, 350));
      setState("generating");
      const result = await explainWithAvasya({ habitationId: habitation.id, assessment, habitation, recommendation });
      setExplanation(result);
      setState("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Explanation unavailable.");
      setState("error");
    }
  };

  return (
    <section className="panel p-5" aria-label="Explain with AVASYA">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-accent">AI EXPLANATION</div>
          <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">Why is this habitation {assessment.level} risk?</h2>
        </div>
        {state === "idle" && (
          <button type="button" onClick={run} className="btn btn-primary btn-sm">
            EXPLAIN WITH AVASYA
          </button>
        )}
      </div>

      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] tracking-[0.1em] text-[var(--color-fg-3)]">
        <li className={state === "retrieving" ? "text-accent" : state === "idle" ? "" : "text-safe"}>1 · RISK RESULT</li>
        <li className={state === "retrieving" ? "text-accent" : state === "idle" ? "" : "text-safe"}>2 · RETRIEVED EVIDENCE</li>
        <li className={state === "generating" ? "text-accent" : state === "idle" ? "" : state === "done" ? "text-safe" : ""}>3 · EXPLANATION</li>
      </ol>

      {state === "retrieving" && <p className="mt-3 text-[12px] text-accent" role="status">Retrieving evidence…</p>}
      {state === "generating" && <p className="mt-3 text-[12px] text-accent" role="status">Generating explanation…</p>}
      {state === "error" && (
        <p className="mt-3 border border-immediate/30 bg-immediate/[0.06] p-3 text-[12px] leading-5 text-immediate" role="alert">
          LLM unavailable. {message}
        </p>
      )}

      {state === "done" && explanation && (
        <div className="mt-4 fade-up">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow">AVASYA:</div>
            <span className="rounded-[3px] border border-medium/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-medium">SYNTHETIC DEMO OUTPUT</span>
          </div>
          <p className="mt-2 border-l-2 border-accent/60 pl-3 text-[13px] leading-6 text-[var(--color-fg)]">{explanation.explanation}</p>
          <p className="mt-2 text-[10px] leading-4 text-[var(--color-fg-3)]">
            The rule engine computed the risk. This text restates its persisted output — it did not calculate the score.
          </p>

          {explanation.evidenceUsed.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow">EVIDENCE USED</div>
              <div className="mt-2 space-y-2">
                {explanation.evidenceUsed.map((record, index) => (
                  <EvidenceCard key={record.sourceId ?? index} evidence={record} rank={index + 1} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {state === "idle" && (
        <p className="mt-3 text-[11px] leading-5 text-[var(--color-fg-3)]">
          Runs retrieval over the evidence store, then requests an explanation grounded in the persisted rule-engine result.
        </p>
      )}
    </section>
  );
}
