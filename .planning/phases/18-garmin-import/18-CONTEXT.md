# Phase 18: Garmin Import - Context

**Gathered:** 2026-10-07
**Status:** Final planning decisions locked; implementation remains unauthorized
**Authority:** .planning/v1.2-OWNER-DECISIONS.md and .planning/v1.2-owner-decisions.json supersede the 2026-10-06 FIT/partner proposal.

<domain>
## Phase Boundary

Deliver a standalone Android Garmin Connect account client inside the installed app. Bundle Python 3.13 through Chaquopy 17.0 and python-garminconnect 0.3.17 at commit 218e72ca5459e014435fc2d94fd18bd601fa0c14 for Android ARM64. Fetch bounded activity summary, split, and detail JSON; normalize it into the shared imported-activity domain; keep matching a separate explicit owner action.

Phase 18 owns packaging, login/MFA/session lifecycle, bounded JSON retrieval, GarminSourceEnvelope construction, contextual Garmin UI, activity detail, sync orchestration, and native transport evidence. Phase 13 owns durable provider-independent import and match facts. Phase 17 owns stable Running opportunity identities. Phase 19 consumes accepted imported evidence.
</domain>

<decisions>
## Decisions

- **D-18-01:** The selected topology is one installed Android app with modules/garmin-connect, Python 3.13, Chaquopy 17.0, python-garminconnect 0.3.17 pinned to commit 218e72ca5459e014435fc2d94fd18bd601fa0c14, and ARM64-only packaging. The curl_cffi artifact is curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl with SHA-256 4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92.
- **D-18-02:** The exact TypeScript boundary is src/domains/activities/garminActivitySourcePort.ts exporting GarminActivitySourcePort, GarminConnectionState, and GarminSourceEnvelope. Phase 13 declares this shared interface-first contract so it compiles before Phase 18; Phase 18 implements and produces it at runtime. The native module is modules/garmin-connect; the platform implementation is src/platform/garmin/garminActivityAdapter.ts.
- **D-18-03:** Login and MFA are foreground typed operations. Persist only dependency-injected DI session tokens through Android Keystore-backed app-private encryption, outside logical backup and Drive. Passwords and MFA codes are never persisted. Restore, refresh, and token rotation are atomic and proven after process restart.
- **D-18-04:** The allowlisted Python calls are get_activities, get_activity, get_activity_splits, and get_activity_details with maxchart=2000 and maxpoly=4000. The bridge exposes no eval, arbitrary URL/method forwarding, upload, delete, on-device pip, or downloaded scripts.
- **D-18-05:** normalizeGarminActivity.ts and canonicalGarminPayload.ts construct a GarminSourceEnvelope with source_kind=garmin_connect_account, account_namespace, external_activity_id, normalization_version, normalized_json_sha256, raw_component_sha256, and sample_fidelity=sampled|source_laps|source_summary. fit_sha256 is absent because no original FIT exists.
- **D-18-06:** Elapsed, timer, and moving durations remain distinct. Missing channels remain absent. Source laps and eligible source summary facts may support exact claims; sampled or downsampled charts never support exact arbitrary-distance best efforts.
- **D-18-07:** Phase 18 passes GarminSourceEnvelope to the shared Phase 13 prepareGarminImport and confirmGarminImportDate commands. It does not create a provider-specific persistence model or bypass Phase 13 identity, capacity, receipt, portability, and transaction checks.
- **D-18-08:** Foreground sync is bounded, serialized, generation-fenced, and explicit about offline, login-needed, partial failure, 403, and 429 states. Logout increments the generation and clears encrypted tokens without deleting imported history; late results cannot write.
- **D-18-09:** Outdoor and treadmill detail renders only available source facts. Treadmill explicitly says No route. The accessible lap table uses Lap, Time, Pace. Average heart-rate label/value spacing is stable. Appearance is shared Light/Dark/System state.
- **D-18-10:** Matching binds one accepted payload revision to one stable Phase 17 Running occurrence only after Confirm. Candidate selection, Back, and Leave unmatched write nothing; stale, unmatch, and reassignment paths remain audited.
- **D-18-11:** The earliest native proof, immediately after the committed harness, must prove packaging, real login/MFA, one authenticated activity read, encrypted DI token restore/refresh after restart, and standalone operation. A technical proof failure is TECHNICAL_REVIEW_REQUIRED and never reopens the selected topology as a product question.
- **D-18-12:** Garmin Developer Program access, official partner API, OAuth broker, desktop/Drive bridge, manual FIT import, FIT decoder, runtime agents, development terminal, Metro/local sync server, on-device pip, and downloaded scripts are outside this milestone. Hermes requires no change. MIT notices are ordinary packaging work, not a licence checkpoint.

## Claude's Discretion

- Internal Kotlin/Python class names, exact bounded page size, and non-sensitive diagnostic codes, provided the public paths/symbols and locked behavior above remain exact.
- UI composition details not fixed by the Revision 18 oracle, provided the four-root shell, shared appearance/focus behavior, and source-truthfulness remain intact.
</decisions>

<canonical_refs>
## Canonical References

- .planning/v1.2-OWNER-DECISIONS.md
- .planning/research/v1.2/GARMIN-MOBILE-FEASIBILITY.md
- .planning/architecture/v1.2-garmin-import.md
- .planning/research/v1.2/STACK.md
- .planning/REQUIREMENTS.md GAR-01 through GAR-16
- .planning/verification/v1.2-native-verification-matrix.md
</canonical_refs>

<deferred>
## Deferred Ideas

- Official Garmin partner API, OAuth broker, desktop/Drive bridge, FIT decoding, manual FIT import, original-file retention, background scheduling, in-app run recording, Training API workout push, and protocol rewrites.
</deferred>

---
*Phase: 18-garmin-import*
*Context reconciled: 2026-10-07*
