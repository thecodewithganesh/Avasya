/** Null-safe display formatters — live data frequently has nullable numerics. */

export function fmtNum(value: number | null | undefined, fallback = "—"): string {
  return value === null || value === undefined ? fallback : value.toLocaleString("en-IN");
}

export function fmtText(value: string | null | undefined, fallback = "—"): string {
  return value && value.length > 0 ? value : fallback;
}

export function fmtScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}`;
}

export function fmtCoords(coords: [number, number] | null): string | null {
  if (!coords) return null;
  return `${coords[0].toFixed(2)}°N ${coords[1].toFixed(2)}°E`;
}

/**
 * Pull the operational code ("D04", "H001") out of a seeded name like
 * "D04 · Synthetic Eligible Shelter". Live records carry no code field yet,
 * so names are the only carrier — falls back to the id when absent.
 */
export function entityCode(name: string | null | undefined, fallbackId: string): string {
  const match = name?.match(/\b([HD]\d{2,})\b/);
  return match?.[1] ?? fallbackId;
}

/** Name without the embedded code prefix — pairs with entityCode for lockups. */
export function entityName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/^\s*[HD]\d{2,}\s*·\s*/, "").trim() || name;
}

/** Canonical single-line label: "D04 · Synthetic Eligible Shelter" (no duplicate code). */
export function entityLabel(name: string | null | undefined, fallbackId: string): string {
  if (!name) return fallbackId;
  return entityCode(name, fallbackId) === name ? `${fallbackId} · ${name}` : entityName(name) === name ? `${entityCode(name, fallbackId)} · ${name}` : name;
}
