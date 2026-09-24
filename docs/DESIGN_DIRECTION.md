# AVASYA Design Direction

**Who this is for:** district disaster-management officers. The design must read like **government-grade emergency infrastructure**, not a SaaS startup landing page.

## The rule

Every visual choice is subordinate to legibility under stress. If a decoration competes with data, the decoration loses.

## Ban list (the AI-slop giveaway)

- ❌ Inter as the *only* typeface
- ❌ Blue→purple gradients (hero or anywhere)
- ❌ Glassmorphism / blur cards
- ❌ Three identical centered feature cards in a row
- ❌ Everything centered
- ❌ One border-radius everywhere
- ❌ Neon glows, pulsing logo animations
- ❌ Generic AI illustrations of "futuristic disaster response"
- ❌ Marketing copy ("Supercharge your disaster response with AI!")

## Instead (the AVASYA way)

| Dimension | Decision |
|---|---|
| **Type pairing** | Display/headlines: **Space Grotesk** (technical, engineered). Body/UI/data: **Inter** (operational legibility, tabular numerals via JetBrains Mono for readings). Two intentional fonts, clear jobs. |
| **Color** | Charcoal command surfaces (`#07111F` family) with a single **cyan-teal** accent family. Urgency colors (`immediate/short/medium/safe`) are reserved for operational states — never decoration. No blue/purple anywhere. |
| **Layout** | Strong left alignment. **Asymmetric hero**: giant type left, live operational telemetry right — the product *is* the hero. Dense where operational, quiet elsewhere. |
| **Radius discipline** | Tiles 4px, cards 6px, popovers 10px — radius varies by component purpose, never uniform. |
| **Hero visual** | **Real product proof**: live API-backed telemetry strip (DB rows, RAG chunks, LLM mode) + a real map screenshot. No AI-generated ocean art. |
| **Voice** | Calm, operational, specific. Status vocabulary from the engine (`DATA_UNAVAILABLE ≠ NO_ALERT`). Tagline: **PEOPLE FIRST. ALWAYS.** |

## Landing page contract (v2)

1. Asymmetric hero: "AVASYA INTELLIGENT" display type + tagline + primary CTA into the operations console.
2. A **live system strip** under the hero: real counts fetched from the running backend (habitations, hazard statuses, RAG corpus, LLM mode) — labeled with provenance. If the backend is down, the strip honestly says so. This is the anti-slop centerpiece: the landing page shows the *actual system*, not a promise of one.
3. Capabilities as a **specification table** (numbered rows, mono indices, left-aligned), not icon cards.
4. No glass, no glow, no pulse. Restraint is the brand.
