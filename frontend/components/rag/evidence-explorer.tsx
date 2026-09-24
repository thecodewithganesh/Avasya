"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { EvidenceRecord } from "@/types/rag";
import { searchEvidence } from "@/lib/evidence-api";
import EvidenceCard from "@/components/ui/evidence-card";
import { RowSkeleton } from "@/components/ui/data-states";

const EXAMPLES = ["flood shelter capacity", "road accessibility", "historical floods", "waterlogging"];

/**
 * EVIDENCE / RAG EXPLORER — semantic retrieval over the evidence corpus, not
 * a web search. Live mode hits POST /evidence/search: the backend runs RAG
 * (pgvector) when the corpus is indexed and falls back to keyword ranking
 * while it is not; the response's retrievalMethod documents which engine ran.
 */
export default function EvidenceExplorer() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [results, setResults] = useState<EvidenceRecord[]>([]);
  const [error, setError] = useState<string>();
  const [searched, setSearched] = useState("");

  const run = async (term: string) => {
    setState("loading");
    setError(undefined);
    try {
      const result = await searchEvidence(term);
      setResults(result.results);
      setSearched(result.query);
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence retrieval failed.");
      setState("error");
    }
  };

  // Fire the default example on mount so the explorer never opens blank.
  useEffect(() => {
    const timer = setTimeout(() => run(EXAMPLES[0]), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      <section className="panel glow-top border-accent/25 p-5">
        <div className="eyebrow text-accent">EVIDENCE / RAG EXPLORER</div>
        <h1 className="mt-1.5 font-display text-xl font-semibold text-[var(--color-fg)]">Retrieve evidence from the corpus</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[var(--color-fg-2)]">
          Semantic retrieval over the AVASYA evidence store — E5 embeddings + pgvector, with
          transparent keyword fallback while the corpus is unindexed. Internal document retrieval
          for decision support: not a web search, and never a risk calculation.
        </p>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(query);
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-3)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search evidence — e.g. flood shelter capacity"
              aria-label="Search evidence"
              className="w-full border border-[var(--color-line)] bg-[var(--panel-wash)] py-2.5 pl-9 pr-3 text-[13px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-3)] focus:border-accent/60"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={!query.trim() || state === "loading"}>
            {state === "loading" ? "Retrieving…" : "Retrieve"}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-[0.1em] text-[var(--color-fg-3)]">TRY:</span>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => { setQuery(example); run(example); }} className="rounded-[3px] border border-[var(--color-line)] px-2 py-1 text-[10.5px] text-[var(--color-fg-3)] transition-colors hover:border-accent/50 hover:text-accent">
              {example}
            </button>
          ))}
        </div>
      </section>

      {state === "loading" && <div className="space-y-2">{[0, 1, 2].map((row) => <RowSkeleton key={row} rows={1} />)}</div>}

      {state === "error" && (
        <section className="panel border-immediate/30 bg-immediate/[0.05] p-5" role="alert">
          <div className="eyebrow text-immediate">EVIDENCE RETRIEVAL FAILED</div>
          <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg)]">{error}</p>
          <p className="mt-1.5 text-[11px] leading-5 text-[var(--color-fg-3)]">
            The retrieval request could not be completed — the backend may be unreachable, or the
            retrieval stack is temporarily unavailable. No results are ever simulated.
          </p>
        </section>
      )}

      {state === "done" && results.length === 0 && (
        <section className="panel p-5">
          <div className="eyebrow">NO EVIDENCE FOUND</div>
          <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg-2)]">
            No evidence in the corpus matched “{searched}”. Try broader terms such as the examples above.
          </p>
        </section>
      )}

      {state === "done" && results.length > 0 && (
        <section aria-live="polite">
          <div className="flex items-center justify-between">
            <div className="eyebrow">{results.length} EVIDENCE RECORD{results.length === 1 ? "" : "S"} · “{searched}”</div>
            <span className="rounded-[3px] border border-medium/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-medium">SYNTHETIC DEMO CORPUS</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {results.map((record, index) => (
              <div key={record.sourceId ?? index} className="space-y-1.5">
                <EvidenceCard evidence={record} rank={index + 1} />
                {record.habitationId && (
                  <Link href={`/habitations/${record.habitationId}`} className="ml-1 inline-block text-[10.5px] font-semibold text-accent hover:text-[var(--color-fg)]">
                    OPEN HABITATION H{record.habitationId.padStart(3, "0")} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
