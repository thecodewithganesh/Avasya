/**
 * GIS map-layer API client. Talks to the backend /api/v1/gis endpoints only —
 * the browser never touches PostgreSQL. In MOCK mode the map simply renders
 * without zone layers (no fabricated GeoJSON).
 */

import { API_V1, SERVER_API_V1 } from "@/lib/api-base";

const API_BASE = typeof window === "undefined" ? SERVER_API_V1 : API_V1;

export interface HazardZoneFeature {
  type: "Feature";
  id: string;
  properties: {
    zone_id: string;
    hazard_id: number;
    hazard_type: string;
    band: "red" | "yellow" | "brown" | "green";
    band_color: string;
    severity_score: number | null;
    radius_m: number;
    coast_clamped: boolean;
    data_origin: string;
    provenance: string;
    source: string;
  };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export interface TrafficLocation {
  id: string;
  kind: "HABITATION" | "DESTINATION";
  name: string;
  coordinates: [number, number] | null;
  population?: number | null;
  band: "red" | "yellow";
  hazard_type: string;
  data_origin: string;
}

export interface HazardZoneCollection {
  type: "FeatureCollection";
  features: HazardZoneFeature[];
  traffic_locations: TrafficLocation[];
  methodology: string;
  data_origin: string;
  limitations: string[];
  coast_clamped_count: number;
  coast_available: boolean;
}

export interface GisAssessResult {
  habitation_id: string;
  hazard_id: string;
  hazard_type: string;
  status: string;
  reason_codes: string[];
  confidence: number | null;
  coast_clamped?: boolean;
  [key: string]: unknown;
}

export interface GisAssessPayload {
  results: GisAssessResult[];
  methodology: string;
  coast_clamping_applied: boolean;
}

export async function getHazardZones(): Promise<HazardZoneCollection> {
  const response = await fetch(`${API_BASE}/gis/hazard-zones`, { cache: "no-store" });
  if (!response.ok) throw new Error(`hazard-zones ${response.status}`);
  return response.json();
}

export async function getTrafficRisk(): Promise<{ traffic_locations: TrafficLocation[]; data_origin: string; limitations: string[] }> {
  const response = await fetch(`${API_BASE}/gis/traffic-risk`, { cache: "no-store" });
  if (!response.ok) throw new Error(`traffic-risk ${response.status}`);
  return response.json();
}

export async function getGisAssessment(habitationId: string): Promise<GisAssessPayload> {
  const response = await fetch(`${API_BASE}/gis/hazardapi/assess?habitation_id=${encodeURIComponent(habitationId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`gis-assess ${response.status}`);
  return response.json();
}
