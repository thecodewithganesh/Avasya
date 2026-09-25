# 13 — Response Time & Alert Guidelines

**Engine: `backend/services/response_time.py` · tests: `tests/test_response_time.py`**

## What the engine answers

**"How much time do we have to act?"** — computed from evidence, never hardcoded.

```
hazard status + hazard timing/forecast (official)
+ population + destination readiness + route travel time
→ response window (onset − now, from official timing)
→ urgency class: IMMEDIATE / SHORT_TERM / MEDIUM_TERM / MONITOR
→ recommended action text
```

## Alert-timing rule (the honest version of "alert 5 hours before")

- We do **not** claim a universal "alert always N hours before".
- We show: alert issued/detected → expected onset → **available response window** → travel time.
- Example A: onset 15:00, now 10:00 → `RESPONSE WINDOW: 5 HOURS` → *begin relocation preparation*.
- Example B: onset 10:45, now 10:00 → `RESPONSE WINDOW: 45 MIN` → *immediate evacuation action*.

## UI block (frontend contract)

```
HAZARD             Flood
STATUS             🔴 RED
RESPONSE WINDOW    2h 35m
TRAVEL TIME        32m
RECOMMENDED ACTION Begin relocation toward eligible destination
```

## Guidelines

1. Window inputs come only from official timing/forecast fields — never from the LLM.
2. If timing evidence is missing → urgency falls back to MONITOR + `DATA_UNAVAILABLE` for the window (never an invented deadline).
3. Urgency class feeds relocation priority (`12_RISK_AND_RELOCATION_LOGIC.md`) and the CoPilot "Generate Emergency Response" flow.
4. All alert texts avoid government-endorsement language — recommendations, not orders.
