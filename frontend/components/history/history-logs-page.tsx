"use client";

import React from "react";
import { Clock, FileText, AlertTriangle, Check, Info } from "lucide-react";
import DecisionHistory from "@/components/history/decision-history";

interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "warning" | "success" | "error";
  category: string;
  message: string;
  details?: string;
}

const mockLogs: LogEntry[] = [
  {
    id: "LOG-001",
    timestamp: "2026-09-16 14:32:15",
    type: "info",
    category: "SYSTEM",
    message: "Dashboard loaded successfully",
    details: "Command center initialized with 10 monitored habitations",
  },
  {
    id: "LOG-002",
    timestamp: "2026-09-16 14:31:48",
    type: "success",
    category: "RECOMMENDATION",
    message: "Recommendation REC-H001 generated",
    details: "Destination D04 selected for H001 · Nandipur East — capacity SUFFICIENT",
  },
  {
    id: "LOG-003",
    timestamp: "2026-09-16 14:30:22",
    type: "warning",
    category: "DATA",
    message: "Historical event linkage unavailable",
    details: "District-level evidence only — not habitation-specific",
  },
  {
    id: "LOG-004",
    timestamp: "2026-09-16 14:29:55",
    type: "info",
    category: "GIS",
    message: "Hazard map layer loaded",
    details: "OpenStreetMap tiles — habitation coordinates verified",
  },
  {
    id: "LOG-005",
    timestamp: "2026-09-16 14:28:41",
    type: "success",
    category: "RISK",
    message: "Risk assessment completed",
    details: "All 10 habitations scored — 2 IMMEDIATE, 3 SHORT-TERM, 5 MEDIUM-TERM",
  },
  {
    id: "LOG-006",
    timestamp: "2026-09-16 14:27:18",
    type: "info",
    category: "AUTH",
    message: "Officer session started",
    details: "emergency.officer — Operations Officer role",
  },
  {
    id: "LOG-007",
    timestamp: "2026-09-16 14:25:03",
    type: "warning",
    category: "DATA",
    message: "Hazard zone geometry unavailable",
    details: "Backend spatial layer required for polygon overlay",
  },
  {
    id: "LOG-008",
    timestamp: "2026-09-16 14:22:10",
    type: "success",
    category: "CAPACITY",
    message: "Destination capacity verified",
    details: "D04 — nominal 3,200, occupied 400, usable 2,800",
  },
];

const typeConfig = {
  info: { icon: Info, color: "text-accent", bg: "bg-accent/10", border: "border-accent/30" },
  warning: { icon: AlertTriangle, color: "text-medium", bg: "bg-medium/10", border: "border-medium/30" },
  success: { icon: Check, color: "text-safe", bg: "bg-safe/10", border: "border-safe/30" },
  error: { icon: AlertTriangle, color: "text-immediate", bg: "bg-immediate/10", border: "border-immediate/30" },
};

function LogEntryCard({ entry }: { entry: LogEntry }) {
  const config = typeConfig[entry.type];
  const Icon = config.icon;

  return (
    <div className={`flex gap-4 border-b border-[var(--color-line)] p-4 transition-colors hover:bg-[var(--hover-soft)] last:border-b-0`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border ${config.border} ${config.bg}`}>
        <Icon size={14} className={config.color} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="mono text-[10px] text-[var(--color-fg-3)]">{entry.id}</span>
          <span className="rounded-[3px] border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-[var(--color-fg-3)]">
            {entry.category}
          </span>
          <span className="ml-auto text-[10px] text-[var(--color-fg-3)]">{entry.timestamp}</span>
        </div>
        <p className="mt-1 text-[13px] font-medium text-[var(--color-fg)]">{entry.message}</p>
        {entry.details && (
          <p className="mt-1 text-[11px] text-[var(--color-fg-2)]">{entry.details}</p>
        )}
      </div>
    </div>
  );
}

export default function HistoryLogsPage() {
  const [filter, setFilter] = React.useState<"all" | "info" | "warning" | "success" | "error">("all");

  const filteredLogs = filter === "all" ? mockLogs : mockLogs.filter((log) => log.type === filter);

  const stats = {
    total: mockLogs.length,
    info: mockLogs.filter((l) => l.type === "info").length,
    warning: mockLogs.filter((l) => l.type === "warning").length,
    success: mockLogs.filter((l) => l.type === "success").length,
    error: mockLogs.filter((l) => l.type === "error").length,
  };

  return (
    <div className="fade-up">
      {/* Header */}
      <div className="mb-6">
        <div className="eyebrow">SYSTEM ACTIVITY</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">
              History & Logs
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-fg-2)]">
              System activity, decision audit trail, and operational events
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[var(--color-fg-3)]" />
            <span className="text-[11px] text-[var(--color-fg-3)]">
              {stats.total} entries · SYNTHETIC DEMO
            </span>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="panel kpi-strip mb-4">
        <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-4">
          {[
            { label: "TOTAL", value: String(stats.total), tone: "text-[var(--color-fg)]" },
            { label: "INFO", value: String(stats.info), tone: "text-accent" },
            { label: "WARNINGS", value: String(stats.warning), tone: "text-medium" },
            { label: "SUCCESS", value: String(stats.success), tone: "text-safe" },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface px-4 py-3">
              <div className="eyebrow">{stat.label}</div>
              <div className={`metric mt-1 text-xl font-semibold ${stat.tone}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="panel mb-4 p-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="eyebrow shrink-0">FILTER</span>
          {(["all", "info", "warning", "success", "error"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`shrink-0 rounded-[4px] px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] transition-colors ${
                filter === type
                  ? "bg-[var(--hover-accent)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-3)] hover:bg-[var(--hover-soft)] hover:text-[var(--color-fg-2)]"
              }`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Officer decision history — API-confirmed records only */}
      <DecisionHistory />

      {/* Log entries — illustrative fixtures, NOT persisted system events.
          The officer decision history above is the API-backed audit trail. */}
      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--color-line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-[var(--color-fg-3)]" />
            <span className="font-display text-[13px] font-semibold text-[var(--color-fg)]">
              Synthetic demo activity — illustrative only
            </span>
            <span className="rounded-[3px] border border-medium/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-medium">
              SYNTHETIC DEMO · NOT PERSISTED
            </span>
            <span className="ml-auto text-[10px] text-[var(--color-fg-3)]">
              {filteredLogs.length} entries
            </span>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((entry) => (
              <LogEntryCard key={entry.id} entry={entry} />
            ))
          ) : (
            <div className="p-8 text-center text-[13px] text-[var(--color-fg-3)]">
              No log entries match the selected filter.
            </div>
          )}
        </div>
      </section>

      {/* Audit notice */}
      <div className="panel mt-4 flex items-start gap-3.5 border-accent/25 bg-accent/[0.04] p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <div className="eyebrow text-accent">AUDIT TRAIL</div>
          <p className="mt-1.5 text-[12px] leading-5 text-[var(--color-fg-2)]">
            All system actions are logged for accountability. In production mode, logs are persisted to the backend audit database.
            Demo mode shows synthetic activity entries.
          </p>
        </div>
      </div>
    </div>
  );
}
