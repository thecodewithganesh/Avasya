import type { CapacityCheck, Destination, Habitation, Priority, Recommendation, RiskAssessment, RiskLevel } from "@/types/api";

/**
 * Local SYNTHETIC_DEMO dataset — South Indian coastal & hazard-prone habitations.
 *
 * Covers Karnataka (KA), Kerala (KL), Tamil Nadu (TN), Andhra Pradesh (AP),
 * and Puducherry (PY) as per the SIH26191 project scope.
 *
 * Every record is labelled SYNTHETIC_DEMO — the UI always shows provenance
 * honestly. Coordinates are real geographic points; risk scores and populations
 * are synthetic for demonstration.
 */

export const USE_MOCK_DATA = true;

const ORIGIN = "SYNTHETIC_DEMO" as const;

interface SeedRow {
  id: number;
  name: string;
  village: string;
  district: string;
  state: string;
  population: number;
  households: number;
  lat: number;
  lon: number;
  score: number;
  level: RiskLevel;
  hazardType: string;
}

/** 20 South Indian habitations across KA, KL, TN, AP, and Puducherry */
const seeds: SeedRow[] = [
  // ── KARNATAKA ──
  { id: 1,  name: "H001 · Ullal Fishermen Colony",   village: "Ullal",          district: "Dakshina Kannada", state: "Karnataka",      population: 1340, households: 335, lat: 12.80, lon: 74.86, score: 91, level: "HIGH",   hazardType: "Coastal flood" },
  { id: 2,  name: "H002 · Hoige Bazar Ward",          village: "Hoige Bazar",    district: "Dakshina Kannada", state: "Karnataka",      population: 870,  households: 218, lat: 12.87, lon: 74.85, score: 83, level: "HIGH",   hazardType: "Cyclone surge" },
  { id: 3,  name: "H003 · Talakalale Habitation",     village: "Talakalale",     district: "Kodagu",           state: "Karnataka",      population: 620,  households: 155, lat: 12.42, lon: 75.73, score: 74, level: "HIGH",   hazardType: "Landslide" },
  { id: 4,  name: "H004 · Sindhanur Settlement",      village: "Sindhanur",      district: "Raichur",          state: "Karnataka",      population: 1120, households: 280, lat: 15.77, lon: 76.76, score: 58, level: "MEDIUM", hazardType: "Drought flash flood" },
  // ── KERALA ──
  { id: 5,  name: "H005 · Mundakkai Ridge Colony",    village: "Mundakkai",      district: "Wayanad",          state: "Kerala",         population: 490,  households: 123, lat: 11.84, lon: 76.04, score: 95, level: "HIGH",   hazardType: "Landslide" },
  { id: 6,  name: "H006 · Chooralmala Hamlet",        village: "Chooralmala",    district: "Wayanad",          state: "Kerala",         population: 380,  households: 95,  lat: 11.87, lon: 76.06, score: 89, level: "HIGH",   hazardType: "Landslide" },
  { id: 7,  name: "H007 · Alappuzha Backwater Tola",  village: "Punnamada",      district: "Alappuzha",        state: "Kerala",         population: 1680, households: 420, lat: 9.50,  lon: 76.34, score: 78, level: "HIGH",   hazardType: "Coastal flood" },
  { id: 8,  name: "H008 · Edathua Low-lying Area",    village: "Edathua",        district: "Alappuzha",        state: "Kerala",         population: 940,  households: 235, lat: 9.35,  lon: 76.39, score: 65, level: "MEDIUM", hazardType: "River flood" },
  // ── TAMIL NADU ──
  { id: 9,  name: "H009 · Ennore Slum Cluster",       village: "Ennore",         district: "Chennai",          state: "Tamil Nadu",     population: 2340, households: 585, lat: 13.22, lon: 80.32, score: 86, level: "HIGH",   hazardType: "Urban flood" },
  { id: 10, name: "H010 · Pattinapakkam Fisherfolk",  village: "Pattinapakkam",  district: "Chennai",          state: "Tamil Nadu",     population: 1450, households: 363, lat: 13.00, lon: 80.27, score: 82, level: "HIGH",   hazardType: "Cyclone surge" },
  { id: 11, name: "H011 · Cuddalore Old Town",        village: "Cuddalore",      district: "Cuddalore",        state: "Tamil Nadu",     population: 1890, households: 473, lat: 11.75, lon: 79.77, score: 79, level: "HIGH",   hazardType: "Cyclone surge" },
  { id: 12, name: "H012 · Velankanni Coastal Ward",   village: "Velankanni",     district: "Nagapattinam",     state: "Tamil Nadu",     population: 760,  households: 190, lat: 10.68, lon: 79.84, score: 72, level: "HIGH",   hazardType: "Coastal flood" },
  { id: 13, name: "H013 · Ramnad Flood Plain",        village: "Ramnad",         district: "Ramanathapuram",   state: "Tamil Nadu",     population: 1020, households: 255, lat: 9.37,  lon: 78.83, score: 61, level: "MEDIUM", hazardType: "River flood" },
  // ── ANDHRA PRADESH ──
  { id: 14, name: "H014 · Sakhinetipalli Delta",      village: "Sakhinetipalli", district: "West Godavari",    state: "Andhra Pradesh", population: 1580, households: 395, lat: 16.76, lon: 81.67, score: 88, level: "HIGH",   hazardType: "River flood" },
  { id: 15, name: "H015 · Kakinada Port Habitation",  village: "Kakinada",       district: "East Godavari",    state: "Andhra Pradesh", population: 2100, households: 525, lat: 16.94, lon: 82.23, score: 84, level: "HIGH",   hazardType: "Cyclone surge" },
  { id: 16, name: "H016 · Srikakulam Shore Colony",   village: "Srikakulam",     district: "Srikakulam",       state: "Andhra Pradesh", population: 1230, households: 308, lat: 18.30, lon: 83.90, score: 77, level: "HIGH",   hazardType: "Cyclone" },
  { id: 17, name: "H017 · Baruva Fisher Village",     village: "Baruva",         district: "Srikakulam",       state: "Andhra Pradesh", population: 670,  households: 168, lat: 18.69, lon: 84.38, score: 68, level: "MEDIUM", hazardType: "Coastal flood" },
  { id: 18, name: "H018 · Nellore Canal Tola",        village: "Nellore",        district: "Nellore",          state: "Andhra Pradesh", population: 910,  households: 228, lat: 14.44, lon: 79.98, score: 55, level: "MEDIUM", hazardType: "River flood" },
  // ── PUDUCHERRY ──
  { id: 19, name: "H019 · Solai Nagar Shore Area",    village: "Solai Nagar",    district: "Puducherry",       state: "Puducherry",     population: 880,  households: 220, lat: 11.91, lon: 79.83, score: 81, level: "HIGH",   hazardType: "Tidal surge + cyclone" },
  { id: 20, name: "H020 · Muthialpet Low Quarter",    village: "Muthialpet",     district: "Puducherry",       state: "Puducherry",     population: 1140, households: 285, lat: 11.93, lon: 79.83, score: 63, level: "MEDIUM", hazardType: "Urban flood" },
];

function priorityFor(level: RiskLevel, score: number): Priority {
  if (level === "HIGH") return score >= 85 ? "IMMEDIATE" : "SHORT-TERM";
  if (level === "MEDIUM") return score >= 60 ? "SHORT-TERM" : "MEDIUM-TERM";
  return "MEDIUM-TERM";
}

function factorsFor(seed: SeedRow) {
  return [
    { name: "Hazard exposure", contribution: seed.score >= 80 ? 28.7 : seed.score >= 60 ? 22.4 : 14.1, severity: seed.score >= 80 ? ("critical" as const) : ("elevated" as const), explanation: `${seed.hazardType} is the primary driver of assessed risk at this location.` },
    { name: "Population", contribution: 20, severity: "elevated" as const, explanation: `${seed.population.toLocaleString()} people may require coordinated support during evacuation.` },
    { name: "Vulnerability", contribution: 14.2, severity: "elevated" as const, explanation: "Household vulnerability and coastal proximity increase relocation complexity." },
    { name: "Historical disasters", contribution: 9.4, severity: "moderate" as const, explanation: "Recorded cyclone/flood events inform the assessment base rate." },
    { name: "Road accessibility", contribution: seed.score >= 80 ? 13.7 : 6.4, severity: seed.score >= 80 ? ("critical" as const) : ("moderate" as const), explanation: "Primary road access constrains emergency vehicle movement during surge events." },
  ];
}

const warnings = ["Some evidence is not available at habitation granularity; district-level data was used where habitation data was absent."];

export const mockHabitations: Habitation[] = seeds.map((seed) => ({
  id: String(seed.id),
  wireId: seed.id,
  name: seed.name,
  village: seed.village,
  district: seed.district,
  state: seed.state,
  population: seed.population,
  households: seed.households,
  dataOrigin: ORIGIN,
  riskScore: seed.score,
  riskLevel: seed.level,
  confidence: 0.84,
  warnings,
  dataQuality: "PARTIAL",
  priority: priorityFor(seed.level, seed.score),
  hazard: seed.hazardType,
  hazardSource: "AVASYA SYNTHETIC DEMO",
  coordinates: [seed.lat, seed.lon] as [number, number],
  factors: factorsFor(seed),
  summary: `${seed.village} (${seed.district}, ${seed.state}) is assessed at ${seed.score}/100 (${seed.level}) under the locked risk methodology. Primary hazard: ${seed.hazardType}. ${warnings[0]}`,
}));

export const mockRiskAssessments: Record<string, RiskAssessment> = Object.fromEntries(
  mockHabitations.map((h) => [
    h.id,
    {
      habitationId: h.id,
      score: h.riskScore ?? 0,
      level: h.riskLevel ?? "LOW",
      summary: h.summary ?? "",
      factors: h.factors ?? [],
      warnings,
      dataQuality: "PARTIAL",
      confidence: 0.84,
      dataOrigin: ORIGIN,
      generatedAt: "2026-09-17T00:00:00Z",
    } satisfies RiskAssessment,
  ]),
);

/** South Indian relocation destinations — 3 eligible, 1 insufficient */
export const mockDestinations: Destination[] = [
  {
    id: "1",
    wireId: 1,
    name: "D01 · Mangaluru Relief Camp",
    dataOrigin: ORIGIN,
    status: "AVAILABLE",
    eligible: true,
    nominalCapacity: 5000,
    currentOccupancy: 840,
    usableCapacity: 3200,
    requiredCapacity: 1340,
    capacityGap: 1860,
    waterConstraint: 200,
    sanitationConstraint: 200,
    safetyReserve: 300,
    hazardExposure: "Low",
    roadAccess: "Good",
    healthcareDistance: "2.1 km",
    water: "Good",
    sanitation: "Good",
    coordinates: [12.91, 74.86],
  },
  {
    id: "2",
    wireId: 2,
    name: "D02 · Kochi Flood Shelter",
    dataOrigin: ORIGIN,
    status: "AVAILABLE",
    eligible: true,
    nominalCapacity: 3800,
    currentOccupancy: 620,
    usableCapacity: 2600,
    requiredCapacity: 1680,
    capacityGap: 920,
    waterConstraint: 250,
    sanitationConstraint: 180,
    safetyReserve: 240,
    hazardExposure: "Low",
    roadAccess: "Good",
    healthcareDistance: "1.4 km",
    water: "Good",
    sanitation: "Good",
    coordinates: [10.08, 76.27],
  },
  {
    id: "3",
    wireId: 3,
    name: "D03 · Chennai Relief Hub",
    dataOrigin: ORIGIN,
    status: "AVAILABLE",
    eligible: true,
    nominalCapacity: 6500,
    currentOccupancy: 1100,
    usableCapacity: 4200,
    requiredCapacity: 2340,
    capacityGap: 1860,
    waterConstraint: 300,
    sanitationConstraint: 200,
    safetyReserve: 400,
    hazardExposure: "Low",
    roadAccess: "Good",
    healthcareDistance: "0.8 km",
    water: "Good",
    sanitation: "Good",
    coordinates: [13.08, 80.27],
  },
  {
    id: "4",
    wireId: 4,
    name: "D04 · Rajahmundry Cyclone Shelter",
    dataOrigin: ORIGIN,
    status: "FULL",
    eligible: false,
    nominalCapacity: 2800,
    currentOccupancy: 1100,
    usableCapacity: 1200,
    requiredCapacity: 1580,
    capacityGap: -380,
    waterConstraint: 400,
    sanitationConstraint: 300,
    safetyReserve: 200,
    hazardExposure: "Moderate",
    roadAccess: "Moderate",
    healthcareDistance: "4.5 km",
    water: "Moderate",
    sanitation: "Moderate",
    coordinates: [17.00, 81.78],
  },
];

export const mockCapacityChecks: Record<string, CapacityCheck> = Object.fromEntries(
  mockDestinations.map((d) => [
    d.id,
    {
      destinationId: d.id,
      nominalCapacity: d.nominalCapacity ?? 0,
      currentOccupancy: d.currentOccupancy ?? 0,
      waterConstraint: d.waterConstraint ?? 0,
      sanitationConstraint: d.sanitationConstraint ?? 0,
      reserves: d.safetyReserve ?? 0,
      usableCapacity: d.usableCapacity ?? 0,
      requiredCapacity: d.requiredCapacity ?? 0,
      capacityGap: d.capacityGap ?? 0,
      status: d.eligible ? ("SUFFICIENT" as const) : ("INSUFFICIENT" as const),
      eligibility: d.eligible,
      dataOrigin: ORIGIN,
    } satisfies CapacityCheck,
  ]),
);

export const mockRecommendations: Recommendation[] = mockHabitations
  .filter((h) => (h.riskScore ?? 0) >= 61)
  .map((h) => {
    // Route to the nearest state shelter
    const destId = h.state === "Karnataka" ? "1"
      : h.state === "Kerala" ? "2"
      : h.state === "Tamil Nadu" ? "3"
      : "3"; // AP / Puducherry → Chennai hub (D03)
    return {
      id: `REC-${h.id}`,
      wireId: Number(h.id),
      habitationWireId: h.wireId,
      habitationId: h.id,
      destinationWireId: Number(destId),
      destinationId: destId,
      summary: "RELOCATE",
      recommendationType: "RELOCATE",
      confidence: 0.83,
      priority: h.priority,
      capacityStatus: "SUFFICIENT" as const,
      reasons: [
        "Eligible destination passes the capacity gate",
        "Lower hazard exposure than the habitation site",
        "Road access supports emergency movement",
      ],
      whyNot: [
        { destination: "D04 · Rajahmundry Cyclone Shelter", reason: "Usable capacity (1,200) falls short of requirement (1,580) after constraints and reserve." },
      ],
      alternativeDestinationId: null,
      alternativeReason: null,
      dataOrigin: ORIGIN,
      createdAt: "2026-09-17T00:00:00Z",
    };
  });
