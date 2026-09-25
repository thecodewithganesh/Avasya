"use client";

import { AvasyaMark } from "@/components/brand/avasya-mark";
import Stat from "@/components/ui/stat";
import PageHead from "@/components/layout/page-head";
import { API_MODE } from "@/lib/api";
import { setDemoMode, useDemoMode } from "@/lib/demo-mode";
import Link from "next/link";

/** SIH Demo Mode toggle — presentation layer only; never changes data. */
function DemoModePanel() {
  const enabled = useDemoMode();
  return (
    <section className="panel p-5" aria-label="SIH demo mode">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">PRESENTATION</div>
          <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">SIH Demo Mode</h2>
          <p className="mt-1.5 text-[12px] leading-5 text-[var(--color-fg-2)]">
            Adds a demo banner, stage progress, and presenter shortcuts over the existing product. It never changes
            data, logic, or decisions.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="SIH demo mode"
          onClick={() => setDemoMode(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${enabled ? "border-insight/50 bg-insight/25" : "border-[var(--color-line)] bg-[var(--field-wash)]"}`}
        >
          <span
            className="absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full transition-all"
            style={{ left: enabled ? "calc(100% - 20px)" : "3px", width: 18, height: 18, background: enabled ? "var(--color-insight)" : "var(--color-fg-3)" }}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--color-line)] pt-3">
        <span className={`font-display text-[10px] font-semibold tracking-[0.14em] ${enabled ? "text-insight" : "text-[var(--color-fg-3)]"}`}>
          {enabled ? "SIH DEMO ACTIVE" : "OFF"}
        </span>
        <Link href="/demo" className="text-[10px] font-semibold tracking-[0.1em] text-accent transition-colors hover:text-[var(--color-fg)]">
          OPEN DEMO FLOW →
        </Link>
      </div>
    </section>
  );
}

const services = [
  ["DATA SERVICE", API_MODE === "LIVE" ? "LIVE API · MIXED DATA" : "DEMO DATASET", API_MODE === "LIVE" ? "Backend contract connected; served records mix REAL and SYNTHETIC_DEMO provenance — see badges per record." : "Frontend demo dataset — no live backend connection.", API_MODE === "LIVE" ? "text-safe" : "text-insight"],
  ["GIS TILES", "OPEN BASEMAP", "Free OpenStreetMap-compatible tiles, no API key.", "text-safe"],
  ["DECISION ENGINE", "BACKEND-COMPUTED", "Risk and capacity values are computed by the backend engine, not the UI.", "text-safe"],
] as const;

export default function SettingsPage() {
  return (
    <div className="fade-up">
      <PageHead eyebrow="SYSTEM STATUS" title="System status & information" description="This deployment is a demonstration environment. No operational decisions are executed by this system." />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--color-line)] px-5 py-3.5">
            <div className="eyebrow">SERVICE STATUS</div>
            <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">All subsystems</h2>
          </div>
          <div>
            {services.map(([service, status, note, tone]) => (
              <div key={service} className="flex flex-col gap-1.5 border-b border-[var(--color-line)] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--color-fg)]">{service}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-fg-3)]">{note}</div>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="dot" style={{ background: tone === "text-insight" ? "var(--color-insight)" : "var(--color-safe)" }} aria-hidden="true" />
                  <span className={`font-display text-[10px] font-semibold tracking-[0.14em] ${tone}`}>{status}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-5">
            <div className="flex items-center gap-3">
              <AvasyaMark size={30} />
              <div>
                <div className="font-display text-[13px] font-bold tracking-[0.24em] text-[var(--color-fg)]">AVASYA</div>
                <div className="text-[10px] text-[var(--color-fg-3)]">INTELLIGENT DISASTER RELOCATION DECISION SUPPORT</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Stat label="VERSION" value="0.1.0 · demo" />
              <Stat label="MODE" value={API_MODE === "LIVE" ? "Live API" : "Synthetic demo"} />
              <Stat label="GIS" value="Leaflet + open tiles" />
              <Stat label="BUILD" value="Next.js frontend" />
            </div>
          </section>
          <section className="panel p-5">
            <div className="eyebrow">OPERATING PRINCIPLE</div>
            <p className="mt-2.5 font-display text-[15px] font-semibold leading-6 text-[var(--color-fg)]">
              AVASYA recommends. The authorized officer decides.
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
              Every recommendation carries its reasons, tradeoffs, and capacity evidence. Final decisions are recorded
              by the officer — approve or override with a documented reason.
            </p>
          </section>
          <DemoModePanel />
        </div>
      </div>
    </div>
  );
}
