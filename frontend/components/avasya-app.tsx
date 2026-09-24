"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity as ActivityIcon,
  BellRing,
  ClipboardCheck,
  FileText,
  LayoutDashboard as LayoutDashboardIcon,
  ListOrdered,
  LogOut,
  Map,
  MapPin,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { AvasyaLogo, AvasyaMark } from "@/components/brand/avasya-mark";
import ThemeToggle from "@/components/theme/theme-toggle";
import { API_MODE, getHealth } from "@/lib/api";
import { DEMO_STAGES, setDemoMode, useCurrentDemoStage, useDemoMode } from "@/lib/demo-mode";
import { getSupabase } from "@/lib/supabase";
import CommandDashboard from "@/components/dashboard/command-dashboard";
import HazardMapWorkspace from "@/components/map/hazard-map-workspace";
import HabitationsPage from "@/components/habitations/habitations-page";
import HabitationDetails from "@/components/habitations/habitation-details";
import RelocationPriorityPage from "@/components/relocation/priority-page";
import DestinationsPage from "@/components/destinations/destinations-page";
import DestinationComparisonPage from "@/components/destinations/destination-comparison";
import CapacityCheckPage from "@/components/destinations/capacity-check";
import DestinationDetails from "@/components/destinations/destination-details";
import RecommendationList from "@/components/recommendations/recommendations-page";
import RecommendationDetails from "@/components/recommendations/recommendation-details";
import DecisionPage from "@/components/recommendations/decision-page";
import SettingsPage from "@/components/settings/settings-page";
import DemoLaunchpad from "@/components/demo/demo-launchpad";

import EvidenceExplorer from "@/components/rag/evidence-explorer";
import AlertCenter from "@/components/alerts/alert-center";
import HistoryLogsPage from "@/components/history/history-logs-page";

const monitorNav = [
  ["/dashboard", "Command Dashboard", LayoutDashboardIcon],
  ["/hazard-map", "Hazard Intelligence", Map],
  ["/habitations", "Habitation Intelligence", ActivityIcon],
] as const;

const decideNav = [
  ["/relocation-priority", "Relocation Priority", ListOrdered],
  ["/destinations", "Destination Intelligence", MapPin],
  ["/recommendations", "Decision Queue", ClipboardCheck],
] as const;

const evidenceNav = [
  ["/evidence", "Evidence Explorer", Search],
  ["/alerts", "Alert Center", BellRing],
  ["/history", "History & Logs", FileText],
] as const;

const systemNav = [
  ["/demo", "SIH Demo Flow", ClipboardCheck],
  ["/settings", "System Status", Settings],
] as const;



type ApiState = "probing" | "live" | "degraded" | "mock";

/** Single source of truth for system-state language across the app. */
function systemState(state: ApiState): { label: string; tone: string } {
  if (state === "live") return { label: "CONNECTED", tone: "text-safe" };
  if (state === "degraded") return { label: "STATUS UNKNOWN", tone: "text-immediate" };
  if (state === "probing") return { label: "CHECKING", tone: "text-[var(--color-fg-2)]" };
  return { label: "SYNTHETIC DEMO", tone: "text-insight" };
}

/** Shared health probe — used by the header chip and the sidebar status block. */
function useApiState(): ApiState {
  const [apiState, setApiState] = React.useState<ApiState>(API_MODE === "MOCK" ? "mock" : "probing");
  React.useEffect(() => {
    if (API_MODE === "MOCK") return;
    let active = true;
    (async () => {
      try {
        const health = await getHealth();
        if (!active) return;
        setApiState(health.database === "ok" ? "live" : "degraded");
      } catch {
        if (active) setApiState("degraded");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return apiState;
}

/** §11 sidebar status block — SYSTEM STATUS / API / DATA, honest about demo mode. */
function SidebarStatus() {
  const apiState = useApiState();
  const state = systemState(apiState);
  const dotStyle =
    apiState === "degraded"
      ? { background: "var(--color-immediate)" }
      : apiState === "live"
        ? undefined
        : { background: "var(--color-insight)" };
  return (
    <div className="rounded-[6px] border border-[var(--color-line)] bg-[var(--panel-wash)] px-3 py-2.5" aria-label="System status">
      <div className="flex items-center justify-between">
        <span className="eyebrow">System status</span>
        <span className={`flex items-center gap-1.5 font-display text-[10px] font-semibold tracking-[0.12em] ${state.tone}`}>
          <span className="dot" style={dotStyle} aria-hidden="true" />
          {state.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] tracking-[0.08em] text-[var(--color-fg-3)]">
        <span className="flex items-center gap-1.5">
          API
          <span className={`font-display font-semibold ${apiState === "degraded" ? "text-immediate" : apiState === "live" ? "text-safe" : "text-insight"}`}>
            {apiState === "live" ? "CONNECTED" : apiState === "degraded" ? "UNREACHABLE" : "DEMO DATASET"}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          DATA
          <span className="font-display font-semibold text-[var(--color-fg-2)]">{apiState === "live" ? "LIVE" : "SYNTHETIC"}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Header status chip — honest, never a fake live feed.
 * LIVE mode probes the backend health endpoint; MOCK mode says so plainly.
 */
function StatusBlock() {
  const apiState = useApiState();
  const state = systemState(apiState);
  const dotStyle =
    apiState === "degraded"
      ? { background: "var(--color-immediate)" }
      : apiState === "live"
        ? undefined
        : { background: "var(--color-insight)" };
  return (
    <div className="hidden items-center gap-4 border-l border-[var(--color-line)] pl-4 lg:flex">
      <div>
        <div className="eyebrow">Data mode</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="dot" style={dotStyle} aria-hidden="true" />
          <span className={`font-display text-[11px] font-semibold tracking-[0.12em] ${state.tone}`}>{state.label}</span>
        </div>
      </div>
      <div>
        <div className="eyebrow">API</div>
        <div className="mt-1 font-display text-[11px] font-semibold tracking-[0.12em] text-[var(--color-fg-2)]">
          {API_MODE === "LIVE" ? "API V1" : "MOCK"}
        </div>
      </div>
    </div>
  );
}

/** Non-intrusive SIH demo banner: mode indicator + stage progress + exit. */
function DemoBanner({ pathname }: { pathname: string }) {
  const enabled = useDemoMode();
  const stage = useCurrentDemoStage(pathname);
  if (!enabled) return null;
  const index = stage ? DEMO_STAGES.indexOf(stage) + 1 : null;
  return (
    <div className="border-b border-insight/25 bg-insight/[0.07]" role="status" aria-label="SIH demo mode active">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 lg:px-8">
        <span className="flex items-center gap-1.5 font-display text-[10px] font-semibold tracking-[0.14em] text-insight">
          <span className="dot" style={{ background: "var(--color-insight)" }} aria-hidden="true" />
          SIH DEMO
        </span>
        <span className="hidden text-[11px] text-[var(--color-fg-3)] sm:inline">Synthetic decision-support dataset</span>
        {index !== null && (
          <span className="ml-auto flex items-center gap-2 font-display text-[10px] font-semibold tracking-[0.12em] text-[var(--color-fg-2)]">
            <span className="text-[var(--color-fg-3)]">DEMO PROGRESS</span>
            <span className="metric">{String(index).padStart(2, "0")} / 07</span>
            <span className="text-insight">{stage?.title.toUpperCase()}</span>
          </span>
        )}
        <button onClick={() => setDemoMode(false)} className="btn-ghost rounded-[4px] px-2 py-1 text-[10px] font-semibold tracking-[0.1em]">
          EXIT DEMO
        </button>
      </div>
    </div>
  );
}

/** Keyboard shortcuts for the demo presenter — inert while typing in fields. */
function DemoShortcuts({ pathname }: { pathname: string }) {
  const enabled = useDemoMode();
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const currentIndex = DEMO_STAGES.findIndex((stage) => stage.match(pathname));
      if (event.key === "n" || event.key === "N") {
        const next = DEMO_STAGES[currentIndex + 1];
        if (next) {
          event.preventDefault();
          window.location.assign(next.route);
        }
      } else if (event.key === "p" || event.key === "P") {
        const prev = DEMO_STAGES[currentIndex - 1];
        if (prev) {
          event.preventDefault();
          window.location.assign(prev.route);
        }
      } else if (event.key === "Escape") {
        setDemoMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, pathname]);
  return null;
}

export function Shell({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/recommendations") return pathname === "/recommendations" || (pathname.startsWith("/recommendations/") && !pathname.endsWith("/decision"));
    if (href === "/destinations") return pathname.startsWith("/destinations") && !pathname.endsWith("/compare");
    if (href === "/habitations") return pathname === "/habitations" || (pathname.startsWith("/habitations/") && href === "/habitations");
    return pathname === href;
  };

  const sidebar = (
    <div className={`sidebar flex h-full flex-col ${open ? "w-64" : ""}`}>
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-5">
        <AvasyaLogo />
        {open && (
          <button aria-label="Close navigation" className="btn-ghost ml-auto rounded-[5px] p-1.5" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto pb-4" aria-label="Primary">
        <div className="nav-section eyebrow">Monitor</div>
        {monitorNav.map(([href, label, Icon]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-item ${isActive(href) ? "active" : ""}`}>
            <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
            {label}
          </Link>
        ))}
        <div className="nav-section eyebrow">Decide</div>
        {decideNav.map(([href, label, Icon]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-item ${isActive(href) ? "active" : ""}`}>
            <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
            {label}
          </Link>
        ))}
        <div className="nav-section eyebrow">Evidence & Alerts</div>
        {evidenceNav.map(([href, label, Icon]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-item ${isActive(href) ? "active" : ""}`}>
            <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
            {label}
          </Link>
        ))}
        <div className="nav-section eyebrow border-t border-[var(--color-line)]">System</div>
        {systemNav.map(([href, label, Icon]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-item ${pathname === href ? "active" : ""}`}>
            <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="shrink-0 border-t border-[var(--color-line)] p-3">
        <SidebarStatus />
        <div className="mt-2.5 flex items-center gap-2.5 rounded-[5px] px-2.5 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-elevated">
            <UserRound size={13} className="text-[var(--color-fg-2)]" aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-xs font-medium text-[var(--color-fg)]">Emergency Officer</span>
            <span className="block text-[10px] text-[var(--color-fg-3)]">Operations control</span>
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const supabase = getSupabase();
              if (supabase) await supabase.auth.signOut();
            } catch {
              /* demo mode has no server session to end */
            }
            setOpen(false);
            router.push("/login");
          }}
          className="btn btn-outline btn-sm mt-2 w-full justify-center gap-1.5 text-[var(--color-fg-2)] hover:border-immediate/40 hover:text-immediate"
        >
          <LogOut size={13} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-shell flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-[var(--color-line)] bg-surface lg:block">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <div className="overlay-in absolute inset-0 bg-[var(--overlay-scrim)]" onClick={() => setOpen(false)} />
          <div className="modal-in absolute inset-y-0 left-0 border-r border-[var(--color-line)] bg-surface">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <DemoShortcuts pathname={pathname} />
        <DemoBanner pathname={pathname} />
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[var(--color-line)] bg-base/85 px-4 backdrop-blur-sm lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="Open navigation" className="btn-ghost rounded-[5px] p-2 lg:hidden" onClick={() => setOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="lg:hidden">
              <AvasyaMark size={22} />
            </div>
            <div className="min-w-0">
              <div className="eyebrow">AVASYA Command</div>
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-[var(--color-fg)]" title={description}>{title}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <ThemeToggle compact />
            <StatusBlock />
            <span className="hidden items-center gap-1.5 rounded-[3px] border border-[var(--color-line)] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-fg-2)] md:inline-flex">
              <ShieldCheck size={12} aria-hidden="true" />
              AUTHORIZED PERSONNEL
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1560px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        <footer className="mx-auto max-w-[1560px] px-4 pb-8 lg:px-8">
          <div className="flex flex-col gap-1 border-t border-[var(--color-line)] pt-4 text-[10px] tracking-wide text-[var(--color-fg-3)]">
            <span>AVASYA · INTELLIGENT DISASTER RELOCATION DECISION SUPPORT SYSTEM</span>
            <span>{API_MODE === "LIVE" ? "LIVE API" : "SYNTHETIC DEMO DATA"} · NO OPERATIONAL DECISIONS ARE EXECUTED BY THIS SYSTEM</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AvasyaApp() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/" || pathname === "/login") return <Login />;
  if (pathname === "/dashboard") return <Shell title="Relocation Command Center" description="Disaster relocation decision support"><CommandDashboard /></Shell>;
  if (pathname === "/habitations") return <Shell title="Habitations" description="Monitor and investigate habitation-level disaster risk"><HabitationsPage /></Shell>;
  if (pathname.startsWith("/habitations/")) return <Shell title="Habitation detail" description="Explainable habitation-level risk assessment"><HabitationDetails id={pathname.split("/")[2]} /></Shell>;
  if (pathname === "/hazard-map") return <Shell title="Risk Map" description="Geospatial overview of habitation-level disaster risk"><HazardMapWorkspace /></Shell>;
  if (pathname === "/destinations/compare") return <Shell title="Destination comparison" description="Compare candidate relocation destinations"><DestinationComparisonPage /></Shell>;
  if (pathname.startsWith("/destinations/") && pathname.endsWith("/capacity")) return <Shell title="Capacity check" description="Assess destination capacity for the proposed relocation"><CapacityCheckPage id={pathname.split("/")[2]} /></Shell>;
  if (pathname.startsWith("/destinations/") && !pathname.endsWith("/capacity")) return <Shell title="Destination detail" description="Review destination readiness and capacity information"><DestinationDetails id={pathname.split("/")[2]} /></Shell>;
  if (pathname === "/destinations") return <Shell title="Destinations" description="Review candidate relocation destinations"><DestinationsPage /></Shell>;
  if (pathname === "/relocation-priority") return <Shell title="Relocation Priority" description="Prioritized habitations requiring officer review"><RelocationPriorityPage /></Shell>;
  if (pathname === "/recommendations") return <Shell title="Recommendations" description="Review system-generated relocation recommendations"><RecommendationList /></Shell>;
  if (pathname.startsWith("/recommendations/") && pathname.endsWith("/decision")) return <Shell title="Officer decision" description="Review the recommendation and record the final decision"><DecisionPage id={pathname.split("/")[2]} /></Shell>;
  if (pathname.startsWith("/recommendations/")) return <Shell title="Recommendation review" description="Explainable system recommendation awaiting officer decision"><RecommendationDetails id={pathname.split("/")[2]} /></Shell>;
  if (pathname === "/evidence") return <Shell title="Evidence Explorer" description="Semantic retrieval over the AVASYA evidence corpus (RAG)"><EvidenceExplorer /></Shell>;
  if (pathname === "/alerts") return <Shell title="Alert Center" description="Officer alerts generated from persisted risk assessments"><AlertCenter /></Shell>;
  if (pathname === "/history") return <Shell title="History & Logs" description="System activity and decision audit trail"><HistoryLogsPage /></Shell>;
  if (pathname === "/settings") return <Shell title="System Status" description="Demo environment status and system information"><SettingsPage /></Shell>;
  if (pathname === "/demo") return <Shell title="SIH Demonstration" description="Guided demonstration of the AVASYA decision-support workflow"><DemoLaunchpad /></Shell>;
  return (
    <Shell title="Route unavailable" description="This workspace route is not available">
      <div className="panel mx-auto max-w-md p-8 text-center">
        <h2 className="font-display text-lg font-semibold text-[var(--color-fg)]">Route unavailable</h2>
        <p className="mt-2 text-sm text-[var(--color-fg-2)]">This workspace route is not available.</p>
        <button onClick={() => router.push("/dashboard")} className="btn btn-primary mt-5">
          Return to dashboard
        </button>
      </div>
    </Shell>
  );
}

/** Split login: brand statement left, officer card right. Presentation only. */
function Login() {
  const router = useRouter();
  const [officerId, setOfficerId] = React.useState("emergency.officer");
  const [password, setPassword] = React.useState("demo-access");
  const [role, setRole] = React.useState("Operations Officer");
  return (
    <div className="app-shell grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--color-line)] bg-surface p-10 lg:flex xl:p-14">
          <div className="topo-lines absolute inset-0 opacity-70" aria-hidden="true" />
          <div className="grid-motif absolute inset-0 opacity-40" aria-hidden="true" />
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{ background: "radial-gradient(700px 420px at 70% 30%, rgba(77,141,255,0.12), transparent 65%), radial-gradient(560px 380px at 25% 80%, rgba(143,123,255,0.09), transparent 60%)" }}
          />
        <div className="relative">
          <AvasyaLogo />
        </div>
        <div className="relative max-w-xl">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-accent/60" aria-hidden="true" />
            <span className="font-display text-[11px] font-medium tracking-[0.18em] text-[var(--color-fg-2)]">
              INTELLIGENT DISASTER RELOCATION
            </span>
            <span className="h-px w-6 bg-[var(--color-info)]/60" aria-hidden="true" />
          </div>
          <div className="font-display text-[13px] tracking-[0.14em] text-[var(--color-fg-3)]">DECISION SUPPORT SYSTEM</div>
          <div className="mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--color-fg)] xl:text-5xl">
            Intelligence for safer relocation decisions.
          </div>
          <p className="mt-5 max-w-md text-sm leading-6 text-[var(--color-fg-2)]">
            AVASYA turns habitation risk, destination capacity, and access constraints into one explainable decision
            workspace for emergency operations officers.
          </p>
          <div className="mt-10 max-w-md">
            <div className="eyebrow mb-4">THE DECISION PIPELINE</div>
            <ol className="space-y-0">
              {[
                ["RISK", "Habitation-level assessment", "text-immediate"],
                ["PRIORITY", "Urgency-ranked queue", "text-short"],
                ["DESTINATION", "Capacity-gated selection", "text-accent"],
                ["DECISION", "Officer-approved, audited", "text-safe"],
              ].map(([label, detail, tone], index) => (
                <li key={label} className="relative flex items-start gap-3.5 pb-5 last:pb-0">
                  {index < 3 && (
                    <span
                      className="absolute left-[7px] top-5 h-[calc(100%-1.25rem)] w-px"
                      style={{ background: "linear-gradient(180deg, rgba(148,184,255,0.25), rgba(148,184,255,0.06))" }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">
                    <span className={`tick ${tone}`} style={{ width: 7, height: 7, borderRadius: "999px", background: "currentColor", display: "block" }} />
                  </span>
                  <span className="min-w-0">
                    <span className={`font-display text-[12px] font-semibold tracking-[0.14em] ${tone}`}>
                      {label}
                    </span>
                    <span className="block text-[11px] leading-4 text-[var(--color-fg-3)]">{detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-[10px] tracking-[0.14em] text-[var(--color-fg-3)]">
          <span className="dot" style={{ background: "var(--color-insight)" }} aria-hidden="true" />
          SYNTHETIC DEMO ENVIRONMENT · NO OPERATIONAL DECISIONS ARE EXECUTED HERE
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <AvasyaLogo />
          </div>
          <div className="panel p-7">
            <AvasyaMark size={28} />
            <h1 className="mt-5 font-display text-xl font-semibold tracking-tight text-[var(--color-fg)]">Officer sign in</h1>
            <p className="mt-1.5 text-[13px] leading-6 text-[var(--color-fg-2)]">
              Access the emergency operations decision workspace.
            </p>
            <form
              className="mt-7 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                router.push("/dashboard");
              }}
            >
              <div className="flex justify-end">
                <ThemeToggle compact />
              </div>
              <label className="eyebrow block">
                Officer ID
                <input value={officerId} onChange={(event) => setOfficerId(event.target.value)} className="field mt-2" autoComplete="username" />
              </label>
              <label className="eyebrow block">
                Password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="field mt-2" autoComplete="current-password" />
              </label>
              <label className="eyebrow block">
                Role
                <select value={role} onChange={(event) => setRole(event.target.value)} className="field mt-2">
                  <option>Operations Officer</option>
                  <option>District Controller</option>
                  <option>Relocation Analyst</option>
                </select>
              </label>
              <button type="submit" className="btn btn-primary w-full py-3">
                Sign in to command dashboard
              </button>
            </form>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-[10px] tracking-[0.14em] text-[var(--color-fg-3)]">
            DECISION-SUPPORT SYSTEM · AUTHORIZED PERSONNEL
          </div>
        </div>
      </div>
    </div>
  );
}
