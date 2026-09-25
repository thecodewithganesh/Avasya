"use client";

import Link from "next/link";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { DEMO_STAGES } from "@/lib/demo-mode";
import { AvasyaMark } from "@/components/brand/avasya-mark";
import { API_MODE } from "@/lib/api";

const WHY_IT_MATTERS: Record<string, string> = {
  command: "Shows the assessed situation returned by the decision engine.",
  hazard: "Shows where hazard risk sits, from habitation-level evidence.",
  habitation: "Shows the urgency assigned to the habitation and who is affected.",
  priority: "Shows the order in which habitations require attention first.",
  destination: "Shows the relocation destination associated with the recommendation.",
  recommendation: "Shows why this destination — and why not the alternatives.",
  decision: "Final action remains with the authorized human decision-maker.",
};

export default function DemoLaunchpad() {
  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="panel glow-top overflow-hidden">
        <div className="flex flex-col gap-6 border-b border-[var(--color-line)] p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="flex items-center gap-4">
            <AvasyaMark size={44} />
            <div>
              <div className="font-display text-xl font-bold tracking-[0.26em] text-[var(--color-fg)]">AVASYA</div>
              <div className="eyebrow mt-1 text-accent">PEOPLE FIRST. ALWAYS.</div>
              <div className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-[var(--color-fg-3)]">SIH DEMONSTRATION</div>
            </div>
          </div>
          <div className="max-w-md">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
              From hazard evidence to human decision
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg-2)]">
              A guided path through one habitation&apos;s journey — from hazard intelligence to the officer&apos;s
              recorded decision. Every value shown comes from the same demo dataset used across the product.
            </p>
          </div>
        </div>

        <div className="grid gap-px bg-[var(--color-line)] lg:grid-cols-[1.2fr_1fr]">
          <div className="bg-surface p-8 lg:p-10">
            <div className="eyebrow">THE DEMONSTRATION</div>
            <p className="mt-2.5 font-display text-lg font-semibold leading-7 text-[var(--color-fg)]">
              Follow one habitation from hazard intelligence to officer decision.
            </p>
            <ol className="mt-6 space-y-2.5">
              {DEMO_STAGES.map((stage) => (
                <li key={stage.id} className="flex items-baseline gap-3 text-[13px] text-[var(--color-fg-2)]">
                  <span className="metric shrink-0 text-[11px] font-semibold text-accent">{stage.step}</span>
                  <span>{stage.short}</span>
                </li>
              ))}
            </ol>
            <Link href="/dashboard" className="btn btn-primary mt-8 px-6 py-3 text-[13px]">
              START DEMO <Play size={14} aria-hidden="true" />
            </Link>
            <p className="mt-3 text-[11px] leading-4 text-[var(--color-fg-3)]">
              Opens the Command Dashboard. The presenter controls every step — nothing navigates automatically.
            </p>
          </div>

          <div className="bg-surface p-8 lg:p-10">
            <div className="eyebrow">DATA INTEGRITY</div>
            <p className="mt-2.5 text-[13px] leading-6 text-[var(--color-fg-2)]">
              AVASYA distinguishes between REAL data, SYNTHETIC DEMO data, UNAVAILABLE evidence, and UNKNOWN
              provenance — and never presents one as another.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Data provenance categories">
              {["REAL", "SYNTHETIC DEMO", "UNAVAILABLE", "UNKNOWN"].map((tag) => (
                <span key={tag} className="rounded-[3px] border border-[var(--color-line)] px-2 py-1 font-display text-[9px] font-semibold tracking-[0.14em] text-[var(--color-fg-2)]">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-[5px] border border-accent/25 bg-accent/[0.05] p-4">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <div className="font-display text-[13px] font-semibold tracking-[0.1em] text-accent">
                  AVASYA RECOMMENDS.
                </div>
                <div className="font-display text-[13px] font-semibold tracking-[0.1em] text-[var(--color-fg)]">
                  THE HUMAN DECIDES.
                </div>
                <div className="mt-2 text-[10px] leading-4 text-[var(--color-fg-3)]">
                  WHERE RISK BECOMES INTELLIGENCE · WHERE INTELLIGENCE BECOMES ACTION · WHERE ACTION REMAINS HUMAN
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-[var(--color-fg-3)]">
                  Data mode: {API_MODE === "LIVE" ? "Live API" : "Synthetic demo"} — the presentation layer never
                  changes the meaning of the underlying data.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-4" aria-label="Demonstration stages">
        <div className="eyebrow mb-3">THE WORKFLOW</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DEMO_STAGES.map((stage) => (
            <Link
              key={stage.id}
              href={stage.route}
              className="panel hover-lift group flex flex-col p-5"
            >
              <div className="flex items-baseline justify-between">
                <span className="metric text-2xl font-semibold text-accent">{stage.step}</span>
                <ArrowRight size={14} className="text-[var(--color-fg-3)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
              <h2 className="mt-3 font-display text-[15px] font-semibold text-[var(--color-fg)]">{stage.title}</h2>
              <p className="mt-1.5 flex-1 text-[12px] leading-5 text-[var(--color-fg-2)]">{WHY_IT_MATTERS[stage.id]}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 font-display text-[10px] font-semibold tracking-[0.14em] text-accent">
                OPEN <ArrowRight size={11} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
