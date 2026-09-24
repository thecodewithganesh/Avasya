# 00 — AVASYA Project Overview

**Hazard Intelligence & Relocation Decision Support** · SIH26191 · branch `integration/avasya-mvp`

## What AVASYA is

A decision-support system for district disaster-management officers: it identifies affected habitations, determines hazard status and risk, computes the available response window, checks safe transportation and destination capacity, and uses official disaster-management guidance through RAG-grounded LLM reasoning to produce an explainable, claim-validated emergency response. The officer approves or overrides — every action is audited.

**The system recommends. The officer decides. Nothing is fabricated.**

## Verified state (2026-09-17)

- **197/197 backend tests**, frontend TypeScript/ESLint clean, production build succeeds
- Full Docker stack live-verified: PostGIS+pgvector, FastAPI, Next.js, auto-indexed RAG corpus
- ONE-ID trace: one habitation id (`H001`) flows through every layer in a single tested flow

## The MVP scenario

🌊 Flood → RED habitation (1,240 people) → HIGH risk → IMMEDIATE → Shelter A rejected (insufficient usable capacity) → Shelter B eligible → 32-min route → RAG-grounded NDMA guidance → LLM explanation → claims VERIFIED → officer approval → audit.

## Documentation map

| Block | Docs |
|---|---|
| Product definition | 01 TRD · 02 PRD · 03 Architecture · 04 MVP Scope |
| Data | 05 Sources · 06 Dictionary · 07 Pipeline · 08 Provenance |
| GIS & Hazard | 09 GIS Methodology · 10 Hazard Status · 11 Historical/Current/Prediction |
| Decision engines | 12 Risk & Relocation · 13 Response Time & Alerts · 14 Transport · 15 Capacity |
| AI | 16 RAG · 17 LLM · 18 LLM↔RAG · 19 Claim Validation |
| Platform | 20 API Spec · 21 DB Schema · 22 Frontend · 23 Security |
| Quality & Ops | 24 Testing · 25 E2E Demo · 26 Deployment · 27 Team Workflow · 28 Integration Status |
| Honesty & Future | 29 Limitations · 30 Future Scaling |

Reference guides: `TECHNICAL_IMPLEMENTATION.md`, `INTEGRATIONS.md`, `RAG_INTEGRATION.md`, `LLM_INTEGRATION.md`, audits, `VSCODE_SETUP.md`.

## The one rule that runs through everything

`DATA_UNAVAILABLE ≠ NO_ALERT` — and an unavailable value is labelled, never guessed. Population, hazard status, capacity, travel time, official warnings, dataset sources: never faked.
