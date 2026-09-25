import {
  ApiError,
  type ApiErrorKind,
  type CapacityCheck,
  type DataOrigin,
  type Destination,
  type DestinationStatus,
  type Habitation,
  type Priority,
  type Recommendation,
  type RiskAssessment,
  type RiskLevel,
  type WireAlertsResponse,
  type WireApprovalRequest,
  type WireApprovalRecord,
  type WireApprovalHistoryEntry,
  type WireAssessResult,
  type WireCapacityAssessment,
  type WireDestination,
  type WireHazardStatus,
  type WireHabitation,
  type WireHealth,
  type WirePriorityLabel,
  type WireRecommendation,
  type WireRecommendationQueueEntry,
  type WireRelocationPriority,
  type WireResponseTime,
  type WireRiskAssessment,
  type WireTransportPlan,
  type WireClaimValidationReport,
} from "@/types/api";
import { entityLabel } from "@/lib/format";
import { getAccessToken } from "@/lib/supabase";
import {
  mockCapacityChecks,
  mockDestinations,
  mockHabitations,
  mockRecommendations,
  mockRiskAssessments,
} from "@/lib/mock-data";

/**
 * Dual-mode API client.
 *
 *  LIVE  — talks to M's FastAPI at NEXT_PUBLIC_API_URL using the documented
 *          /api/v1 contract (handbook §11–20). THIS IS THE DEFAULT: an unset
 *          env var must never silently downgrade the UI to synthetic data
 *          (audit Part 14 — accidental demo mode is dangerous).
 *  MOCK  — serves the local synthetic demo dataset ONLY when explicitly
 *          opted in via NEXT_PUBLIC_USE_MOCK_DATA=true (or NEXT_PUBLIC_DATA_MODE=demo).
 *
 * Errors follow M's taxonomy: 401 auth, 404 not-found, 422 validation,
 * 503 evidence/dependency unavailable.
 */

import { API_V1, SERVER_API_V1, resolveUseMockData } from "@/lib/api-base";

/** Demo officer identity — the documented local auth mechanism (§19). */
const OFFICER_EMAIL = process.env.NEXT_PUBLIC_DEMO_OFFICER_EMAIL || "demo.officer@avasya.local";

export const USE_MOCK_DATA = resolveUseMockData();
export const API_MODE: "LIVE" | "MOCK" = USE_MOCK_DATA ? "MOCK" : "LIVE";

function mockWireId(value: string): string {
  const match = value.match(/^(?:H|D)?0*(\d+)$/i);
  return match ? String(Number(match[1])) : value;
}

async function getJson<T>(path: string): Promise<T> {
  // Server-side execution (Docker) uses the internal compose hostname;
  // browser execution uses the public host-mapped URL. Absolute URLs are
  // passed through untouched (getHealth probes non-/api/v1 paths).
  const prefix = typeof window === "undefined" ? SERVER_API_V1 : API_V1;
  const url = /^https?:\/\//i.test(path) ? path : `${prefix}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", headers: await authHeaders() });
  } catch {
    throw new ApiError("network", 0, "Unable to reach the AVASYA API service.");
  }
  return parseResponse(response);
}

/**
 * Auth headers for the backend.
 *
 * Supabase enabled  -> Authorization: Bearer <access token> (the backend
 *                      verifies the JWT; X-Officer-Email is omitted so the
 *                      verified identity always wins).
 * Supabase disabled -> the documented demo-officer header mechanism.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return { "X-Officer-Email": OFFICER_EMAIL };
}

// Demo-mode officer headers (Supabase-enabled callers use authHeaders()).
// This comment replaces the now-unused officerHeaders() helper; the approval
// POST and every getJson() call share authHeaders() instead.

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  throw toApiError(response);
}

function toApiError(response: Response): ApiError {
  const kind: ApiErrorKind =
    response.status === 401
      ? "auth"
      : response.status === 404
        ? "not-found"
        : response.status === 422
          ? "validation"
          : response.status === 503
            ? "unavailable"
            : "unknown";
  const messages: Record<ApiErrorKind, string> = {
    auth: "Officer authentication was rejected. Check the configured officer identity.",
    "not-found": "The requested record does not exist in the operational database.",
    validation: "The request was rejected as invalid by the decision service.",
    unavailable: "Required decision evidence is not available for this record.",
    network: "Unable to reach the AVASYA API service.",
    unknown: "The AVASYA API returned an unexpected error.",
  };
  return new ApiError(kind, response.status, messages[kind]);
}

/* ============================================================
   ADAPTERS — wire → view model
   ============================================================ */

const RISK_WEIGHTS: Record<string, string> = {
  hazard_exposure: "Hazard exposure",
  population: "Population",
  vulnerability: "Vulnerability",
  historical_events: "Historical disasters",
  road_accessibility: "Road accessibility",
};

/** M's risk level → UI priority tier (display only, derived from level). */
function levelToPriority(level: RiskLevel | null): Priority | null {
  if (!level) return null;
  if (level === "HIGH") return "IMMEDIATE";
  if (level === "MEDIUM") return "SHORT-TERM";
  return "MEDIUM-TERM";
}

function severityFor(contribution: number): "critical" | "elevated" | "moderate" {
  if (contribution >= 25) return "critical";
  if (contribution >= 10) return "elevated";
  return "moderate";
}

/** M's API returns `warnings` as {items: [...]} and `data_quality` as an
 * object; normalize both to the plain-string-array / string shapes the UI
 * expects, without trusting any particular shape from the wire. */
function normalizeWarnings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return ((value as { items: unknown[] }).items).filter((item): item is string => typeof item === "string");
  }
  return [];
}

function normalizeDataQuality(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const origin = (value as { origin?: unknown }).origin;
    if (typeof origin === "string") return origin;
  }
  return null;
}

function adaptRisk(wire: WireRiskAssessment): RiskAssessment {
  const contributions = wire.contributions ?? {};
  const factors = Object.entries(RISK_WEIGHTS)
    .filter(([key]) => contributions[key] !== undefined && contributions[key] !== null)
    .map(([key, name]) => ({
      name,
      contribution: Number(contributions[key]) || 0,
      severity: severityFor(Number(contributions[key]) || 0),
      explanation: `Locked-model contribution at weight ${formatWeight(wire.weights?.[key])}.`,
    }));
  return {
    habitationId: String(wire.habitation_id),
    score: wire.overall_risk_score,
    level: wire.risk_level,
    summary:
      (wire.reasons && wire.reasons.length > 0
        ? wire.reasons.join(" ")
        : `Risk assessment produced a score of ${wire.overall_risk_score} (${wire.risk_level}).`) +
      (wire.warnings && wire.warnings.length > 0 ? ` Note: ${wire.warnings[0]}` : ""),
    factors,
    warnings: normalizeWarnings(wire.warnings),
    dataQuality: normalizeDataQuality(wire.data_quality),
    confidence: wire.confidence_score,
    dataOrigin: wire.data_origin,
    generatedAt: wire.generated_at,
  };
}

function formatWeight(weight: unknown): string {
  if (typeof weight === "number") return `${Math.round(weight * 100)}%`;
  return "the locked methodology";
}

function adaptHabitation(
  wire: WireHabitation,
  risk: WireRiskAssessment | null,
  relocation: WireRelocationPriority | null,
): Habitation {
  const coords: [number, number] | null =
    wire.latitude !== null && wire.longitude !== null ? [wire.latitude, wire.longitude] : null;
  const adapted = risk ? adaptRisk(risk) : null;
  const priority: Priority | null = relocation
    ? labelToPriority(relocation.priority_label)
    : levelToPriority(adapted?.level ?? null);
  const hazard = firstHazardHint(adapted);
  return {
    id: String(wire.id),
    wireId: wire.id,
    name: wire.name,
    village: wire.village_or_ward,
    district: wire.district,
    state: wire.state,
    population: wire.population,
    households: wire.households,
    dataOrigin: wire.data_origin,
    riskScore: risk ? risk.overall_risk_score : null,
    riskLevel: risk ? risk.risk_level : null,
    confidence: risk ? risk.confidence_score : null,
    warnings: normalizeWarnings(risk?.warnings),
    dataQuality: normalizeDataQuality(risk?.data_quality),
    priority,
    hazard,
    coordinates: coords,
    factors: adapted?.factors ?? null,
    summary: adapted?.summary ?? null,
  };
}

function labelToPriority(label: WirePriorityLabel | string | null): Priority {
  const normalized = String(label ?? "").toUpperCase();
  if (normalized.includes("IMMEDIATE")) return "IMMEDIATE";
  if (normalized.includes("HIGH")) return "IMMEDIATE"; // backend uses HIGH as its second-most-urgent tier
  if (normalized.includes("SHORT")) return "SHORT-TERM";
  if (normalized.includes("MEDIUM")) return "SHORT-TERM";
  return "MEDIUM-TERM";
}

function firstHazardHint(risk: RiskAssessment | null): string | null {
  if (!risk) return null;
  const top = [...risk.factors].sort((a, b) => b.contribution - a.contribution)[0];
  return top ? top.name : null;
}

function destinationStatus(wire: WireCapacityAssessment | null, eligible: boolean): DestinationStatus {
  // No capacity assessment = capacity data UNAVAILABLE, not UNSAFE. Labelling
  // unassessed destinations "UNSAFE" fabricated a verdict from missing data.
  if (!wire) return "LIMITED";
  if (eligible && (wire.capacity_gap ?? 0) > 1000) return "AVAILABLE";
  if (eligible) return "LIMITED";
  return (wire.usable_capacity ?? 0) <= 0 ? "UNSAFE" : "FULL";
}

function adaptDestination(wire: WireDestination, capacity: WireCapacityAssessment | null): Destination {
  const eligible = capacity ? capacity.eligibility : false;
  const details = (capacity?.assessment_details ?? {}) as Record<string, unknown>;
  return {
    id: String(wire.id),
    wireId: wire.id,
    name: wire.name,
    dataOrigin: wire.data_origin,
    status: destinationStatus(capacity, eligible),
    eligible,
    nominalCapacity: capacity?.nominal_capacity ?? null,
    currentOccupancy: capacity?.existing_occupancy ?? null,
    usableCapacity: capacity?.usable_capacity ?? null,
    requiredCapacity: capacity?.required_capacity ?? null,
    capacityGap: capacity?.capacity_gap ?? null,
    waterConstraint: capacity?.water_constraint ?? null,
    sanitationConstraint: capacity?.sanitation_constraint ?? null,
    safetyReserve: capacity?.safety_reserve ?? null,
    hazardExposure: typeof details.hazard_exposure === "string" ? details.hazard_exposure : "—",
    roadAccess: typeof details.road_access === "string" ? details.road_access : "—",
    healthcareDistance: typeof details.healthcare_distance === "string" ? details.healthcare_distance : "—",
    water: typeof details.water === "string" ? details.water : "—",
    sanitation: typeof details.sanitation === "string" ? details.sanitation : "—",
    coordinates: null,
  };
}

function adaptCapacity(wire: WireCapacityAssessment): CapacityCheck {
  return {
    destinationId: String(wire.destination_id),
    nominalCapacity: wire.nominal_capacity ?? 0,
    currentOccupancy: wire.existing_occupancy ?? 0,
    waterConstraint: wire.water_constraint ?? 0,
    sanitationConstraint: wire.sanitation_constraint ?? 0,
    reserves: wire.safety_reserve ?? 0,
    usableCapacity: wire.usable_capacity ?? 0,
    requiredCapacity: wire.required_capacity ?? 0,
    capacityGap: wire.capacity_gap ?? 0,
    status: wire.eligibility ? "SUFFICIENT" : "INSUFFICIENT",
    eligibility: wire.eligibility,
    dataOrigin: wire.data_origin,
  };
}

function adaptRecommendation(
  wire: WireRecommendation,
  habitation: Habitation,
  destinations: Destination[],
  relocation: WireRelocationPriority | null,
): Recommendation {
  const destination = destinations.find((d) => d.wireId === wire.destination_id);
  const alternative = destinations.find(
    (d) => d.wireId !== wire.destination_id && d.eligible,
  );
  const noEligible = wire.summary === "NO_ELIGIBLE_DESTINATION";
  const reasons = extractReasons(wire.details) ?? (relocation?.rationale ? [relocation.rationale] : []);
  return {
    id: String(wire.id),
    wireId: wire.id,
    habitationWireId: habitation.wireId,
    habitationId: habitation.id,
    destinationWireId: wire.destination_id,
    destinationId: destination?.id ?? null,
    summary: wire.summary,
    recommendationType: wire.recommendation_type,
    confidence: wire.confidence_score,
    priority: habitation.priority,
    capacityStatus: destination?.status === "UNSAFE" || destination?.status === "FULL" ? "INSUFFICIENT" : destination ? "SUFFICIENT" : "UNKNOWN",
    reasons: noEligible ? ["No destination passed the capacity eligibility gate."] : reasons,
    whyNot: destinations
      .filter((d) => d.wireId !== wire.destination_id && !d.eligible)
      .map((d) => ({
        destination: entityLabel(d.name, d.id),
        reason:
          d.capacityGap !== null && d.capacityGap < 0
            ? `Usable capacity falls short of the requirement by ${Math.abs(d.capacityGap).toLocaleString()}.`
            : "Filtered out by the capacity eligibility gate.",
      })),
    alternativeDestinationId: alternative?.id ?? null,
    alternativeReason: alternative ? "Next-best eligible destination if the recommendation is unavailable." : null,
    dataOrigin: wire.data_origin,
    createdAt: wire.created_at,
  };
}

function extractReasons(details: unknown): string[] | null {
  if (Array.isArray(details)) return details.filter((item): item is string => typeof item === "string");
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    if (Array.isArray(record.reasons)) return record.reasons.filter((item): item is string => typeof item === "string");
    if (typeof record.rationale === "string") return [record.rationale];
    // Backend seeds store a single "reason" string inside details (e.g.
    // "Highest-priority eligible destination selected.") — surface it.
    if (typeof record.reason === "string" && record.reason.trim()) return [record.reason];
  }
  return null;
}

/* ============================================================
   PUBLIC API — same call signatures the components already use
   ============================================================ */

export async function getHealth(): Promise<WireHealth> {
  // /health sits outside /api/v1 — probe the base URL directly, then the
  // versioned alias some deployments expose. getJson passes absolute URLs
  // through untouched.
  // Both bases come from lib/api-base (browser vs server-side SSR resolution).
  const base = (typeof window === "undefined" ? SERVER_API_V1 : API_V1).replace(/\/api\/v1$/, "");
  const v1 = typeof window === "undefined" ? SERVER_API_V1 : API_V1;
  return getJson<WireHealth>(`${base}/health`).catch(() => getJson<WireHealth>(`${v1}/health`));
}

export async function getHabitations(): Promise<Habitation[]> {
  if (USE_MOCK_DATA) return mockHabitations;
  const wire = await getJson<WireHabitation[]>("/habitations?limit=500");
  // PERF: the previous implementation fired /risk + /relocation per row
  // (1,001 requests at limit=500) which made the dashboard take minutes and
  // flooded the console with 503s for villages lacking assessments.
  // Instead: ONE call to /recommendations (the decision-queue endpoint,
  // newest recommendation per habitation with risk_score/risk_level/
  // priority_label/capacity) and merge that into the habitation list.
  // Detailed per-habitation evidence is still available on the detail pages
  // via getHabitationRisk/getHabitationRelocation.
  let queue: WireRecommendationQueueEntry[] = [];
  try {
    queue = await getJson<WireRecommendationQueueEntry[]>("/recommendations?limit=500&include_decided=true");
  } catch {
    /* queue unavailable — fall back to un-enriched rows */
  }
  const byHabitation = new Map(queue.filter((q) => q.habitation_id !== null).map((q) => [q.habitation_id as number, q]));
  return wire.map((item) => {
    const entry = byHabitation.get(item.id);
    if (!entry) return adaptHabitation(item, null, null);
    const risk: WireRiskAssessment | null = {
      ...(entry.risk_score !== null ? { overall_risk_score: entry.risk_score } : {}),
      ...(entry.risk_level ? { risk_level: entry.risk_level } : {}),
    } as unknown as WireRiskAssessment;
    const relocation: WireRelocationPriority | null = {
      priority_label: entry.priority_label as WirePriorityLabel,
      priority_score: entry.risk_score ?? 0,
    } as unknown as WireRelocationPriority;
    return adaptHabitation(item, risk, relocation);
  });
}

export async function getHabitation(id: string): Promise<Habitation> {
  if (USE_MOCK_DATA) {
    const found = mockHabitations.find((item) => item.id === mockWireId(id));
    if (!found) throw new ApiError("not-found", 404, "Habitation not found.");
    return found;
  }
  const wire = await getJson<WireHabitation>(`/habitations/${encodeURIComponent(id)}`);
  let risk: WireRiskAssessment | null = null;
  let relocation: WireRelocationPriority | null = null;
  try {
    risk = await getJson<WireRiskAssessment>(`/habitations/${wire.id}/risk`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 503) throw error;
    // 503 = no persisted risk assessment yet — render with empty risk state.
  }
  try {
    relocation = await getJson<WireRelocationPriority>(`/habitations/${wire.id}/relocation`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 503) throw error;
  }
  return adaptHabitation(wire, risk, relocation);
}

export async function getHabitationRisk(id: string): Promise<RiskAssessment> {
  if (USE_MOCK_DATA) {
    const found = mockRiskAssessments[mockWireId(id)];
    if (!found) throw new ApiError("not-found", 404, "Habitation not found.");
    return found;
  }
  const wire = await getJson<WireRiskAssessment>(`/habitations/${encodeURIComponent(id)}/risk`);
  return adaptRisk(wire);
}

export async function getHabitationRelocation(id: string): Promise<WireRelocationPriority> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Relocation data is not part of the local mock dataset.");
  return getJson<WireRelocationPriority>(`/habitations/${encodeURIComponent(id)}/relocation`);
}

export async function getEligibleDestinations(habitationId: string): Promise<Destination[]> {
  if (USE_MOCK_DATA) return mockDestinations.filter((d) => d.eligible);
  const wire = await getJson<WireDestination[]>(`/habitations/${encodeURIComponent(habitationId)}/destinations`);
  // Each candidate arrives with its own capacity assessment (handbook §17);
  // without it every destination would falsely render UNSAFE and break the
  // override flow. Fall back to a bare fetch only if the embed is absent.
  const adapted = wire.map((item) => adaptDestination(item, (item as { capacity_assessment?: WireCapacityAssessment | null }).capacity_assessment ?? null));
  if (adapted.some((item) => item.nominalCapacity !== null)) return adapted;
  return Promise.all(
    wire.map(async (item) => {
      const capacity = await getJson<WireCapacityAssessment>(`/destinations/${item.id}/capacity`).catch(() => null);
      return adaptDestination(item, capacity);
    }),
  );
}

export async function getDestinations(): Promise<Destination[]> {
  if (USE_MOCK_DATA) return mockDestinations;
  // Live mode has no /destinations list endpoint in the contract. Derive the
  // register from the decision queue (every destination actually selected by
  // a recommendation, with its own capacity assessment) instead of hardcoding
  // habitation 1 — inventing "Destination {id}" names for unassessed rows
  // fabricated entities the backend never described.
  const queue = await getJson<WireRecommendationQueueEntry[]>("/recommendations?limit=500&include_decided=true").catch(() => [] as WireRecommendationQueueEntry[]);
  const destinationIds = [...new Set(queue.map((entry) => entry.destination_id).filter((id): id is number => id !== null))];
  const results = await Promise.all(
    destinationIds.map(async (id) => {
      const capacity = await getJson<WireCapacityAssessment>(`/destinations/${id}/capacity`).catch(() => null);
      const entry = queue.find((item) => item.destination_id === id);
      const name = entry?.destination_name ?? `Destination ${id}`;
      return adaptDestination({ id, name, data_origin: capacity?.data_origin ?? "UNKNOWN" as DataOrigin }, capacity);
    }),
  );
  return results;
}

export async function getDestinationCapacity(id: string): Promise<CapacityCheck> {
  if (USE_MOCK_DATA) {
    const found = mockCapacityChecks[mockWireId(id)];
    if (!found) throw new ApiError("not-found", 404, "Destination not found.");
    return found;
  }
  const wire = await getJson<WireCapacityAssessment>(`/destinations/${encodeURIComponent(id)}/capacity`);
  return adaptCapacity(wire);
}

export async function getRecommendationFor(habitationId: string): Promise<Recommendation> {
  if (USE_MOCK_DATA) {
    const found = mockRecommendations.find((item) => item.habitationId === mockWireId(habitationId));
    if (!found) throw new ApiError("not-found", 404, "No recommendation exists for this habitation.");
    return found;
  }
  const [wire, habitation, destinations] = await Promise.all([
    getJson<WireRecommendation>(`/habitations/${encodeURIComponent(habitationId)}/recommendation`),
    getHabitation(habitationId),
    getEligibleDestinations(habitationId).catch(() => [] as Destination[]),
  ]);
  let relocation: WireRelocationPriority | null = null;
  try {
    relocation = await getJson<WireRelocationPriority>(`/habitations/${encodeURIComponent(habitationId)}/relocation`);
  } catch {
    /* 503 tolerated — priority shown from risk level instead */
  }
  return adaptRecommendation(wire, habitation, destinations, relocation);
}

export async function getRecommendationById(recId: string): Promise<Recommendation> {
  if (USE_MOCK_DATA) {
    const normalized = recId.replace(/^REC-/i, "");
    const found = mockRecommendations.find((item) => item.id === recId || item.habitationId === mockWireId(normalized));
    if (!found) throw new ApiError("not-found", 404, "Recommendation not found.");
    return found;
  }
  // Live contract exposes recommendations per habitation. Route ids may be
  // recommendation-style ("REC-1") or bare habitation ids ("1") — normalize
  // to the numeric habitation id before hitting the wire.
  const numeric = Number(recId.replace(/^REC-/i, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError("not-found", 404, "Recommendation not found.");
  }
  return getRecommendationFor(String(numeric));
}

export async function getRecommendations(): Promise<Recommendation[]> {
  if (USE_MOCK_DATA) return mockRecommendations;
  // Live mode: the queue endpoint returns the newest recommendation per
  // habitation with decided-status, so decided villages drop off the queue
  // (persisted across sessions — not just a session-local filter).
  const queue = await getJson<WireRecommendationQueueEntry[]>("/recommendations?limit=100&include_decided=false");
  return queue.map((entry) => ({
    id: String(entry.recommendation_id),
    wireId: entry.recommendation_id,
    habitationWireId: entry.habitation_id ?? 0,
    habitationId: entry.habitation_id !== null ? String(entry.habitation_id) : "",
    summary: entry.summary ?? "",
    recommendationType: entry.recommendation_type,
    destinationWireId: entry.destination_id,
    destinationId: entry.destination_id !== null ? String(entry.destination_id) : null,
    capacityStatus: entry.capacity_status === "SUFFICIENT" ? "SUFFICIENT" : "INSUFFICIENT",
    confidence: null,
    priority: labelToPriority(entry.priority_label),
    riskScore: entry.risk_score,
    riskLevel: entry.risk_level as RiskLevel | null,
    reasons: [],
    whyNot: [],
    alternativeDestinationId: null,
    alternativeReason: null,
    createdAt: null,
    dataOrigin: entry.data_origin,
  }));
}

/* ============================================================
   INTELLIGENCE ENDPOINTS — hazard status, response time, transport,
   alerts, full assess pipeline (backend/routes/intelligence.py)
   ============================================================ */

export async function getHazardStatuses(habitationId: string): Promise<WireHazardStatus[]> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Hazard status engine requires the LIVE API.");
  return getJson<WireHazardStatus[]>(`/habitations/${encodeURIComponent(habitationId)}/hazards`);
}

export async function getResponseTime(habitationId: string): Promise<WireResponseTime> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Response-time engine requires the LIVE API.");
  return getJson<WireResponseTime>(`/habitations/${encodeURIComponent(habitationId)}/response-time`);
}

export async function getTransportPlan(habitationId: string): Promise<WireTransportPlan> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Transport engine requires the LIVE API.");
  return getJson<WireTransportPlan>(`/habitations/${encodeURIComponent(habitationId)}/transport`);
}

export async function getDecisionAlerts(habitationId: string): Promise<WireAlertsResponse> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Alert engine requires the LIVE API.");
  return getJson<WireAlertsResponse>(`/habitations/${encodeURIComponent(habitationId)}/alerts`);
}

/** Runs the full decision chain server-side: hazard -> risk -> priority ->
 *  capacity -> transport -> response time -> alert. */
export async function assessHabitation(habitationId: string): Promise<WireAssessResult> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Full assessment requires the LIVE API.");
  let response: Response;
  try {
    response = await fetch(`${API_V1}/habitations/${encodeURIComponent(habitationId)}/assess`, {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", 0, "Unable to reach the AVASYA API service.");
  }
  return parseResponse<WireAssessResult>(response);
}

/** Validates LLM operational claims against AVASYA structured data. */
export async function validateClaims(
  habitationId: string,
  claims: Array<{ field: string; value: unknown }> = [],
  question = "Validate these claims",
): Promise<WireClaimValidationReport> {
  if (USE_MOCK_DATA) throw new ApiError("unavailable", 503, "Claim validation requires the LIVE API.");
  let response: Response;
  try {
    response = await fetch(`${API_V1}/habitations/${encodeURIComponent(habitationId)}/claims/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, avasya_context: {}, claims }),
    });
  } catch {
    throw new ApiError("network", 0, "Unable to reach the AVASYA API service.");
  }
  return parseResponse<WireClaimValidationReport>(response);
}

export async function approveRecommendation(
  recommendationWireId: number,
  payload: { action: "approve" | "override"; destinationId: string; reason?: string; note?: string },
): Promise<WireApprovalRecord> {
  // M's contract carries a single override_note; the UI's optional notes field
  // is appended so officer context is never silently dropped.
  const overrideNote =
    payload.action === "override"
      ? [payload.reason?.trim(), payload.note?.trim()].filter(Boolean).join(" — ") || null
      : null;
  const body: WireApprovalRequest = {
    action: payload.action === "approve" ? "APPROVE" : "OVERRIDE",
    final_destination_id: Number(payload.destinationId),
    override_note: overrideNote,
  };
  if (USE_MOCK_DATA) {
    return {
      id: 1,
      recommendation_id: recommendationWireId,
      officer_user_id: 1,
      action: body.action,
      original_recommendation: null,
      final_destination_id: body.final_destination_id,
      override_note: overrideNote,
      data_origin: "SYNTHETIC_DEMO" as DataOrigin,
      created_at: new Date().toISOString(),
    };
  }
  let response: Response;
  try {
    response = await fetch(`${API_V1}/recommendations/${recommendationWireId}/approval`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", 0, "Unable to reach the decision service.");
  }
  return parseResponse<WireApprovalRecord>(response);
}

/**
 * GET /recommendations/approvals — persisted officer decision history.
 * Returns database records (past sessions included), newest first. In MOCK
 * mode the session log alone is authoritative, so this resolves to an empty
 * list rather than fabricating history.
 */
export async function getApprovalHistory(limit = 50): Promise<WireApprovalHistoryEntry[]> {
  if (USE_MOCK_DATA) return [];
  return getJson<WireApprovalHistoryEntry[]>(`/recommendations/approvals?limit=${limit}`);
}
