# 12 — Risk & Relocation Logic

**Engines: `ai/risk/`, `ai/priority/` · 34 engine tests · verified in ONE-ID trace**

## Risk engine

```
hazard severity (status engine)  ×  exposure (population, vulnerability)
   → risk_score 0–100
   → band: HIGH / MEDIUM / LOW
```

Verified example (the canonical executable demo, reproducible with `PYTHONPATH=. python ai/pipeline.py` — values produced by `ai/risk/risk_engine.py` against `data/habitation_evidence.json`): Flood exposed → H001 Krishnapuram Village, population 1,240 → **risk 55.3 / HIGH**.

> Historical note: an earlier mentor walkthrough used "risk 87" with abstract Shelter A/B numbers; that case is not the current demo fixture set. The canonical numbers below are the ones the executable pipeline actually emits.

## Relocation priority

Risk band + response-window urgency class → `IMMEDIATE / SHORT_TERM / MEDIUM_TERM / MONITOR`.

Example: risk HIGH + 2h 35m window → **IMMEDIATE**.

## The trace we can walk a judge through
```
H001 Krishnapuram Village → hazard: flood → status: RED
     → population 1,240 → risk 55.3 (HIGH)
     → priority: IMMEDIATE (population_exposed 1,240 ≥ 500 escalation rule)
     → destinations (Thanjavur demo set):
         RC02 Relief Center Central (usable 1,008 < 1,240 required) → REJECTED
         RC03 Relief Center East   (usable 630 < 1,240 required)   → REJECTED
         RC01 Relief Center North  (usable 1,512 ≥ 1,240)          → ELIGIBLE → RECOMMENDED
     → route via transport (only from ELIGIBLE set)
     → RAG evidence → LLM explanation → claims VERIFIED
     → officer approval → audit row written
```

Every arrow above is an assertion in `tests/test_one_id_trace.py` — if any layer decouples, the suite fails, not the demo.
