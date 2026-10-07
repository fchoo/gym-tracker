# Phase 13: Multi-Plan & Running Foundation - Discussion Log

> Audit trail only. Decisions are captured in CONTEXT.md.

**Date:** 2026-10-06
**Mode:** `--auto`; settled answers came from the owner brief, reviewed prototype, shipped contracts, and live schema.

| Area | Options considered | Selected |
|---|---|---|
| Plan authority | UI-only concurrency; real sport-aware migration | Real migration |
| Running structure | One generic blob; typed session revisions and ordered slots | Typed stable sessions; same-day slots allowed |
| Import relation | Convert to workout; independent aggregate plus confirmed match | Independent aggregate |
| Portability | Additive SQL only; versioned graph and trigger migration | Complete versioned graph |
| Legacy timing | Delete facts; retain playback; retire playback while preserving facts/rest | Approved TIM-01 retirement; automatic record gate |

**Resolved 2026-10-07:** MAP-01 is approved as exactly zero or one active plan per sport; execution validates the owner record automatically.
**Phase boundary:** Phase 13 creates `GarminSourceEnvelope` and durable import commands; Phase 18 supplies bundled Garmin JSON transport.
