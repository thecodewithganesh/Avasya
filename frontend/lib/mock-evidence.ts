import type { EvidenceRecord } from "@/types/rag";

/**
 * SYNTHETIC DEMO evidence corpus — mock mode only.
 *
 * Every record is assembled from values that already exist in the AVASYA mock
 * dataset (Raipur district habitations, flood/waterlogging hazards, the D04/D02
 * destination pair). Nothing here represents a real source. In LIVE mode the
 * loaders never touch this file — they throw honest 503s instead.
 */

const ORIGIN = "SYNTHETIC_DEMO" as const;

function record(input: Omit<EvidenceRecord, "origin" | "sourceType" | "verification"> & { sourceType?: EvidenceRecord["sourceType"] }): EvidenceRecord {
  return {
    sourceType: "ASSESSMENT",
    verification: "UNVERIFIED — SYNTHETIC",
    origin: ORIGIN,
    ...input,
  };
}

export const mockEvidenceRecords: EvidenceRecord[] = [
  record({
    sourceId: "FLD-DEMO-001",
    title: "Nandipur East flood exposure assessment",
    habitationId: "1",
    hazardType: "River flood",
    date: "2025 monsoon cycle",
    snippet:
      "Low-lying settlement adjacent to the river channel. Assessed flood exposure contributes the largest share of the rule-engine risk score; primary access road restricts emergency movement during peak discharge.",
    relevance: 0.91,
  }),
  record({
    sourceId: "HIS-DEMO-014",
    title: "Historical event record — Raipur district floods",
    sourceType: "HISTORICAL_EVENT",
    habitationId: "1",
    hazardType: "River flood",
    date: "Multi-year record",
    snippet:
      "Recorded district-level flood events inform the historical contribution. District-granularity evidence was not substituted as habitation-specific.",
    relevance: 0.78,
  }),
  record({
    sourceId: "ACC-DEMO-003",
    title: "Access and evacuation route note — Nandipur East",
    sourceType: "FIELD_SURVEY",
    habitationId: "1",
    hazardType: "River flood",
    date: "2025",
    snippet:
      "Single primary access route constrains emergency movement at high water levels; road accessibility contribution flagged critical in the persisted assessment.",
    relevance: 0.74,
  }),
  record({
    sourceId: "CAP-DEMO-004",
    title: "D04 shelter capacity assessment",
    habitationId: "1",
    hazardType: "Relocation",
    date: "2026",
    snippet:
      "Synthetic eligible shelter: 4,200 nominal, 2,800 usable after water/sanitation constraints and safety reserve — sufficient for the 1,240 people of H001 under the documented capacity gate.",
    relevance: 0.69,
  }),
  record({
    sourceId: "FLD-DEMO-002",
    title: "Keshav Nagar flood exposure assessment",
    habitationId: "2",
    hazardType: "River flood",
    date: "2025 monsoon cycle",
    snippet:
      "Similar channel-adjacent exposure profile to H001 with a high persisted risk score; population contribution elevated at 980 residents across 245 households.",
    relevance: 0.88,
  }),
  record({
    sourceId: "FLD-DEMO-003",
    title: "Bela Khurd flood exposure assessment",
    habitationId: "3",
    hazardType: "River flood",
    date: "2025 monsoon cycle",
    snippet:
      "Largest population among the high-risk trio (1,560 people); exposure contribution critical, road accessibility constrained.",
    relevance: 0.85,
  }),
  record({
    sourceId: "WTR-DEMO-005",
    title: "Amrit Tola waterlogging note",
    habitationId: "6",
    hazardType: "Waterlogging",
    date: "2025",
    snippet:
      "Recurring seasonal waterlogging rather than channel flooding; medium risk band under the locked methodology with monitor-level priority.",
    relevance: 0.66,
  }),
  record({
    sourceId: "SUR-DEMO-010",
    title: "Devganj village survey extract",
    sourceType: "FIELD_SURVEY",
    habitationId: "7",
    hazardType: "Low exposure",
    date: "2024",
    snippet:
      "No dominant hazard recorded; low persisted risk score and no relocation recommendation issued.",
    relevance: 0.52,
  }),
];
