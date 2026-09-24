/**
 * AVASYA API contracts — aligned to M's backend handoff (SIH26191).
 *
 * Two layers:
 *  1. Wire types  — exactly what M's FastAPI returns (do not invent fields).
 *  2. View models — what the UI renders, produced by adapters in lib/api.ts.
 *
 * Contract sources: AVASYA_M_Backend_API_Handbook_2 §13–20,
 *                   AVASYA_M_Backend_Handoff_Reference §6–12.
 */

/* ============================================================
   WIRE TYPES — M's backend response shapes
   ============================================================ */

/** Data origin provenance. Never label synthetic records REAL. */
export type DataOrigin = "REAL" | "MIXED" | "SYNTHETIC_DEMO";
export type DataProvenance = DataOrigin | "UNAVAILABLE" | "UNKNOWN";
export type EvidenceAvailability = "AVAILABLE" | "UNAVAILABLE" | "PARTIAL";
export type EvidenceGranularity = "HABITATION" | "VILLAGE" | "TALUK" | "DISTRICT" | "STATE" | "REGIONAL" | "UNKNOWN";

export interface SpatialEvidence {
  key: string;
  label: string;
  availability: EvidenceAvailability;
  granularity: EvidenceGranularity;
  provenance: DataProvenance;
  value?: string | number | null;
  source?: string | null;
  note?: string | null;
}

/** §14 — risk level. MEDIUM (not MODERATE). */
export type WireRiskLevel = "LOW" | "MEDIUM" | "HIGH";

/** §15 — relocation priority label. */
export type WirePriorityLabel = string;

export interface WireHabitation {
  id: number;
  name: string;
  village_or_ward: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  households: number | null;
  data_origin: DataOrigin;
}

export interface WireRiskAssessment {
  id: number;
  habitation_id: number;
  overall_risk_score: number;
  risk_level: WireRiskLevel;
  confidence_score: number | null;
  model_version: string | null;
  input_snapshot: unknown;
  normalized_values: Record<string, number> | null;
  weights: Record<string, number> | null;
  contributions: Record<string, number> | null;
  reasons: string[] | null;
  warnings: string[] | null;
  freshness: string | null;
  data_quality: string | null;
  calculation_details: unknown;
  data_origin: DataOrigin;
  generated_at: string | null;
}

export interface WireRelocationPriority {
  id: number;
  habitation_id: number;
  destination_id: number;
  priority_score: number;
  priority_label: WirePriorityLabel;
  rationale: string | null;
  eligible_destination: unknown | null;
  data_origin: DataOrigin;
}

export interface WireDestination {
  id: number;
  name: string;
  data_origin: DataOrigin;
  [key: string]: unknown;
}

export interface WireCapacityAssessment {
  id: number;
  destination_id: number;
  habitation_id: number | null;
  nominal_capacity: number | null;
  existing_occupancy: number | null;
  water_constraint: number | null;
  sanitation_constraint: number | null;
  safety_reserve: number | null;
  usable_capacity: number | null;
  required_capacity: number | null;
  capacity_gap: number | null;
  eligibility: boolean;
  status: string;
  assessment_details: unknown;
  data_origin: DataOrigin;
}

export interface WireRecommendation {
  id: number;
  summary: string;
  recommendation_type: string | null;
  details: unknown;
  confidence_score: number | null;
  destination_id: number | null;
  data_origin: DataOrigin;
  created_at: string | null;
}

/** GET /recommendations — one entry per habitation in the officer queue. */
export interface WireRecommendationQueueEntry {
  recommendation_id: number;
  habitation_id: number | null;
  habitation_name: string | null;
  district: string | null;
  state: string | null;
  population: number | null;
  priority_label: string | null;
  risk_score: number | null;
  risk_level: string | null;
  recommendation_type: string | null;
  summary: string | null;
  destination_id: number | null;
  destination_name: string | null;
  capacity_status: string | null;
  decided: boolean;
  decided_action: string | null;
  data_origin: DataOrigin;
}

export interface WireApprovalRequest {
  action: "APPROVE" | "OVERRIDE";
  final_destination_id: number;
  override_note: string | null;
}

export interface WireApprovalRecord {
  id: number;
  recommendation_id: number;
  officer_user_id: number;
  action: "APPROVE" | "OVERRIDE";
  original_recommendation: unknown;
  final_destination_id: number;
  override_note: string | null;
  data_origin: DataOrigin;
  created_at: string | null;
}

/** GET /recommendations/approvals — persisted officer decision history. */
export interface WireApprovalHistoryEntry {
  approval_id: number;
  recommendation_id: number;
  action: "APPROVED" | "REJECTED" | "OVERRIDDEN";
  decision_time: string;
  officer_user_id: number;
  habitation_id: number | null;
  habitation_name: string | null;
  recommendation_summary: string | null;
  original_destination_id: number | null;
  final_destination_id: number | null;
  final_destination_name: string | null;
  override_note: string | null;
  data_origin: DataOrigin;
}

/** §12 — health endpoints. */
export interface WireHealth {
  status: string;
  database?: string;
}

/* ============================================================
   INTELLIGENCE WIRE TYPES — hazard status, response time, transport,
   alerts, pipeline assess (backend/routes/intelligence.py)
   ============================================================ */

export type HazardStatusValue = "RED" | "YELLOW" | "NO_ALERT" | "DATA_UNAVAILABLE";

export interface WireHazardStatus {
  habitation_id: number;
  hazard_id: number | null;
  hazard_type: string;
  status: HazardStatusValue;
  severity_score: number | null;
  probability_score: number | null;
  basis: string;
  evidence_id: number | null;
  source_name: string | null;
  source_url: string | null;
  evidence_time: string | null;
  staleness_limit_hours: number | null;
  is_stale: boolean | null;
  reason_codes: string[];
  methodology: string;
  limitations: string[];
  data_origin: DataOrigin;
}

export interface WireTransportRoute {
  destination_id: number;
  destination_name: string;
  distance_km: number;
  travel_time_hours: number | null;
  route_risk_score: number;
  accessibility_score: number | null;
  blocked_segments: string[];
  hazard_exposure_along_route: string;
  usable_capacity: number | null;
  required_capacity: number | null;
  capacity_sufficient: boolean | null;
  cost: number | null;
  cost_breakdown: Record<string, number | null>;
  data_origin: DataOrigin;
  limitations: string[];
}

export interface WireTransportPlan {
  habitation_id: number;
  recommended_destination_id: number | null;
  recommended_route: WireTransportRoute | null;
  alternatives: WireTransportRoute[];
  methodology: string;
  limitations: string[];
  data_origin: DataOrigin;
}

export interface WireResponseTime {
  habitation_id: number;
  urgency: "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "MONITOR";
  hazard_status: HazardStatusValue;
  hazard_type: string;
  available_response_time_hours: number | null;
  estimated_transport_time_hours: number | null;
  buffer_hours: number | null;
  time_established: boolean;
  population_exposed: number | null;
  reason_codes: string[];
  methodology: string;
  limitations: string[];
  data_origin: DataOrigin;
}

export interface WireDecisionAlert {
  alert_kind: string;
  hazard: string;
  severity: string;
  affected_habitation_id: number;
  current_status: HazardStatusValue;
  reason: string;
  source_name: string | null;
  source_url: string | null;
  timestamp: string;
  recommended_action: string;
  response_window_hours: number | null;
  limitations: string[];
}

export interface WireAssessResult {
  habitation_id: number;
  hazard_statuses: WireHazardStatus[];
  overall_hazard_status: HazardStatusValue;
  risk: {
    id: number;
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH";
    contributions: Record<string, number>;
    weights: Record<string, number>;
    confidence: number | null;
    data_origin: DataOrigin;
    calculation_details: unknown;
  };
  relocation_priority: {
    id: number;
    score: number;
    label: string | null;
    rationale: unknown;
    required_capacity: number;
  };
  recommendation: {
    id: number;
    summary: string;
    type: string | null;
    destination_id: number | null;
    details: unknown;
    data_origin: DataOrigin;
  };
  transport: WireTransportPlan | { error: string; status: string };
  response_time: WireResponseTime;
  alert: WireDecisionAlert | null;
  chain: string[];
  warnings: string[];
}

export interface WireAlertsResponse {
  alerts: WireDecisionAlert[];
  disclaimer: string;
}

export interface WireClaimValidationReport {
  claims: Array<{
    field: string;
    llm_value: unknown;
    avasya_value: unknown;
    status: "VERIFIED" | "CONFLICT" | "UNSUPPORTED";
    explanation: string;
    avasya_source: string | null;
  }>;
  summary: Record<string, number>;
}

/* ============================================================
   VIEW MODELS — what the UI renders (adapters produce these)
   ============================================================ */

/** UI priority tiers. MEDIUM-TERM maps from M's relocation priority labels. */
export type Priority = "IMMEDIATE" | "SHORT-TERM" | "MEDIUM-TERM";
export type RiskLevel = WireRiskLevel;

/** UI destination availability. Derived from capacity eligibility + status. */
export type DestinationStatus = "AVAILABLE" | "LIMITED" | "FULL" | "UNSAFE";

export interface Habitation {
  /** Wire id as string for routing (URLs stay /habitations/1). */
  id: string;
  wireId: number;
  name: string;
  village: string | null;
  district: string | null;
  state: string | null;
  population: number | null;
  households: number | null;
  dataOrigin: DataOrigin;
  /** Present only when a persisted risk assessment exists (may be null). */
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  confidence: number | null;
  warnings: string[];
  dataQuality: string | null;
  /** Priority — only meaningful when relocation data exists. */
  priority: Priority | null;
  hazard: string | null;
  coordinates: [number, number] | null;
  /** Risk factor breakdown, when available. */
  factors: RiskAssessment["factors"] | null;
  summary: string | null;
  /** Optional P4-backed evidence; absent means the API did not provide it. */
  spatialEvidence?: SpatialEvidence[];
  hazardSource?: string | null;
  hazardLinkage?: string | null;
}

export interface RiskAssessment {
  habitationId: string;
  score: number;
  level: RiskLevel;
  summary: string;
  factors: RiskFactor[];
  warnings: string[];
  dataQuality: string | null;
  confidence: number | null;
  dataOrigin: DataOrigin;
  generatedAt: string | null;
}

export interface RiskFactor {
  name: string;
  contribution: number;
  severity: "critical" | "elevated" | "moderate";
  explanation: string;
}

export interface Destination {
  id: string;
  wireId: number;
  name: string;
  dataOrigin: DataOrigin;
  status: DestinationStatus;
  eligible: boolean;
  nominalCapacity: number | null;
  currentOccupancy: number | null;
  usableCapacity: number | null;
  requiredCapacity: number | null;
  capacityGap: number | null;
  waterConstraint: number | null;
  sanitationConstraint: number | null;
  safetyReserve: number | null;
  hazardExposure: string;
  roadAccess: string;
  healthcareDistance: string;
  water: string;
  sanitation: string;
  coordinates: [number, number] | null;
}

export interface CapacityCheck {
  destinationId: string;
  nominalCapacity: number;
  currentOccupancy: number;
  waterConstraint: number;
  sanitationConstraint: number;
  reserves: number;
  usableCapacity: number;
  requiredCapacity: number;
  capacityGap: number;
  /** M's capacity gate: usable >= required. */
  status: "SUFFICIENT" | "INSUFFICIENT";
  eligibility: boolean;
  dataOrigin: DataOrigin;
}

export interface Recommendation {
  id: string;
  wireId: number;
  habitationWireId: number;
  habitationId: string;
  destinationWireId: number | null;
  destinationId: string | null;
  summary: string;
  /** NO_ELIGIBLE_DESTINATION when the gate rejects everything. */
  recommendationType: string | null;
  confidence: number | null;
  priority: Priority | null;
  capacityStatus: "SUFFICIENT" | "INSUFFICIENT" | "UNKNOWN";
  reasons: string[];
  whyNot: { destination: string; reason: string }[];
  alternativeDestinationId: string | null;
  alternativeReason: string | null;
  dataOrigin: DataOrigin;
  createdAt: string | null;
}

/** API failure taxonomy from §11 of the handoff reference. */
export type ApiErrorKind = "unavailable" | "not-found" | "auth" | "validation" | "network" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
  constructor(kind: ApiErrorKind, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}
