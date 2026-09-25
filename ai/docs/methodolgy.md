# AVASYA — AI/ML Decision Engine Methodology

**Owner:** Ganesh (P5) · **Module:** `ai/` · **SIH26191**

This document exists for one reason: if a judge asks *"how exactly did you
get that number?"*, the answer is in this file — not in someone's memory.
Every weight, threshold, and normalization rule below is implemented in
`ai/config/weights.py` and used by nothing else — no engine hardcodes a
number that isn't defined here first.

Every ratio below is a **team-chosen assumption for a single-district
synthetic demo (Thanjavur)**, not an official government or NDMA standard.
Say that plainly if asked. The point of AVASYA is that the *chain* is
transparent and auditable, not that the specific numbers are authoritative
yet — real ground-truth data would let the team validate and adjust them.

---

## 1. Risk Engine

Risk is a weighted sum of five normalized (0–100) factors.

| Factor | Weight | Why |
|---|---|---|
| Hazard exposure | **35%** | Single strongest driver of physical danger |
| Population | **20%** | More people affected = higher operational urgency |
| Vulnerability | **20%** | Elderly/disabled/low-income residents are harder to evacuate safely and recover slower |
| Historical events | **12%** | Proven repeat disaster history at this location |
| Road accessibility | **13%** | Poor roads directly slow down evacuation itself |

Weights sum to 1.0 exactly — this is asserted at import time in
`config/weights.py`, so a typo can never silently produce a score that
isn't out of 100.

**Normalization:**
- `hazard_exposure`, `vulnerability`, `road_accessibility` arrive already
  as 0.0–1.0 ratios from Priya's GIS pipeline — scaled ×100 directly.
- `population`: min-max scaled over **0–10,000**. Habitations larger than
  10,000 still score 100 (capped, not extrapolated).
- `historical_events`: min-max scaled over **0–10** events. 10+ past
  events still scores 100 (capped).

**Output:** `risk_score` (0–100), `risk_level` (LOW / MODERATE / HIGH /
CRITICAL), and a `risk_breakdown` where the five contributions sum exactly
to `risk_score` — this is what makes the score auditable rather than a
black box.

**What we explicitly avoid** (per the guide's "do not do this" list): no
ML model trained without labelled ground truth, no weights chosen just to
make a demo number look impressive, no changing weights mid-demo to force
a preferred answer.

---

## 2. Priority Engine

Converts `risk_score` into an urgency label using team-defined thresholds:

| Priority | Condition |
|---|---|
| **IMMEDIATE** | `risk_score >= 70` |
| **SHORT_TERM** | `40 <= risk_score < 70` |
| **MEDIUM_TERM** | `risk_score < 40` |

**Escalation rule:** even a MODERATE risk score is escalated to
**IMMEDIATE** if `population_exposed >= 500` people. This mirrors the
guide's own formula — *Risk + Vulnerability + Exposure + Urgency →
Priority* — rather than collapsing everything into one risk number and
ignoring raw exposed-population scale. (This is why H001 in our real demo
data scores only 37.8/100 MODERATE risk but still gets IMMEDIATE priority
— 620 people are directly exposed, above the 500-person threshold. This is
a deliberate rule, not a bug — good to have ready for judge Q&A.)

These thresholds are the team's own definition for the demo, explicitly
not an official standard, and are flagged for revisiting once real
historical outcome data exists to validate against.

---

## 3. Capacity Engine — Nominal → Usable Emergency Capacity

Follows the guide's exact waterfall: Nominal → minus existing occupancy →
minus water/sanitation/healthcare constraints → minus safety reserve →
Usable Emergency Capacity.

Our real `destinations.json` stores water/sanitation as booleans and
healthcare as a distance in km — not pre-computed deduction numbers — so
these are the documented rules used to turn those into deductions:

| Constraint | Condition | Deduction (of nominal capacity) |
|---|---|---|
| Water | Available | −3% (a small throughput buffer even when present) |
| Water | Not available | −15% |
| Sanitation | OK | −3% |
| Sanitation | Not OK | −12% |
| Healthcare | Nearest facility > 5.0 km | −5% |
| Safety reserve | Always applied | −10% |

**Reasoning:** a destination *with* water/sanitation still gets a small
deduction, because "available" doesn't mean unlimited throughput. A
destination *without* gets a much larger deduction reflecting severe (not
total) capacity reduction — we don't zero it out, since officers may still
stage limited/temporary use, but it ranks far below a fully-serviced site.

**Output:** `usable_capacity`, compared directly against
`population_requiring_relocation`. If usable capacity is below what's
needed, the destination is flagged `capacity_sufficient: false` — this is
a **hard gate**, never softened into a lower score. A destination that
cannot physically hold the affected population is never recommended, no
matter how well it scores on everything else. Nothing is ever silently
rounded up or assumed sufficient.

---

## 4. Suitability / Destination Ranking

Six weighted factors (all that our real data supports):

| Factor | Weight |
|---|---|
| Capacity adequacy | **30%** |
| Water | **15%** |
| Sanitation | **15%** |
| Healthcare access | **15%** |
| Road access | **15%** |
| Distance | **10%** |

Weights sum to 1.0, asserted at import time.

**Honest limitation:** the project guide's full suitability criteria list
also includes Electricity, Food, and destination-level Hazard Exposure.
These are **not scored**, because `data/destinations.json` does not
currently provide those fields. This is a documented data gap, raised with
Priya, not a silent omission — we do not invent values for missing
evidence. If those fields are added later, `SUITABILITY_WEIGHTS` and
`destination_scorer.py` need to be extended and re-normalized together.

"Safety" is not a standalone field in our data either — we treat capacity
adequacy + water + sanitation + healthcare access as the practical proxy
for a destination being safe to use, since a technically "safe" location
that can't provide water or capacity isn't safe to relocate people to in
practice.

**Normalization ranges:** healthcare-access score reaches 0 at **15 km**;
destination-distance score reaches 0 at **30 km** — beyond these, the
factor floors at 0 rather than going negative.

---

## 5. Recommendation Engine

Ranks all eligible destinations by suitability score, but **capacity
sufficiency gates first** — an insufficient destination is never
recommended even if it would otherwise score highest (see Section 3). If
literally nothing qualifies, the system says so explicitly
(`recommended_destination_id: null`) rather than picking the least-bad
option silently.

Produces, per the guide's exact explainable format:
- the recommended destination + a ✓ reasons list
- the next-best alternative + reasons
- the full ranked comparison table
- a `generated_at` timestamp for the audit trail (Recommendation → Risk →
  Factors → Evidence → Calculation → Timestamp)

**What-if simulation:** the same engine accepts an `exclude` list of
destination ids. Marking a destination "unavailable" and re-running
produces a live recalculation — not a scripted or hardcoded alternate
answer. Verified against real demo data: RC02 recommended → excluded →
RC01 correctly recalculated as the new pick.

---

## 6. Pipeline — Putting It Together

`ai/pipeline.py` is the single entry point (`run_decision`,
`run_what_if`) that calls the four engines above in sequence and returns
one `DecisionResult`. It contains **no scoring logic of its own** — every
number traces back to the sections above. `DecisionResult.to_contract_dict()`
produces the frozen P5→P3 JSON format the backend stores:

```json
{
  "habitation_id": "H001",
  "risk_score": 87,
  "risk_level": "HIGH",
  "priority": "IMMEDIATE",
  "reasons": ["..."],
  "recommended_destination": "D04",
  "capacity_sufficient": true
}
```

40/40 tests pass across risk, priority, capacity, suitability,
recommendation, and pipeline sequencing itself (`ai/test_pipeline.py`).

---

## 7. What We Deliberately Did Not Build

Per the guide's own advice — label honestly as "Planned" rather than
faking: destination-level hazard exposure scoring, Electricity/Food
suitability factors (no data source yet), ML-based risk prediction (no
labelled ground-truth data to train or validate against), and any
autonomous decision-making — AVASYA is decision *support*; the recorded
recommendation is always subject to human officer approval or override.