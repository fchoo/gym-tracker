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
| Legacy timing | Delete; keep playback; retain facts and gate playback retirement | Retain facts; owner-review gate |

**Unresolved owner decision:** MAP-01 active-plan cardinality remains an execution checkpoint.
**Deferred:** Official Garmin transport and broker.
