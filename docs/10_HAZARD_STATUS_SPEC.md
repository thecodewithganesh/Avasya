# 10 — Hazard Status Spec

**Engine: `backend/services/hazard_status.py` · tests: `tests/test_hazard_status.py`**

## The four states (frozen vocabulary)

| State | Meaning | What the officer sees |
|---|---|---|
| 🔴 `RED` | Critical/high hazard evidence active for the habitation | Red marker + alert styling |
| 🟡 `YELLOW` | Watch / moderate concern from available evidence | Yellow marker |
| 🟢 `NO_ALERT` | **No active alert detected from available data — this is NOT "safe"** | Green marker, no alert |
| ⚪ `DATA_UNAVAILABLE` | Insufficient evidence to determine a status | Grey marker + explicit badge |

**Judge-critical distinction: `DATA_UNAVAILABLE ≠ NO_ALERT`** — never rendered the same, never collapsed. A missing-data habitation is displayed as unknown, not green.

## Inputs → output

```
hazard evidence rows (with data_origin, published_date)
   + habitation exposure features (spatial join)
   → status engine (severity ordering, recency, provenance weighting)
   → RED | YELLOW | NO_ALERT | DATA_UNAVAILABLE
```

## Rules

1. Severity ordering: RED > YELLOW > NO_ALERT > DATA_UNAVAILABLE (a habitation in both a RED flood zone and a YELLOW cyclone watch is RED).
2. Evidence older than the documented staleness window feeds `DATA_UNAVAILABLE`, not stale alerts.
3. Status is **computed, never stored as truth**: recompute happens from evidence rows; the stored field is a cache, recomputed on ingest.
4. Status never depends on the LLM. The LLM may *explain* a status, never *produce* one.

## Map legend (frontend contract)

The frontend legend renders exactly these four states plus `SYNTHETIC_DEMO` labelling. If a new status value appears, the frontend must fail visibly, not guess a colour.
