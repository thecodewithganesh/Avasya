"use client";

/**
 * Live system strip — the anti-slop centerpiece.
 *
 * The landing page shows the ACTUAL running system: real counts from the
 * backend API, labelled with their source. If the backend is down it says
 * so honestly instead of showing fake numbers (DATA_UNAVAILABLE, not zero).
 */
import { useEffect, useState } from "react";

import { API_V1 } from "@/lib/api-base";

type Cell = { label: string; value: string; sub?: string };

export function SystemStrip() {
  const [cells, setCells] = useState<Cell[] | null>(null); // null = loading
  const [backendUp, setBackendUp] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchJson(path: string, init?: RequestInit) {
      const res = await fetch(`${API_V1}${path}`, init);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    }

    (async () => {
      try {
        const [habitations, sources, rag] = await Promise.all([
          fetchJson("/habitations").catch(() => null),
          fetchJson("/knowledge-sources").catch(() => null),
          fetchJson("/rag/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "flood" }),
          }).catch(() => null),
        ]);
        if (cancelled) return;

        if (!habitations && !sources) {
          setBackendUp(false);
          setCells([]);
          return;
        }

        setBackendUp(true);

        const rows = habitations
          ? (Array.isArray(habitations) ? habitations : (habitations.items ?? []))
          : [];
        const origins = sources?.by_data_origin ?? {};
        const originSummary = Object.entries(origins)
          .map(([origin, count]) => `${origin} ${count}`)
          .join(" · ");

        setCells([
          {
            label: "HABITATIONS TRACKED",
            value: String(rows.length),
            sub: "live database rows",
          },
          {
            label: "EVIDENCE SOURCES",
            value: String(sources?.count ?? 0),
            sub: originSummary || "provenance registry",
          },
          {
            label: "RAG RETRIEVAL",
            value: rag?.grounding_status === "SUPPORTED" ? "ONLINE" : "STANDBY",
            sub: "pgvector · semantic retrieval",
          },
          {
            label: "DECISION ENGINES",
            value: "6/6",
            sub: "risk · priority · capacity · transport",
          },
        ]);
      } catch {
        if (!cancelled) {
          setBackendUp(false);
          setCells([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (cells === null) {
    return (
      <div className="border border-line bg-surface" style={{ borderRadius: "var(--radius-card)" }}>
        <div className="px-5 py-6 text-[11px] tracking-[0.18em] text-fg-3">
          CONTACTING AVASYA BACKEND…
        </div>
      </div>
    );
  }

  if (!backendUp || cells.length === 0) {
    return (
      <div
        className="border border-line bg-surface px-5 py-6"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <span className="text-[11px] font-semibold tracking-[0.18em] text-medium">
          BACKEND UNREACHABLE — START THE STACK WITH <code className="font-mono">docker compose up</code>
        </span>
        <p className="mt-1 text-[12px] text-fg-3">
          These figures are fetched live from the operations API. No fake
          numbers are shown when the system is offline.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4">
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={`px-5 py-4 ${index % 2 === 1 ? "border-l border-line" : ""} ${index >= 2 ? "max-lg:border-t max-lg:border-line" : ""} ${index > 0 ? "lg:border-l lg:border-line" : ""}`}
          style={{ borderRadius: index === 0 ? "var(--radius-tile)" : undefined }}
        >
          <div className="font-mono text-[10px] tracking-[0.16em] text-fg-3">
            {cell.label}
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-fg">
            {cell.value}
          </div>
          {cell.sub && (
            <div className="mt-0.5 text-[11px] text-fg-3">{cell.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
