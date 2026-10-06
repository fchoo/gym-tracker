# Phase 18: Garmin Import - Discussion Log

> Audit trail only. Decisions are captured in CONTEXT.md.

**Date:** 2026-10-06
**Mode:** `--auto`; public provider constraints and owner brief settle the safe boundary.

| Area | Options considered | Selected |
|---|---|---|
| Fallback | API-only; complete local FIT journey | Complete local FIT |
| Decoder | UI fixture; bounded byte validation behind port | Real parser/normalizer |
| Dedupe | Filename/date; external ID plus exact hash | Independent identities |
| Matching | Automatic; explicit stable candidate confirmation | Explicit confirmation |
| OAuth | Embed secret; confidential broker gate | Never embed; separate broker review |

**Unresolved external gate:** actual Garmin access/current partner contract.
**Deferred:** broker deployment, recording, unofficial scraping.
