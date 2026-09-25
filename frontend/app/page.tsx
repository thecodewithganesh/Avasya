import Link from "next/link";

import { AvasyaMark } from "@/components/brand/avasya-mark";
import { SystemStrip } from "@/components/landing/system-strip";

/**
 * AVASYA landing - government-grade, asymmetric, zero glass.
 *
 * Design contract: docs/DESIGN_DIRECTION.md.
 *  - Giant display type left, live operational telemetry right.
 *  - Capabilities as a numbered specification table, not icon cards.
 *  - The hero visual is the actual system state (live API strip), not art.
 *  - Radius varies by purpose (tile 4 / card 6 / pop 10). No pills.
 */
const CAPABILITIES = [
  {
    index: "01",
    name: "Hazard status engine",
    detail:
      "RED / YELLOW / NO_ALERT / DATA_UNAVAILABLE per habitation, computed from evidence - never from the LLM. Missing data is shown as missing, not as safe.",
  },
  {
    index: "02",
    name: "Risk & relocation priority",
    detail:
      "Deterministic 0-100 risk from hazard severity x exposure, ranked into IMMEDIATE / SHORT_TERM / MEDIUM_TERM / MONITOR with a computed response window.",
  },
  {
    index: "03",
    name: "Capacity-gated destinations",
    detail:
      "Usable capacity = nominal - occupancy - constraints - reserve. Insufficient shelters are rejected before routing ever begins - nearest is never the answer.",
  },
  {
    index: "04",
    name: "Hazard-aware transport",
    detail:
      "Routing consumes capacity-eligible destinations only; blocked and high-risk road segments are excluded before route search.",
  },
  {
    index: "05",
    name: "RAG evidence retrieval",
    detail:
      "Official disaster-management documents indexed into pgvector (E5 embeddings, HNSW). Every answer cites its source; no match means UNSUPPORTED, never invention.",
  },
  {
    index: "06",
    name: "Grounded LLM explanation",
    detail:
      "Local Qwen3 / llama3.2 inference with schema-constrained output. Every numeric claim is validated against AVASYA structured data - CONFLICT claims are stripped, not trusted.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 pb-16 pt-8 lg:px-12">
      <div className="mx-auto flex max-w-[1400px] flex-col">
        {/* Header row - mark, tagline, direct console entry */}
        <header className="flex items-center justify-between border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <AvasyaMark size={34} />
            <div className="leading-none">
              <div className="font-display text-sm font-bold tracking-[0.28em] text-fg">
                AVASYA
              </div>
              <div className="mt-1 text-[8px] font-semibold tracking-[0.22em] text-fg-3">
                PEOPLE FIRST. ALWAYS.
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-[12px] font-medium text-fg-2">
            <Link href="/hazard-map" className="hover:text-fg">
              Hazard map
            </Link>
            <Link href="/evidence" className="hover:text-fg">
              Evidence
            </Link>
            <Link href="/login" className="hover:text-fg">
              Officer login
            </Link>
            <Link
              href="/dashboard"
              className="border border-line bg-raised px-4 py-2 text-fg transition-colors hover:border-fg-3"
              style={{ borderRadius: "var(--radius-tile)" }}
            >
              Open console &rarr;
            </Link>
          </nav>
        </header>

        {/* Asymmetric hero - type left, live telemetry right */}
        <section className="grid grid-cols-1 items-end gap-10 pt-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="font-mono text-[11px] tracking-[0.2em] text-info">
              DISASTER MANAGEMENT DECISION SUPPORT - SIH26191
            </div>
            <h1 className="hero-title mt-4 text-5xl text-fg sm:text-7xl lg:text-[84px]">
              AVASYA
              <br />
              INTELLIGENT
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-2">
              Hazard intelligence and relocation decision support for India&apos;s
              coastal districts. The system recommends; the officer decides -
              and every number it shows can be traced to its source.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/hazard-map"
                className="bg-accent px-6 py-3 font-display text-sm font-bold tracking-wide text-[var(--btn-primary-ink)] transition-opacity hover:opacity-90"
                style={{ borderRadius: "var(--radius-tile)" }}
              >
                LAUNCH OPERATIONS
              </Link>
              <Link
                href="/evidence"
                className="border border-line px-6 py-3 font-display text-sm font-bold tracking-wide text-fg transition-colors hover:border-fg-3"
                style={{ borderRadius: "var(--radius-card)" }}
              >
                Search the evidence base
              </Link>
            </div>
          </div>

          {/* The product is the hero: live backend telemetry, right column */}
          <div className="lg:col-span-5">
            <div className="font-mono text-[10px] tracking-[0.18em] text-fg-3">
              LIVE SYSTEM STATUS - FETCHED FROM THE RUNNING BACKEND
            </div>
            <div className="mt-3 border border-line bg-surface" style={{ borderRadius: "var(--radius-card)" }}>
              <SystemStrip />
            </div>
          </div>
        </section>

        {/* Capabilities as a specification table - no icon cards */}
        <section className="mt-20">
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="font-display text-sm font-bold tracking-[0.2em] text-fg">
              SYSTEM CAPABILITIES
            </h2>
            <span className="font-mono text-[10px] tracking-[0.16em] text-fg-3">
              6 DETERMINISTIC + AI-GROUNDED MODULES
            </span>
          </div>
          <table className="w-full border-collapse text-left">
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap.index} className="border-b border-line align-top">
                  <td className="w-16 py-5 pr-4 font-mono text-[12px] text-fg-3">
                    {cap.index}
                  </td>
                  <td className="w-72 py-5 pr-6 font-display text-[15px] font-semibold text-fg">
                    {cap.name}
                  </td>
                  <td className="py-5 text-[13px] leading-relaxed text-fg-2">
                    {cap.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Footer - provenance-first voice */}
        <footer className="mt-16 flex flex-col gap-2 border-t border-line pt-6 text-[11px] text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            AVASYA - Hazard Intelligence &amp; Relocation Decision Support
          </span>
          <span className="font-mono tracking-[0.14em]">
            DATA_UNAVAILABLE &ne; NO_ALERT - NEVER FABRICATED, ALWAYS LABELLED
          </span>
        </footer>
      </div>
    </main>
  );
}
