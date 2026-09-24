# 29 — Limitations (Honest Sheet)

**What AVASYA does not do — stated before a judge asks.**

## Hard limitations (by design, MVP)

| Area | Limitation | Where it's shown honestly |
|---|---|---|
| Prediction | No own-model forecasting; only officially published short-horizon forecasts, shown with source + horizon | `11_HISTORICAL_CURRENT_PREDICTION.md` |
| Lightning | Cannot be predicted by us; official nowcasting/warnings only | UI copy + `29` here |
| Geography | South India coastal demo belt only; not nationwide | map scope note + `30` |
| Data | Demo-belt datasets are `SYNTHETIC_DEMO`-labelled; real ingestion targets listed | `05_DATA_SOURCES.md`, map labels |
| Embeddings | Default zero-vector stub → ranking neutral until `EMBEDDING_PROVIDER=huggingface` | `INTEGRATIONS.md` |
| LLM | No custom-trained model; Qwen3-8B with grounded prompting; off-switch is a feature | `17_LLM_ARCHITECTURE.md` |
| Auth | Demo header accepts any well-formed email; no rate limiting / token rotation | `23_SECURITY_AND_ACCESS.md` |
| Transport | No fleet/VRP optimization; single-origin routing only | `14_TRANSPORT_AND_OPTIMIZATION.md` |
| Alert timing | No universal "N hours before" — computed response windows from official timing | `13_RESPONSE_TIME_AND_ALERT_GUIDELINES.md` |

## What we deliberately refuse to fake

population · hazard status · capacity · travel time · official warnings · dataset source · prediction accuracy · government endorsement.

Unavailable → `DATA_UNAVAILABLE`. Demo data → `SYNTHETIC_DEMO`. Both are visible in the UI, always. A fabricated-looking map is the one thing AVASYA will not produce.

## Why the limits are the right call

Every limit above is a *deferral with a plan* (`30_FUTURE_SCALING_PLAN.md`), not an unknown. Judges reward honest boundaries plus a credible scale path far more than inflated claims that collapse under one question.
