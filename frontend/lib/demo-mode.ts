"use client";

import * as React from "react";

/**
 * SIH Demo Mode — a presentation layer over the existing AVASYA system.
 *
 * It never changes data, logic, or routing behavior: it only tracks which
 * stage of the decision story the presenter is on and lets the shell show a
 * banner, progress indicator, and keyboard shortcuts. Presentation state only.
 */

export type DemoStage = {
  id: string;
  step: string;
  title: string;
  short: string;
  route: string;
  /** Route prefixes (or exact paths) that count as being on this stage. */
  match: (pathname: string) => boolean;
};

const staticMatch = (target: string) => (pathname: string) => pathname === target;

export const DEMO_STAGES: DemoStage[] = [
  {
    id: "command",
    step: "01",
    title: "Command Center",
    short: "The situation at a glance — who is at risk, right now.",
    route: "/dashboard",
    match: staticMatch("/dashboard"),
  },
  {
    id: "hazard",
    step: "02",
    title: "Hazard Map",
    short: "Geospatial intelligence — where the risk sits on the map.",
    route: "/hazard-map",
    match: staticMatch("/hazard-map"),
  },
  {
    id: "habitation",
    step: "03",
    title: "Habitation",
    short: "One case in depth — H001, its people, evidence, and risk.",
    route: "/habitations/1",
    match: (p) => p.startsWith("/habitations"),
  },
  {
    id: "priority",
    step: "04",
    title: "Priority",
    short: "Who moves first — urgency-ranked relocation order.",
    route: "/relocation-priority",
    match: staticMatch("/relocation-priority"),
  },
  {
    id: "destination",
    step: "05",
    title: "Destination",
    short: "Where they can go — capacity-gated destination intelligence.",
    route: "/destinations",
    match: (p) => p.startsWith("/destinations"),
  },
  {
    id: "recommendation",
    step: "06",
    title: "Recommendation",
    short: "Why this destination — and why not the alternatives.",
    route: "/recommendations/REC-1",
    match: (p) => p.startsWith("/recommendations") && !p.endsWith("/decision"),
  },
  {
    id: "decision",
    step: "07",
    title: "Human Decision",
    short: "AVASYA recommends. The human decides.",
    route: "/recommendations/REC-1/decision",
    match: (p) => p.startsWith("/recommendations") && p.endsWith("/decision"),
  },
];

const STORAGE_KEY = "avasya-sih-demo";

const listeners = new Set<() => void>();

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "on";
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function setDemoMode(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) window.localStorage.setItem(STORAGE_KEY, "on");
  else window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function isDemoMode(): boolean {
  return readEnabled();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hydration-safe external store — server snapshot is always "off". */
export function useDemoMode(): boolean {
  return React.useSyncExternalStore(subscribe, readEnabled, () => false);
}

export function useCurrentDemoStage(pathname: string): DemoStage | null {
  return React.useMemo(() => DEMO_STAGES.find((stage) => stage.match(pathname)) ?? null, [pathname]);
}
