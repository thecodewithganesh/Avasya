# 14 — Transport & Optimization

**Engine: teammate-authored `backend/transportation/` adapted via `backend/services/transport.py` · tests: `tests/test_transport.py` (18) · methodology detail: `TRANSPORT_OPTIMIZATION.md`**

## The integration rule that matters

**Transportation consumes decision-engine outputs.** It routes **only to capacity-eligible destinations** — the frontend never computes "nearest shelter" itself.

```
Habitation → population → required capacity
    ↓
capacity-eligible destination set (from ai/capacity gate)
    ↓
road network (data/raw/roads) → hazard-aware route evaluation
    ↓
route + distance + travel time → feeds suitability & recommendation
```

## Map semantics (what the officer sees)

- 🔴 hazard zone · 🏠 affected habitation · 🏫 destination
- ━━━ safe/usable route · ✕✕✕ blocked/high-risk segment
- Destination card shows usable capacity verdict: ❌ INSUFFICIENT / ✅ ELIGIBLE

## Hazard-aware routing

Blocked/high-risk segments are excluded before route search; a route through the flood zone is not a candidate. If no accessible route exists to an eligible destination, the recommendation honestly reports **no viable relocation** rather than relaxing the constraint.

## What's deferred (documented, not silent)

Multi-vehicle fleet optimization (VRP), convoy sequencing, real-time traffic feeds — `30_FUTURE_SCALING_PLAN.md` Phase 8.
