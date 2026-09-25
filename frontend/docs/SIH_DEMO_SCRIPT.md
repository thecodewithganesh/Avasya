# AVASYA SIH Demo Script

## 3-Minute Frontend Demo Path

### 00:00 - LOGIN
- **Page:** `/login`
- **Show:** AVASYA branding, officer sign-in panel
- **Key message:** "AVASYA — Disaster Emergency Response System. People First. Always."
- **Action:** Click "Sign in to command dashboard"

### 00:15 - COMMAND DASHBOARD
- **Page:** `/dashboard`
- **Show:** Current situation hero with H001, risk score 91/100, IMMEDIATE priority
- **Key message:** "The command center shows the most critical situation at a glance"
- **Highlight:** Risk score, population affected, recommended destination D01

### 00:35 - HAZARD MAP
- **Page:** `/hazard-map`
- **Show:** Interactive GIS map with habitation markers, risk distribution
- **Key message:** "Geospatial intelligence shows where the risk sits on the map"
- **Action:** Select H001 marker, show evidence panel

### 00:55 - HABITATION INTELLIGENCE
- **Page:** `/habitations/1`
- **Show:** H001 dossier with risk assessment, evidence, location
- **Key message:** "One case in depth — people, evidence, and risk"
- **Highlight:** Risk factors, evidence coverage, spatial granularity

### 01:15 - RISK + EVIDENCE
- **Show:** Risk score 91/100 HIGH, evidence breakdown
- **Key message:** "Risk is explainable with transparent evidence"
- **Highlight:** Known vs unknown evidence, data provenance (SYNTHETIC DEMO)

### 01:35 - RELOCATION PRIORITY
- **Page:** `/relocation-priority`
- **Show:** Prioritized queue with IMMEDIATE, SHORT-TERM, MEDIUM-TERM
- **Key message:** "Who moves first — urgency-ranked relocation order"
- **Highlight:** H001 at top with IMMEDIATE priority

### 01:55 - DESTINATION D01
- **Page:** `/destinations`
- **Show:** D01 with capacity visualization, eligibility status
- **Key message:** "Where they can go — capacity-gated destination intelligence"
- **Highlight:** Sufficient capacity, road access, healthcare distance

### 02:15 - CAPACITY
- **Page:** `/destinations/1/capacity`
- **Show:** Capacity breakdown, eligibility gate
- **Key message:** "Capacity verification shows D01 can accommodate H001's 1,340 people"
- **Highlight:** Nominal capacity 5,000, usable capacity 3,200

### 02:30 - RECOMMENDATION
- **Page:** `/recommendations/REC-1`
- **Show:** Decision path, recommendation reasons, alternatives reviewed
- **Key message:** "Why D01 — explainable recommendation with transparent reasons"
- **Highlight:** Why D01, why not D04, capacity gate passed

### 02:45 - WHY D01
- **Show:** Recommendation reasons, alternatives analysis
- **Key message:** "AVASYA explains why D01 is recommended and why alternatives were rejected"
- **Highlight:** Transparent reasoning, evidence-based decision

### 02:55 - OFFICER DECISION
- **Page:** `/recommendations/REC-1/decision`
- **Show:** Officer decision center, approve/override options
- **Key message:** "AVASYA recommends. The human decides."
- **Highlight:** Officer authority, decision audit trail

### Final Line
"AVASYA recommends. The human decides."

---

## Demo Data Consistency

All demo pages use consistent data (values from `frontend/lib/mock-data.ts`):
- **Habitation:** H001 · Ullal Fishermen Colony (Dakshina Kannada, Karnataka)
- **Risk Score:** 91/100
- **Risk Level:** HIGH
- **Priority:** IMMEDIATE
- **Population:** 1,340 people
- **Destination:** D01 · Mangaluru Relief Camp (usable 3,200 ≥ 1,340 required)
- **Rejected alternative:** D04 · Rajahmundry Cyclone Shelter (usable 1,200 < 1,580 required)
- **Capacity:** SUFFICIENT

---

## Key Presentation Points

1. **Evidence Transparency:** Show known vs unknown evidence
2. **Data Honesty:** SYNTHETIC DEMO badge, no fake real-time claims
3. **Human Authority:** "The human decides" principle
4. **GIS Intelligence:** Real map with real coordinates
5. **Explainable AI:** Transparent recommendation reasons
6. **Decision Audit:** Approval/override with audit trail

---

## Technical Notes

- Frontend runs in MOCK mode (no backend required)
- All data is SYNTHETIC_DEMO
- No fake AI claims or confidence scores
- Missing evidence shown as UNAVAILABLE
- Spatial granularity clearly labeled
