# AVASYA frontend

AVASYA is an officer-facing emergency disaster relocation decision-support dashboard. It surfaces risk, urgency, destination capacity, explainability, what-if alternatives, and the final officer decision without presenting the system as the decision-maker.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The demo opens at the officer sign-in screen; the demo credentials are prefilled and route to `/dashboard`.

## Environment

Copy `.env.example` to `.env.local` when connecting the backend:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_DATA=true
```

With no API URL, `lib/mock-data.ts` powers the complete demo experience. The mock contract is separate from `lib/api.ts`, so switching to backend data is localized.

## Routes

- `/login` and `/dashboard`
- `/hazard-map`
- `/habitations` and `/habitations/[id]`
- `/relocation-priority`
- `/destinations`, `/destinations/compare`, and `/destinations/[id]/capacity`
- `/recommendations`, `/recommendations/[id]`, and `/recommendations/[id]/decision`

## Project shape

- `app/` contains App Router route boundaries.
- `components/avasya-app.tsx` contains the shared command-center shell and demo views.
- `components/map/hazard-map.tsx` contains the client-only Leaflet GIS surface.
- `lib/mock-data.ts` contains typed, clearly marked demo data.
- `lib/api.ts` is the centralized API adapter.
- `types/api.ts` contains frontend/backend contract types.

## Checks

```bash
npm run lint
npm run build
npm start
```

Leaflet uses OpenStreetMap tiles in the demo. The risk markers and recommendation values are backend-shaped mock data; no risk calculations are performed in the browser. No secrets or API keys are required for the demo.
