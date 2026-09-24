# 11 — Historical / Current / Prediction

**These three are separated by design — collapsing them is how hazard maps start lying.**

## Historical layer

- Past events, past inundation extents, cyclone tracks, historical hazard records (EM-DAT / state records).
- Ingested with `data_origin` + event dates; rendered as a distinct map layer.
- Role: *why we worry about this habitation* (return period context) — never used alone for a current alert.

## Current layer

- Current observations, published warnings, current hazard zones, infrastructure/accessibility.
- Feeds the status engine directly → RED/YELLOW/NO_ALERT/DATA_UNAVAILABLE.
- Role: *what is happening now* — the only layer allowed to drive an active status.

## Prediction (short-horizon only)

- **Only where technically defensible**: official forecast/warning products (e.g. IMD bulletins) are shown with **source + horizon + issued-time**, clearly framed as *published forecast*, not AVASYA's own model.
- **Never claimed:** "AVASYA predicts lightning 5 hours in advance." Lightning nowcasting from our own model is explicitly out of scope (`29_LIMITATIONS.md`).

## Response window (the defensible version of "5 hours before")

The system **computes** the window, it never hardcodes one:

```
alert issued/detected ──┐
expected onset/impact ──┤→ response window = onset − now (from official timing)
travel time ────────────┤
destination readiness ──┘
        ↓
IMMEDIATE / SHORT_TERM / MEDIUM_TERM / MONITOR
```

Example (live-verified engine): current 10:00, expected onset 15:00 → **`RESPONSE WINDOW: 5 HOURS — begin relocation preparation`**. A 45-min window → **IMMEDIATE — evacuate now**. `ResponseTimeService` outputs the urgency class; the UI shows the raw window + the class + the recommended action.
