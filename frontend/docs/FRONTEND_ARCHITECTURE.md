# AVASYA Frontend Architecture

## Overview

AVASYA is a disaster emergency response / relocation decision support system frontend built with Next.js 16, React 19, and Tailwind CSS 4.

## Core Principles

1. **"AVASYA recommends. The human decides."**
2. Evidence transparency — never fabricate data
3. Explainable recommendations
4. Human decision authority
5. Data honesty — SYNTHETIC_DEMO clearly labeled

## Tech Stack

- **Framework:** Next.js 16.3.5 (App Router)
- **UI Library:** React 19.2.8
- **Styling:** Tailwind CSS 4
- **Maps:** Leaflet + React-Leaflet
- **Icons:** Lucide React
- **Language:** TypeScript 5

## Directory Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Command Center
│   ├── destinations/       # Destination Intelligence
│   ├── habitations/        # Habitation Intelligence
│   ├── hazard-map/         # GIS Hazard Map
│   ├── recommendations/    # Decision Queue
│   ├── relocation-priority/ # Priority Queue
│   ├── settings/           # System Status
│   └── login/              # Officer Login
├── components/
│   ├── avasya-app.tsx      # Shell & routing
│   ├── brand/              # AVASYA logo & mark
│   ├── dashboard/          # Command Dashboard
│   ├── demo/               # SIH Demo Launchpad
│   ├── destinations/       # Destination pages
│   ├── habitations/        # Habitation pages
│   ├── layout/             # Page layout components
│   ├── map/                # Leaflet map components
│   ├── recommendations/    # Recommendation pages
│   ├── relocation/         # Priority page
│   ├── settings/           # Settings page
│   ├── theme/              # Theme toggle
│   └── ui/                 # Shared UI components
├── lib/
│   ├── api.ts              # API client (MOCK/LIVE)
│   ├── demo-mode.ts        # SIH demo mode
│   ├── format.ts           # Display formatters
│   └── mock-data.ts        # Synthetic demo data
├── types/
│   └── api.ts              # TypeScript types
└── docs/                   # Documentation
```

## Design System

### Color Tokens

- **Base:** Deep charcoal (#07111f)
- **Surface:** Dark blue-black (#101827)
- **Accent:** Cyan/Teal (#38bdf8)
- **Immediate:** Critical red (#ff4d4d)
- **Short-term:** Warning orange (#ff9f43)
- **Medium-term:** Attention amber (#f5c542)
- **Safe:** Operational green (#35c98b)
- **Insight:** AI purple (#8f7bff)

### Typography

- **Display:** Space Grotesk
- **Body:** Inter
- **Mono:** JetBrains Mono

### Components

- `panel` — Base container
- `glow-top` — Signature accent hairline
- `eyebrow` — Section micro-label
- `metric` — Monospace numerical value
- `hero-stat` — Oversized risk score
- `command-card` — Elevated information unit

## API Layer

### Dual-Mode Client

```typescript
// Mock mode (default)
NEXT_PUBLIC_USE_MOCK_DATA=true

// Live mode
NEXT_PUBLIC_USE_MOCK_DATA=false
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Endpoints

- `GET /api/v1/habitations` — List habitations
- `GET /api/v1/habitations/:id` — Get habitation
- `GET /api/v1/habitations/:id/risk` — Get risk assessment
- `GET /api/v1/habitations/:id/recommendation` — Get recommendation
- `GET /api/v1/destinations` — List destinations
- `GET /api/v1/destinations/:id/capacity` — Get capacity
- `POST /api/v1/recommendations/:id/approval` — Record decision

## Routing

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Officer sign-in |
| `/dashboard` | Command Center | Situation overview |
| `/hazard-map` | Hazard Map | GIS intelligence |
| `/habitations` | Habitations | Field intelligence |
| `/habitations/:id` | Habitation Detail | Case dossier |
| `/relocation-priority` | Priority | Urgency queue |
| `/destinations` | Destinations | Destination intelligence |
| `/destinations/:id/capacity` | Capacity | Capacity check |
| `/destinations/compare` | Compare | Destination comparison |
| `/recommendations` | Recommendations | Decision queue |
| `/recommendations/:id` | Recommendation | Recommendation details |
| `/recommendations/:id/decision` | Officer Decision | Decision center |
| `/demo` | SIH Demo | Presentation mode |
| `/settings` | Settings | System status |

## Mock Data

All demo data is consistent:
- **H001 · Ullal Fishermen Colony** — Risk 91/100, HIGH, IMMEDIATE, 1,340 people
- **D01 · Mangaluru Relief Camp** — Sufficient capacity
- **D02 · Synthetic Insufficient Shelter** — Full, ineligible

## Data Provenance

- `SYNTHETIC_DEMO` — All current data
- `REAL` — Live backend data
- `MIXED` — Combination
- `UNAVAILABLE` — No data

## Accessibility

- Semantic HTML
- Keyboard navigation
- Visible focus states
- ARIA labels
- Color contrast compliance
- Screen reader support

## Responsive Design

- Desktop (1440px+)
- Laptop (1280px)
- Tablet (1024px, 768px)
- Mobile (390px, 360px)

## Theming

- Dark mode (primary)
- Light mode (government/reporting)
- Persisted to localStorage
- System preference detection

## Build & Deploy

```bash
# Development
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

## Key Components

### RiskScore
Compact and full risk visualization with semantic colors.

### PriorityBadge
IMMEDIATE, SHORT-TERM, MEDIUM-TERM badges.

### DataProvenanceBadge
SYNTHETIC_DEMO, REAL, MIXED, UNAVAILABLE indicators.

### EvidenceStatus
Available, Partial, Unavailable evidence indicators.

### GISDataQualityPanel
Evidence coverage and data quality visualization.

### SpatialEvidencePanel
Habitation evidence with provenance and granularity.
