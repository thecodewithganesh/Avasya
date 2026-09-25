# 15 — Destination Capacity

**Engine: `ai/capacity/` + `ai/recommendation/` gate · verified in ONE-ID trace**

## The waterfall (frozen formula)

```
nominal_capacity
 − occupancy (current load)
 − constraints (sections offline / maintenance)
 − safety_reserve (headroom policy)
 = usable_capacity
```

## The eligibility gate

```
required = habitation.population (+ accessibility margin per policy)
eligible ⇔ usable_capacity ≥ required
```

Verified against the canonical executable demo (`PYTHONPATH=. python ai/pipeline.py`, Thanjavur fixture set): for H001 (1,240 required) — RC02 usable 1,008 < 1,240 → **REJECTED (INSUFFICIENT)**; RC03 usable 630 < 1,240 → **REJECTED (INSUFFICIENT)**; RC01 usable 1,512 ≥ 1,240 → **ELIGIBLE** (gap +272). The recommendation engine consumes *only* the eligible set — "Destination B looks nearby" is not a recommendation path.

## Honest states

| Case | Shown |
|---|---|
| Capacity fields missing | `DATA_UNAVAILABLE` — destination not silently assumed adequate |
| All destinations insufficient | "No eligible destination" + priority escalation, not a forced pick |
| Capacity from demo fixture | `SYNTHETIC_DEMO` label carried through |

## Where transport plugs in

`14_TRANSPORT_AND_OPTIMIZATION.md`: routing starts from the eligible set only; travel time returns to the suitability engine for final ranking.
