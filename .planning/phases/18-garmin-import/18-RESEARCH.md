# Phase 18: Garmin Import - Research

**Researched:** 2026-10-06
**Domain:** Offline FIT ingestion, immutable activity evidence, SQLite idempotency/revision control, read-only activity detail, explicit Running-occurrence matching, and a gated Garmin provider surface
**Confidence:** MEDIUM overall — repository contracts are HIGH confidence; official public documentation is MEDIUM confidence under the configured seam; FIT decoder licensing and Hermes/Metro behavior remain unresolved gates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Source quotation boundary: [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:7-12,17-29]

DATA_Q7N4K2PX_START
Deliver a complete local original-FIT import journey, factual outdoor/treadmill
details, dedupe/revision handling, and explicit matching to Phase 17 opportunities.
Represent official Garmin consent/sync truthfully, but do not implement or deploy
a broker without separate owner/security review and actual program access.

### Local import
- **D18-01:** Manual original-file FIT import is independently usable offline. Reuse a bounded read-only file port; cancellation writes nothing.
- **D18-02:** Hash exact bytes before normalization. Validate header/length/CRC, bound bytes/messages/laps/samples/output, and reject unsupported/multisport/corrupt input without partial facts.
- **D18-03:** Use independent provider-subject/external-ID and exact-content-hash indexes. Changed source revisions stage review; fuzzy similarity never auto-merges.
- **D18-04:** Outdoor shows only available route/HR/elapsed/moving/distance/pace/laps. Treadmill explicitly says No route and retains factual totals. Lap table is Lap, Time, Pace.
- **D18-05:** Candidate selection binds exact stable Running session slot/revision. Confirm commits one match; cancel/back remains unmatched; unmatch/reassign is audited.

### Official connectivity gate
- **D18-06:** Garmin Activity API + OAuth2 PKCE is intended only after real program access and current partner documentation.
- **D18-07:** Public PKCE material requires a client secret; never embed it in Expo/APK/SecureStore. A confidential broker is a separately reviewed architecture/deployment decision, not implicitly authorized here.
- **D18-08:** Until the gate passes, native UI reports unavailable/approval-needed truthfully while local FIT remains fully usable. Mocks cannot close GAR-04–07.
DATA_Q7N4K2PX_END

### Claude's Discretion

Source quotation boundary: [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:31-32]

DATA_C6V9R3LM_START
- FIT decoder selection after license and Hermes/Metro validation; existing SVG is preferred for factual route outlines.
DATA_C6V9R3LM_END

### Deferred Ideas (OUT OF SCOPE)

Source quotation boundary: [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:69-72]

DATA_T4H8W1BZ_START
In-app recording, unofficial Connect scraping, Training API workout push, and broker deployment.
DATA_T4H8W1BZ_END
</user_constraints>

<phase_requirements>
## Phase Requirements

The requirement wording below is verbatim. [VERIFIED: .planning/REQUIREMENTS.md:155-172]

| ID | Description | Research Support |
|----|-------------|------------------|
| GAR-01 | Open Garmin contextually from Workout, Running plan or imported Calendar activity, preserving only the four app roots. | Route ownership, validated origin params, retained-stack rules, and exact file map |
| GAR-02 | Keep Garmin Sync on one line in a stable three-column header with appearance flush right and an inert back placeholder at Garmin's root. | Shared header reuse, component tests, native geometry evidence |
| GAR-03 | Show Garmin not connected with Connect Garmin and Import FIT fallback, making available operations truthful when API access is unavailable. | Capability gate and production-default state |
| GAR-04 | Implement consented authorization through an approved Garmin Activity API integration with OAuth2 PKCE and cancel/error/denied/expired/revoked recovery; do not ship simulated consent as real. | Explicit external-blocked row; deterministic UI states do not count as live closure |
| GAR-05 | Show connection/consented-access/last-sync facts, activity list and durable dedupe receipt status with Sync now, Import FIT and Revoke. | Durable local read model; live provider facts conditional |
| GAR-06 | Show busy Syncing Garmin activities, successful import/no-duplicates feedback, and Sync could not complete with Try again/Import FIT while previous facts remain. | State machine and post-commit acknowledgement pattern |
| GAR-07 | Revoke/disconnect activity access without deleting imported history; reflect the real provider result and permit later reconnection. | Connection-generation design; live provider result conditional |
| GAR-08 | Use a native original-file picker and actual FIT parsing/preview, supporting personal use without Garmin program approval. | Existing Expo File port seam, strict decoder adapter, Hermes gate |
| GAR-09 | Handle unsupported, malformed, oversized, truncated and duplicate files, cancelled selection and interrupted import without partial source facts or lost prior activities. | Bounds, strict integrity checks, operation marker, transaction/receipt recovery |
| GAR-10 | Show imported outdoor elapsed/moving time, distance/pace facts, optional route and spaced Average heart rate label/value when present. | Source-presence projection and SVG route rules |
| GAR-11 | Show No route for treadmill activity plus distance/time/pace/laps and available source facts; never invent a route. | Explicit subtype mapping independent from GPS |
| GAR-12 | Display Lap, Time and Pace columns from imported lap semantics with accessible row/column labels and honest missing values. | Session-to-lap association, missing-value and large-text contracts |
| GAR-13 | Open Match to scheduled workout, show candidate identities and select one candidate without completing anything yet. | Read-only candidate query and stable identity |
| GAR-14 | Persist exactly the selected candidate only on Confirm match; Leave unmatched/Back performs no match, and failed/stale confirmation preserves the activity. | Revision-checked command, immutable event, receipt replay |
| GAR-15 | Provide loading, missing activity, parse/projection error and retry states with correct Back behavior and no fabricated detail. | Read projection, retained last-good data, classified errors |
| GAR-16 | Use the same persisted Light/Dark/System appearance controls as App Settings, with synchronized selection and dismiss/focus restoration. | Existing shared AppearanceProvider/store and UI-SPEC state matrix |
</phase_requirements>

## Summary

Plan Phase 18 as an offline-first vertical slice over the Phase 13 imported-activity and Phase 17 stable Running-opportunity foundation: select one original FIT file through the existing read-only Expo File API pattern, read it under explicit resource bounds, hash the exact bytes, strictly validate and decode it behind a platform adapter, normalize one supported running session, resolve identity/revision outcomes, and commit all source facts plus an idempotency receipt in one serialized SQLite transaction. Detail and matching are read-only projections until a separately confirmed, revision-checked command commits. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:9-12,19-29] [VERIFIED: .planning/architecture/v1.2-garmin-import.md:117-128,147-159]

The existing stack is sufficient for file selection, exact-byte hashing, SQLite transactions, route SVG, validation, navigation, appearance, and tests. The only prospective dependency is `@garmin/fitsdk` [WARNING: flagged as suspicious — verify before using.]. Version 21.217.0 is the current official release, but the package-legitimacy seam returned `SUS` because the release is new, its FIT Protocol License is restrictive rather than MIT, and no authoritative source claims React Native Hermes/Metro compatibility. The planner must place a human license/legitimacy checkpoint and a native Hermes/Metro smoke before installation can become an implementation decision. [CITED: https://github.com/garmin/fit-javascript-sdk/releases/tag/21.217.0] [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/LICENSE.txt]

Official Garmin connectivity is not executable scope. Production should expose the approved `approval_needed` or `capability_unavailable` truth while keeping FIT import/history/matching operational. Deterministic consent/sync/revoke fixtures may test presentation, but GAR-04–GAR-07 remain `CONDITIONAL_EXTERNAL` until real program access, current partner contracts, and a separate broker/security authorization exist. No broker endpoint, secret storage, deployment, or provider network adapter should be added by this phase plan. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:28-42,211-240,647-682]

**Primary recommendation:** Build the domain/storage/file/import/detail/match slice in dependency order, with a Wave 0 decoder gate; ship the truthful provider-disabled UI separately from any future official integration. [VERIFIED: .planning/research/v1.2/STACK.md:78-84]

## Project Constraints (from .trae/rules/rules.md)

- Read and follow the root `AGENTS.md`; it routes architecture review to `gstack-plan-eng-review`, but this spawned researcher is restricted to producing this research artifact and must not start another planning/review workflow. [VERIFIED: .trae/rules/rules.md:1-4] [VERIFIED: AGENTS.md:1-18]
- Treat `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md`, `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md`, and the two approved image references named in the rule as source contracts. [VERIFIED: .trae/rules/rules.md:5-13]
- Keep SQLite source facts authoritative; keep notifications, projections, and recommendations replayable/rebuildable; acknowledge no set before its exclusive transaction commits; preserve bundled versus user-owned boundaries; and keep the workout critical path offline. [VERIFIED: .trae/rules/rules.md:15-22]
- Write tests with every behavior and give integrity-critical modules complete branch coverage. [VERIFIED: .trae/rules/rules.md:23]
- Use atomic commits with the required co-author trailer when implementation is later authorized. This research task explicitly forbids commits, so no commit is made here. [VERIFIED: .trae/rules/rules.md:24-26]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Native one-file selection and bounded byte read | React Native platform adapter | Android system picker | The current file port already keeps the URI private and opens `FileMode.ReadOnly`; Phase 18 adds a FIT-specific adapter, not a second permission model. [VERIFIED: src/platform/files/expoBackupFilePort.ts:58-120,172-194] |
| FIT integrity and decoding | React Native platform adapter | Pure activity domain | Third-party decoder details remain isolated; normalized domain facts must not depend on SDK message object shape. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:61-66] |
| Validation, subtype, time provenance, pace basis, identity outcome | Domain layer | Platform decoder | These are product/source semantics and remain deterministic and testable without React Native. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:117-145] |
| Activity, immutable payload revisions, laps, chunks, receipts | Database/storage | Domain commands | SQLite is authoritative; one exclusive transaction publishes a coherent aggregate. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:77-93,117-128] |
| Candidate ranking | Domain query/projection | Database/storage | Ranking assists only; it cannot mutate completion. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:147-159] |
| Match confirmation, unmatch, reassignment | Domain command | Database/storage | Stable identity and expected revisions are rechecked inside the writer transaction and recorded as immutable events. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:151-157] |
| Garmin routes, detail, status, accessibility | React Native client | Domain read models | Screens render exact states and issue commands; route/UI files must not import platform or SQL modules. [VERIFIED: scripts/check-boundaries.mjs:103-160] |
| Official Garmin authorization/sync/revoke | External provider plus separately reviewed broker | React Native capability port | This boundary is externally blocked and not authorized for implementation in Phase 18. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:26-29] |
| Backup/restore/merge and Drive dirty generation | Database/storage | Portability domain | Current portability is a versioned explicit allowlist; new source tables are not included automatically. [VERIFIED: src/domains/portability/backupContracts.ts:1-15,26-110] [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:27-58] |

## Planning Preconditions and Gates

1. Verify the Phase 13 imported-activity schema/commands and Phase 17 stable Running slot/revision identifiers exist before Phase 18 tasks begin. Phase 18 depends on both and must not recreate them in screen code. [VERIFIED: .planning/ROADMAP.md:178-196] [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:56-58]
2. Run `checkpoint:human-verify` for the candidate decoder's legitimacy and FIT Protocol License before installation or execution. The license limits use to internal business purposes, restricts distribution and benchmarking, and treats the SDK as confidential; whether this personal Android use and required performance qualification are permitted is a legal/owner decision, not an engineering inference. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/LICENSE.txt]
3. If license acceptance passes, pin exactly 21.217.0 and run an Android release-mode Hermes/Metro smoke before the adapter task. The smoke must prove root-package bundling, `TextDecoder`, BigInt `DataView` access, a known valid FIT decode, CRC rejection, no Node `Buffer` polyfill, and bounded peak time/memory on the maximum accepted fixture. No authoritative source currently proves this package/runtime combination. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0] [CITED: https://reactnative.dev/docs/0.86/hermes] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/expo/]
4. If either gate fails, stop decoder adoption and return for dependency selection. Do not silently fall through to a community package or hand-written FIT decoder. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:31-32]
5. Calibrate and lock the FIT resource-limit object from synthetic/public-license fixtures plus release-build device measurements before the parser can ship. The locked contract requires bounds for bytes, definitions/messages, sessions, laps, samples, normalized output, route projection, time, and peak memory, but intentionally does not authorize invented numeric limits. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:20-24] [VERIFIED: .planning/architecture/v1.2-garmin-import.md:120-126] [ASSUMED]
6. Keep GAR-04–GAR-07 marked externally blocked. The implementation may add the truthful disabled capability presentation and fixture-only state tests, but no live provider or broker task is executable without a later owner/security decision. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:32-40,681-682]

## Standard Stack

### Core

| Library / boundary | Version and publication | Purpose | Planning decision |
|--------------------|-------------------------|---------|-------------------|
| Expo | `~57.0.25`; exact package published 2026-09-24 | Application/native package baseline | Keep the repository version; do not couple Garmin import to an Expo upgrade. [VERIFIED: package.json:96] [CITED: https://www.npmjs.com/package/expo/v/57.0.25] |
| React Native / React | `0.86.3` / `19.2.3`; published 2026-08-24 / 2025-12-11 | Native UI and bundled Hermes runtime | Keep. Hermes is default/bundled for RN 0.86, but third-party decoder compatibility still needs native proof. [VERIFIED: package.json:113-115] [CITED: https://reactnative.dev/docs/0.86/hermes] |
| Expo Router | `~57.0.23`; published 2026-09-24 | Contextual Garmin stack under the four roots | Keep and add declared Garmin stack routes; do not add a fifth tab. [VERIFIED: package.json:106] [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:65-89] |
| `expo-file-system` | `~57.0.7`; published 2026-09-11 | Native picker and bounded read-only bytes | Reuse `File.pickFileAsync`, explicit `FileMode.ReadOnly`, and `readBytes`; do not add `expo-document-picker`. [VERIFIED: package.json:101] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/] |
| `expo-crypto` | `~57.0.3`; published 2026-09-11 | SHA-256 over exact selected bytes | Use `Crypto.digest(CryptoDigestAlgorithm.SHA256, bytes)`; do not hash a filename, URI, JSON normalization, or decoded values. [VERIFIED: package.json:100] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/crypto/] |
| `expo-sqlite` | `~57.0.3`; published 2026-09-11 | Authoritative source facts, immutable revisions, receipts, match events | Keep the repository's serialized `BEGIN IMMEDIATE` writer and prepared-statement repositories. [VERIFIED: package.json:109] [VERIFIED: src/platform/sqlite/serializedWriter.ts:6-85] |
| Zod | `4.4.3`; published 2026-05-04 | Validate the decoder DTO and persisted JSON boundaries | Keep validation in domain/adapters, never in JSX or SQL strings. [VERIFIED: package.json:123] |
| `react-native-svg` | `15.15.4`; published 2026-03-18 | Factual static route path | Keep; no map SDK or live location permission. [VERIFIED: package.json:121] [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:187-207] |

### Conditional Decoder

| Candidate | Version | Evidence | Decision |
|-----------|---------|----------|----------|
| `@garmin/fitsdk` [WARNING: flagged as suspicious — verify before using.] | `21.217.0`, published 2026-09-22 | Official Garmin repository/release and registry package; ESM, no runtime dependencies or postinstall; documented ArrayBuffer decoder and integrity API. The current release is flagged `SUS: too-new`; the license and Hermes/Metro gates are open. [CITED: https://github.com/garmin/fit-javascript-sdk/releases/tag/21.217.0] [CITED: https://www.npmjs.com/package/@garmin/fitsdk] | Preferred only after the two checkpoints above. Do not add it to `package.json` before those checkpoints pass. |

### Supporting

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| Jest | `29.7.0`, published 2023-09-12 | Unit, component, SQLite-host, and integration contracts | All deterministic parser/domain/storage behavior. [VERIFIED: package.json:129] [VERIFIED: jest.config.js:26-89] |
| React Native Testing Library | `14.0.1`, published 2026-06-23 | Route/screen semantics and state transitions | Exact role/name/state, focus intent, duplicate activation, Back/cancel; never claim native geometry from it. [VERIFIED: package.json:126] [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:15-27] |
| Existing shared appearance and UI primitives | Repository source | Header, actions, notices, skeletons, sheet/focus behavior | Reuse; do not create Garmin-local theme state or duplicate primitives. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:46-61,187-207] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gated official decoder | `fit-file-parser` [ASSUMED] [WARNING: flagged as suspicious — verify before using.] | Registry version 6.1.2 is MIT but the legitimacy seam also returns `SUS: too-new`, it depends on `buffer`, and no authoritative Hermes/Metro or Phase 18 semantic proof was found. Do not adopt automatically; it requires a new human/package/runtime/fixture gate. [CITED: https://www.npmjs.com/package/fit-file-parser] |
| Existing File API | `expo-document-picker` | Not installed and unnecessary because SDK 57 FileSystem already provides the native one-file picker used by the shipped restore path. [VERIFIED: .planning/research/v1.2/STACK.md:35-50] |
| Static SVG | Interactive map SDK | Adds network/key/native configuration without an approved interaction requirement and conflicts with the local factual route contract. [VERIFIED: .planning/research/v1.2/STACK.md:10-12,47-50] |
| Original `.fit` only | ZIP/archive parser | Out of contract; archive support needs separate expansion, entry-count, traversal, cleanup, and memory bounds. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:244-249,272-285] |

**Installation (only after the human and Hermes/Metro checkpoints pass):**

```bash
npm install --save-exact @garmin/fitsdk@21.217.0
```

The planner must place `checkpoint:human-verify` immediately before this command. [VERIFIED: package-legitimacy seam, 2026-10-06]

## Package Legitimacy Audit

| Package | Registry | Age / latest publish | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| `@garmin/fitsdk` [WARNING: flagged as suspicious — verify before using.] | npm | Package first published 2023-09-19; 21.217.0 published 2026-09-22 | 49,566/week | `github.com/garmin/fit-javascript-sdk` | SUS — `too-new` | Flagged — planner must add license/legitimacy and Hermes/Metro checkpoints before install. [CITED: https://www.npmjs.com/package/@garmin/fitsdk] |
| `fit-file-parser` [ASSUMED] [WARNING: flagged as suspicious — verify before using.] | npm | Package first published 2019-03-02; 6.1.2 published 2026-09-22 | 39,041/week | `github.com/jimmykane/fit-parser` | SUS — `too-new` | Not selected; a fresh human/package/runtime gate is mandatory if reconsidered. [CITED: https://www.npmjs.com/package/fit-file-parser] |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: package-legitimacy seam, 2026-10-06]
**Packages flagged as suspicious [SUS]:** `@garmin/fitsdk`; `fit-file-parser`. [VERIFIED: package-legitimacy seam, 2026-10-06]

The official decoder has no postinstall script in registry metadata, but that does not override the SUS verdict or restrictive license. [CITED: https://www.npmjs.com/package/@garmin/fitsdk]

## Architecture Patterns

### System Architecture Diagram

```text
Contextual entry (Workout / Library / Calendar)
                    │
                    ▼
          Garmin routes + screen state
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
Native single-file picker   Provider capability port
(read-only; URI private)    └─ approval_needed / unavailable
         │                     (no broker/network adapter)
         ▼
Bounded exact bytes ── SHA-256 ── transient attempt marker
         │
         ▼
Strict FIT adapter
header + exact length + CRC + decoder errors + count/output bounds
         │
         ▼
Pure normalization
one running session → subtype/time provenance/facts/laps/route segments
         │
         ▼
Identity decision
external reference index ─┬─ exact-byte hash index
                          └─ conflict/revision/review, never fuzzy merge
         │
         ▼
Serialized BEGIN IMMEDIATE transaction
aggregate + immutable payload + laps/chunks + receipt + dirty generation
         │
         ▼
Read-only Activity detail / Calendar / later Progress
         │
         ▼
Candidate query → explicit Confirm match
         │
         ▼
Revision-checked match event + completion overlay + receipt
```

This separates untrusted bytes and replaceable transport from source semantics, and it keeps both import and match acknowledgement behind committed SQLite receipts. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:31-75,95-128,147-159]

### Recommended Project Structure

The following planned paths are quoted verbatim from the approved ADR/UI parity sources. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:61-73] [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:183-202]

DATA_M8F2D6QK_START
```
app/garmin/index.tsx
app/garmin/import.tsx
app/garmin/activity/[activityId].tsx
app/garmin/activity/[activityId]/restore.tsx
app/garmin/match/[activityId].tsx
src/bootstrap/garminImportRuntime.tsx
src/domains/activities/importContracts.ts
src/domains/activities/normalizeFitActivity.ts
src/domains/activities/activityIdentity.ts
src/domains/activities/importCommands.ts
src/domains/activities/activityDetails.ts
src/domains/activities/garminActivitySourcePort.ts
src/domains/running/activityMatchCommands.ts
src/platform/files/expoFitFilePort.ts
src/platform/garmin/fitDecoderAdapter.ts
src/platform/garmin/garminActivityAdapter.ts
src/platform/sqlite/repositories/importedActivityRepository.ts
src/platform/sqlite/repositories/runningActivityMatchRepository.ts
src/ui/screens/GarminSyncScreen.tsx
src/ui/screens/ActivityImportScreen.tsx
src/ui/screens/ImportedActivityDetailScreen.tsx
src/ui/screens/ActivityMatchScreen.tsx
src/ui/__tests__/GarminSyncScreen.test.tsx
src/ui/__tests__/ActivityImportScreen.test.tsx
src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
src/ui/__tests__/ActivityMatchScreen.test.tsx
src/testing/contracts/garminImport.contract.ts
tests/integration/garmin-import.test.ts
```
DATA_M8F2D6QK_END

Treat `garminActivityAdapter.ts` as a future conditional file: do not create a live network implementation in this phase while the provider gate is closed. A disabled capability port may live in the domain/bootstrap seam without endpoints or credentials. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:28-42]

### Component Responsibilities and Symbols

The names below are prescriptive new Phase 18 symbols. If Phase 13 has already created an equivalent, extend that symbol instead of creating a parallel abstraction. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:61-75]

| File | Symbols to plan | Responsibility |
|------|-----------------|----------------|
| `src/platform/files/expoFitFilePort.ts` | `FitFilePort`, `FitFilePortError`, `createExpoFitFilePort`, `createProductionExpoFitFilePort` | One native file; read-only handle; limit+1 bytes; cancellation; close/cleanup; URI/native-error isolation. |
| `src/platform/garmin/fitDecoderAdapter.ts` | `FitDecoderPort`, `FitImportLimits`, `createGarminFitDecoderAdapter` | Exact envelope length, SDK integrity/options/errors, decode counters, copied bounded DTO, parser-version provenance. |
| `src/domains/activities/importContracts.ts` | `FitImportDraft`, `ImportedActivitySubtype`, `ImportResolution` schemas/types | Strict domain shape, presence flags, SI units, source/time/pace provenance, exhaustive result states. |
| `src/domains/activities/normalizeFitActivity.ts` | `normalizeFitActivity` | Exactly-one-running-session validation, subtype mapping, lap association/order, optional facts, route segments and output caps. |
| `src/domains/activities/activityIdentity.ts` | `resolveActivityIdentity` | Pure two-index identity decision matrix; fuzzy similarity can only produce review. |
| `src/domains/activities/importCommands.ts` | `prepareFitImport`, `confirmFitImportDate`, `acceptActivityRevision`, `addVerifiedSourceReference`, `importSeparateActivity`; consume Phase 13 `restoreRemovedActivity` | Validate input/request/revisions, enforce portability-capacity preflight, stage zero-write review, call one repository transaction, map conflicts safely; do not recreate Phase 13 remove/restore authority. |
| `src/platform/sqlite/repositories/importedActivityRepository.ts` | `ImportedActivityRepository`, `createImportedActivityRepository` | Read both identity indexes; atomically persist/replay aggregate, payload, child facts, source refs, decisions and receipts; query detail. |
| `src/domains/running/activityMatchCommands.ts` | `listActivityMatchCandidates`, `confirmActivityMatch`, `unmatchActivity`, `reassignActivityMatch` | Read-only ranking plus explicit revision-checked audited commands. |
| `src/platform/sqlite/repositories/runningActivityMatchRepository.ts` | `RunningActivityMatchRepository`, `createRunningActivityMatchRepository` | Match-event ledger, current completion overlay, uniqueness, receipt replay, stale/consumed checks. |
| `src/bootstrap/garminImportRuntime.tsx` | `GarminImportProvider`, `useGarminImportRuntime` | Compose file/decoder/domain/repository ports over the existing kernel lifecycle; provider capability defaults closed. |
| `app/_layout.tsx` | explicit `Stack.Screen` registrations for the approved Garmin paths | Match the existing explicit stack registration pattern; do not add a tab. [VERIFIED: app/_layout.tsx:32-74] |

These symbol names are a planning recommendation, not claims that the files exist today. Their boundaries are fixed; naming may be reconciled with Phase 13 without changing ownership. [ASSUMED]

### Source Tables and Ownership

The ADR proposes these table names verbatim. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:81-91]

DATA_J6S3P8VN_START
`imported_activities`
`imported_activity_payloads`
`imported_activity_external_refs`
`imported_activity_laps`
`imported_activity_sample_chunks`
`activity_import_receipts`
`running_activity_match_events`
`running_opportunity_completions`
DATA_J6S3P8VN_END

Use `imported_activities` as the owner-scoped aggregate/tombstone and accepted-payload pointer; `imported_activity_payloads` as immutable normalized revisions keyed by exact-byte hash; `imported_activity_external_refs` as independently unique provider/account/external identities; child laps/chunks as payload-scoped source facts; `activity_import_receipts` for request replay and explicit import decisions; immutable match events as source; and `running_opportunity_completions` only as rebuildable current relation. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:81-115]

### Pattern 1: Bounded Read-Only Intake

The current restore adapter demonstrates the required shape: the driver exposes only a selected file's size/open/read/close operations; the public port returns bytes or cancellation; URI and native errors stay inside the adapter; and production explicitly opens `FileMode.ReadOnly`. [VERIFIED: src/platform/files/expoBackupFilePort.ts:18-28,58-120,172-194]

For FIT, improve the read contract to request `configuredMaxBytes + 1` and reject when the sentinel byte exists. Treat MIME, extension, and declared size only as early hints; the actual byte count is authoritative. Close the handle in `finally`, copy the exact bytes before hashing/decoding, and never expose the URI or filename above the adapter. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:117-126]

### Pattern 2: Strict Decoder Adapter with Independent Length Check

The official SDK documents `Stream.fromArrayBuffer`, `Decoder.isFIT()`, `Decoder.checkIntegrity()`, and `Decoder.read(options)`; the read result contains both grouped messages and an error array. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0]

Version 21.217.0's implementation checks that the stream is not shorter than header + declared data + CRC, not that the byte length is exactly equal. The adapter must therefore independently parse the 12/14-byte header's declared data size and require exact total length before accepting `checkIntegrity()`; otherwise trailing bytes are not rejected by that check. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L74-L130]

Configure decoding explicitly, count message definitions and messages through listeners, abort at the first configured excess, require `errors.length === 0`, and discard the entire returned message dictionary after any error or bound violation. The SDK catches decoder exceptions and can return partial messages alongside errors, so never normalize partial output. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L132-L202] [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L280-L410]

### Pattern 3: Decode DTO Then Pure Normalize

Do not pass SDK objects into SQLite or JSX. The adapter emits a small plain DTO containing only bounded session/lap/record fields plus explicit presence/provenance. The pure normalizer validates exactly one supported running session, associates laps using the session's first-lap index/count, preserves lap order, separates elapsed/timer/moving, and emits route segments rather than one blindly connected path. [CITED: https://developer.garmin.com/fit/file-types/activity/] [CITED: https://developer.garmin.com/fit/cookbook/decoding-activity-files/] [VERIFIED: .planning/architecture/v1.2-garmin-import.md:130-145]

The accepted FIT source strings used by the decoder include the following verbatim values. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/types/types.d.ts#L497-L579] [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/types/types.d.ts#L651-L725]

DATA_Y3P7A9CJ_START
`sport: "running"`

`subSport: "treadmill" | "street" | "trail" | "track" | "generic" | "indoorRunning"`
DATA_Y3P7A9CJ_END

Map `"treadmill"` to Treadmill, `"indoorRunning"` to Indoor, and fixture-verified `"street" | "trail" | "track"` to Outdoor. Preserve `"generic"`, unknown numeric values, and any running sub-sport not explicitly approved by the fixture matrix as unspecified Running. Reject a missing/non-running base sport and multiple/multisport sessions before source writes. The treatment of other running sub-sports remains a reviewable assumption, not a GPS heuristic. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:291-305] [ASSUMED]

### Pattern 4: Immutable Aggregate, Payload Revision, and Receipt

Use the ADR's aggregate model: one imported activity identity; immutable observed payload versions; separate external references; child laps/sample chunks; request/source receipts; immutable match events; and a rebuildable current completion relation. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:77-93]

Resolve both exact-byte hash and verified external reference inside the same write transaction. New import writes the aggregate, accepted payload, bounded children, receipt, and dirty-generation effects atomically. Same-hash replay returns the prior result without new facts. Same external ID with different bytes stages an immutable proposed revision without replacing accepted facts. External-ID/hash disagreement blocks all writes. Similar totals may only produce an owner-review candidate. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:389-445]

The repository's writer serializes commands and returns the command result only after `COMMIT`; failures roll back and are classified by stage. Reuse this boundary rather than calling Expo transaction helpers. [VERIFIED: src/platform/sqlite/serializedWriter.ts:6-85] [VERIFIED: src/platform/sqlite/sqliteKernel.ts:139-205]

### Pattern 5: Recoverable Import Attempt

Persist only an opaque local operational attempt marker before source commit; keep it outside logical backup. It may record stage and an opaque attempt ID, but never the filename, content URI, raw bytes, coordinates, provider subject, or token. On startup, a leftover uncommitted marker becomes `FIT import was interrupted`, private temporary bytes are cleaned, and the user must reselect. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:264-287] [VERIFIED: .planning/architecture/v1.2-garmin-import.md:126,183-192]

The source transaction clears the attempt and writes the receipt atomically. If the process dies after commit but before UI acknowledgement, the request/content receipt replays the committed activity and the UI reports recovery without adding a duplicate. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:272-285] [VERIFIED: src/platform/sqlite/serializedWriter.ts:46-85]

### Pattern 6: Time-Zone Provenance Before Local-Date Matching

Persist the absolute source instant separately from the owner-confirmed local date/time-zone provenance. A FIT local timestamp or numeric offset is evidence, but it is not automatically an IANA zone/DST rule. If reliable time-zone provenance is absent or ambiguous, pause before any activity/receipt write and require the exact `Confirm activity date and time` flow; changing fields alone is still zero-write. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:244-270] [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/types/types.d.ts#L220-L222]

Candidate lookup uses the persisted confirmed local date and zone, not the phone's current zone. Reopening history after a phone time-zone change must not move the activity to another day. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:130-145]

### Pattern 7: Source-Present Detail Projection

Project facts in the locked order `Distance`, `Elapsed`, verified `Moving` or `Timer`, `Avg pace`; omit missing facts. Prefer an accepted source pace/speed with recorded basis, otherwise compute from positive Timer/Distance, then positive Elapsed/Distance. Never derive pace from heuristic Moving. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:323-347]

Render route only from validated paired coordinates, split gaps, reject invalid/sentinel/out-of-range points, and downsample only a rebuildable display projection. The source chunks remain lossless within the selected portability bounds. Outdoor without usable coordinates stays Outdoor and shows `Route unavailable`; Treadmill always shows `No route for treadmill activity`; Indoor and unspecified Running retain their separate labels. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:291-305,349-376] [VERIFIED: .planning/architecture/v1.2-garmin-import.md:139-145]

### Pattern 8: Stable Matching as a Separate Command

Candidate selection is a read-only projection. The confirm command carries request ID, activity identity, accepted payload revision, opportunity ID, schedule version, plan-day ID, stable session slot, running-day revision, and expected current relation. The exclusive transaction rechecks all of them before appending one match event, updating/rebuilding the completion overlay, and committing the receipt. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:147-157] [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:448-477]

The existing scheduling command style validates identifiers/revisions before mutation, hashes the command, replays an existing request receipt before reading mutable state, and stages a repository command with expected revisions. Preserve that pattern. [VERIFIED: src/domains/scheduling/scheduleCommands.ts:510-628,644-735]

### Pattern 9: Shared Runtime and Contextual Routes

Use one SQLite kernel/lifecycle. Define Garmin ports/controller state in `src/bootstrap/garminImportRuntime.tsx`, but compose them through the existing top-level runtime lifecycle; do not open an independent database connection per Garmin route. The current provider owns service construction/disposal and publishes commands through a React context. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:971-1050,1158-1218,2054-2088]

The exact route values and safe origin values are quoted below. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:65-89,403-405,418-424]

DATA_R5K1V8SN_START
`workout | calendar | library | progress`

`app/garmin/index.tsx`
`app/garmin/import.tsx`
`app/garmin/activity/[activityId].tsx`
`app/garmin/activity/[activityId]/restore.tsx`
`app/garmin/match/[activityId].tsx`
DATA_R5K1V8SN_END

Validate the origin against that four-value allowlist and accept only opaque local activity IDs. Never accept an arbitrary return URL, provider URL, filename, provider subject, or raw external activity ID. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:67-89]

### Pattern 10: Versioned Portability, Not Table Accretion

The current portability contract is verbatim:

DATA_B2X9M4FD_START
```typescript
export const LOGICAL_BACKUP_FORMAT_VERSION = 2 as const;
export const LOGICAL_BACKUP_ACCEPTED_FORMAT_VERSIONS = Object.freeze([1, 2] as const);

export const BACKUP_LIMITS = Object.freeze({
  maxHeaderBytes: 16 * 1024,
  maxArchiveBytes: 32 * 1024 * 1024,
  maxPlaintextBytes: 24 * 1024 * 1024,
  maxRowsTotal: 100_000,
  maxRowsPerTable: 25_000,
  maxStringBytes: 64 * 1024,
  maxNestingDepth: 16,
});
```
DATA_B2X9M4FD_END

[VERIFIED: src/domains/portability/backupContracts.ts:1-15]

Do not append new mandatory tables to historical v2 semantics. Add a new logical format version that still reads v1/v2; extend allowlists, row validation, owner-scoped portable IDs, graph validation, remapping, merge/conflict preview, restore order, rebuild, and capacity preflight together. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:183-192]

Adding new table names to the TypeScript allowlist does not create dirty-generation triggers on already migrated databases. The successor migration must explicitly create INSERT/UPDATE/DELETE generation triggers for every retained import/match source table and verify their count/behavior. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:27-58]

### Anti-Patterns to Avoid

- **Decode in a screen or route:** UI code must not import platform modules or execute SQL; use ports, domain commands, and runtime composition. [VERIFIED: scripts/check-boundaries.mjs:103-160]
- **Trust extension/MIME/declared size:** all are hints; enforce actual bytes, exact FIT length, CRC, semantic shape, and output bounds. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:117-126]
- **Accept decoder partials:** `read()` catches errors and returns partial message groups; any error means discard all decoded output. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L166-L202]
- **Classify treadmill from missing GPS:** subtype comes from validated sport/sub-sport evidence only. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:291-305]
- **Use current phone zone for history:** persist source/confirmed time provenance so the historical day does not drift. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:130-145]
- **Use normalized facts as primary dedupe identity:** exact-byte SHA-256 and verified provider reference are independent; similarity only prompts review. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-115]
- **Treat selection as confirmation:** radio selection never writes or completes an occurrence. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:448-477]
- **Retain raw FIT silently:** permanent original retention changes privacy and capacity and is not an implicit fallback. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:93]
- **Create a live provider stub:** fixture states are test-only and cannot change production capability or close GAR-04–GAR-07. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:32-40]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FIT binary decoding | A custom protocol/message/profile decoder | A dependency selected through the license + legitimacy + Hermes gate behind `FitDecoderPort` | FIT header/CRC, definitions, developer fields, scaling, invalid values, sessions/laps/records, and profile evolution are deceptively complex. [CITED: https://developer.garmin.com/fit/] |
| Native file chooser | A custom Android storage permission/activity integration | Existing Expo File API adapter pattern | The app already proves a private URI, read-only handle, cancellation, bounded read, and safe error seam. [VERIFIED: src/platform/files/expoBackupFilePort.ts:58-120,172-194] |
| SHA-256 | JavaScript hash implementation or hash of decoded JSON | `expo-crypto` over exact bytes | Exact bytes are the locked content identity and the native crypto API accepts binary input. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:20-23] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/crypto/] |
| Concurrency/rollback | Screen mutexes or Expo transaction shortcuts | Existing serialized SQLite kernel/repositories | The repository already owns FIFO `BEGIN IMMEDIATE`, commit, rollback, and error mapping. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-85] |
| Route map | Map tiles, geocoding, road snapping, or location permission | Existing `react-native-svg` with validated source coordinates and segmented gaps | The approved surface is static, factual, local, and accessible. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:187-207,349-368] |
| Duplicate merge | Fuzzy date/distance auto-merge | Independent unique indexes plus explicit review | Similar workouts can be distinct; source updates and identity conflicts have different safe outcomes. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-115] |
| Matching | Date-only or active-plan lookup | Stable Phase 17 opportunity/slot/revision identity plus explicit confirm receipt | Same-day concurrent plans and stale schedules must remain distinguishable. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:448-477] |
| OAuth/broker | Embedded client secret, in-app credentials, unofficial Connect scraping, guessed endpoints | Closed capability state until separate authorization and current partner contract | This phase does not authorize provider infrastructure. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:26-29,69-72] |

**Key insight:** the custom code belongs in narrow policy/normalization/transaction adapters around existing platform primitives; it must not reproduce FIT decoding, storage selection, hashing, transaction scheduling, map tiles, or OAuth infrastructure. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:31-75]

## Planning Sequence

1. **Preflight:** verify Phase 13/17 domain symbols and migrations are present; freeze the exact FIT fixture corpus and expected independent summaries; add test/evidence IDs; do not install a decoder yet. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:51-71]
2. **Dependency gate:** complete human package/license review, then the Hermes/Metro release smoke and measured resource-limit calibration. Stop if either fails. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:31-32] [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/LICENSE.txt]
3. **Storage/portability first:** add successor migration(s), constraints/indexes, source aggregates, immutable payload revisions, receipts, match events/overlay, operational attempt state, portability version, merge/remap/rebuild, and dirty triggers. Prove rollback/replay before UI. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:77-128,183-192]
4. **Manual import vertical slice:** file port → exact-byte hash → strict decoder adapter → pure normalizer → import decision → transaction → detail. Keep the whole path offline. [VERIFIED: .planning/research/v1.2/STACK.md:78-84]
5. **Dedupe/revision/restore:** implement every explicit outcome and zero-write exit before matching. Existing accepted facts and matches remain stable until a named review action commits. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:389-445]
6. **Matching:** query Phase 17 candidates, preserve stable identity/revisions, then commit only from `Confirm match`. Test cancel/back/stale/consumed/replay before wiring success UI. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:448-477]
7. **Routes/presentation:** add contextual stack routes/screens, exact UI states/copy, shared appearance, accessibility/reflow, and read-only detail. Keep provider capability truthful and closed. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:65-240,481-632]
8. **Verification:** run targeted Jest/SQLite suites per task, full repository gates per wave, and later Android release-mode FIT/process-death/performance evidence. Do not use mocked provider states to close live rows. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:670-696]

## Common Pitfalls

### Pitfall 1: Treating the Decoder Candidate as Approved

**What goes wrong:** The plan installs or executes the official-looking package before accepting its restrictive license or proving the runtime. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/LICENSE.txt]
**Why it happens:** Registry existence and an official repository do not override a `SUS` legitimacy verdict or establish Hermes/Metro support. [VERIFIED: package-legitimacy seam, 2026-10-06]
**How to avoid:** Make the human license/legitimacy gate and native smoke explicit Wave 0 blockers. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:31-32]
**Warning signs:** `package.json` changes before review; claims of Hermes compatibility based only on Node; performance tests run before license acceptance.

### Pitfall 2: Assuming SDK Integrity Means Strict File-Length Validation

**What goes wrong:** A FIT payload with valid declared content/CRC plus trailing bytes passes the SDK's current integrity predicate. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L101-L130]
**Why it happens:** The README describes total-size equality, while the 21.217.0 implementation rejects only a shorter-than-declared stream. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0]
**How to avoid:** Independently require exact top-level byte length, then require `isFIT()`, `checkIntegrity()`, and zero decoder errors.
**Warning signs:** A valid fixture with appended bytes imports; tests only mutate CRC.

### Pitfall 3: Normalizing Partial Decoder Output

**What goes wrong:** The decoder catches an exception, returns earlier message groups plus errors, and the app persists incomplete source facts. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L166-L202]
**Why it happens:** Callers inspect `messages` without first rejecting a non-empty `errors` array.
**How to avoid:** Treat any decoder error or bound sentinel as total candidate failure; discard all SDK objects and commit nothing.
**Warning signs:** A truncated fixture still displays distance or laps.

### Pitfall 4: A Byte Cap Without Decode/Output Caps

**What goes wrong:** A small adversarial file creates excessive definitions/messages/objects or a huge projection on the JavaScript thread. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:120-126]
**Why it happens:** File size bounds input bytes, not decoder allocations or synchronous CPU time. The SDK collects message objects while decoding. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L280-L410]
**How to avoid:** Count definitions/messages via listeners, cap sessions/laps/samples/output, stop on limit+1, validate maximum fixtures in a release build, and prevent concurrent import/sync.
**Warning signs:** JS frames stall, route navigation freezes, or output size grows faster than input size.

### Pitfall 5: Conflating Timer, Moving, and Elapsed

**What goes wrong:** `totalTimerTime` is labelled Moving, pace changes basis silently, or missing data becomes zero. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/types/mesgs.d.ts#L510-L562]
**Why it happens:** FIT distinguishes elapsed (includes pauses) and timer (excludes pauses), while verified Moving may be separate/absent. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:130-143]
**How to avoid:** Store presence and basis independently; label Timer honestly; persist the selected pace basis with the accepted payload revision.
**Warning signs:** Treadmill and outdoor summaries show Moving for every file or pace changes after parser upgrade.

### Pitfall 6: Inferring Subtype from GPS

**What goes wrong:** An outdoor activity without coordinates becomes Treadmill, or stray treadmill coordinates create a route. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:291-305]
**Why it happens:** Coordinates are treated as classification rather than optional source facts.
**How to avoid:** Classify from validated sport/sub-sport first; use coordinates only to decide route availability within the already chosen subtype.
**Warning signs:** Removing a record point changes the persisted subtype.

### Pitfall 7: Time-Zone Drift

**What goes wrong:** An old run moves Calendar days when the device time zone changes, or an ambiguous FIT timestamp is committed without review. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:130-145]
**Why it happens:** An absolute timestamp, a local FIT timestamp, a numeric offset, and an IANA time zone are treated as interchangeable.
**How to avoid:** Keep them separate; pause before source commit when provenance is insufficient; persist owner confirmation and use it for matching/history.
**Warning signs:** tests rely only on `new Date()` in the host zone or omit DST/midnight cases.

### Pitfall 8: Race-Safe UI but Race-Unsafe Storage

**What goes wrong:** Two picker taps or manual/API deliveries create two activities, or a crash leaves an activity without its receipt. [VERIFIED: .planning/research/v1.2/PITFALLS.md:109-121]
**Why it happens:** UI disabling is mistaken for a uniqueness/transaction guarantee.
**How to avoid:** Put both identities, expected revision checks, all child inserts, and the receipt in one serialized writer transaction with database uniqueness; on conflict, reread and replay. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-85]
**Warning signs:** separate transactions for activity and receipt, or tests cover sequential duplicates only.

### Pitfall 9: Revisions Silently Rewrite Matches

**What goes wrong:** A changed FIT/API payload retroactively changes the evidence that completed a scheduled run. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:104-115]
**Why it happens:** Match rows point only to aggregate/current payload.
**How to avoid:** Match events pin the accepted payload revision. Accepting a source revision preserves historical revisions and requires a separate audited rebind/correction decision.
**Warning signs:** updating `active_payload_id` changes old Progress/Calendar match evidence.

### Pitfall 10: Adding Tables Without Portability and Dirty Triggers

**What goes wrong:** Imported activities disappear after restore or never schedule automatic Drive backup. [VERIFIED: .planning/research/v1.2/PITFALLS.md:39-51]
**Why it happens:** Logical backup and generation triggers are explicit lists, not database discovery. [VERIFIED: src/domains/portability/backupContracts.ts:26-110] [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:27-58]
**How to avoid:** Treat schema, portability version, remap/merge/rebuild, capacity, and generation triggers as one domain task.
**Warning signs:** new tables exist but are absent from backup manifest row counts or mutation generation stays unchanged.

### Pitfall 11: A Second Database Runtime

**What goes wrong:** Garmin opens another kernel, races migrations/closing, or observes different lifecycle state. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:971-1050,2054-2088]
**Why it happens:** A new context provider is wired as an independent app instead of a module over the shared kernel.
**How to avoid:** Compose a separate Garmin controller/port surface over the existing kernel lifecycle.
**Warning signs:** route mounts call `openSqliteKernel` or migrations.

### Pitfall 12: Claiming Conditional Provider Work as Complete

**What goes wrong:** A simulated consent or local FIT success is reported as GAR-04–GAR-07 completion. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:28-42]
**Why it happens:** fixture reachability and production capability are merged.
**How to avoid:** Preserve explicit `CONDITIONAL_EXTERNAL` evidence and production `approval_needed`/unavailable behavior; no broker/network task.
**Warning signs:** provider success screenshots have no live entitlement/contract identity.

## Code Examples

These are implementation skeletons, not proof that the gated decoder runs on Hermes.

### Strict SDK Adapter

```typescript
// Sources:
// https://github.com/garmin/fit-javascript-sdk/tree/21.217.0
// https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L74-L202
import { Decoder, Stream } from "@garmin/fitsdk";

export function decodeStrictFit(
  bytes: Uint8Array,
  limits: FitImportLimits,
): DecodedFitDto {
  assertInputWithinLimit(bytes, limits);
  assertExactFitEnvelopeLength(bytes);

  const exactBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const decoder = new Decoder(Stream.fromArrayBuffer(exactBuffer));
  if (!decoder.isFIT() || !decoder.checkIntegrity()) {
    throw classifiedFitFailure();
  }

  const counters = createFitCounters(limits);
  const result = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    includeUnknownData: false,
    mergeHeartRates: true,
    decodeMemoGlobs: false,
    skipHeader: false,
    dataOnly: false,
    legacyArrayMode: false,
    mesgDefinitionListener: () => counters.acceptDefinition(),
    mesgListener: () => counters.acceptMessage(),
  });

  if (result.errors.length !== 0) {
    throw classifiedFitFailure();
  }
  return copyBoundedFitDto(result.messages, limits);
}
```

The option names and method signatures above come from the 21.217.0 official SDK. The helper contracts and numeric `FitImportLimits` values are Phase 18 code to implement and calibrate; they are not claimed SDK APIs. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0] [ASSUMED]

### Import Command Transaction Shape

```typescript
// Source pattern: src/platform/sqlite/serializedWriter.ts:27-85
return kernel.write(async (transaction) => {
  const replay = await repository.readReceipt(transaction, request);
  if (replay) return replay;

  const resolution = await repository.resolveBothIdentities(
    transaction,
    exactByteHash,
    verifiedExternalReference,
  );
  const staged = decideImport(normalizedDraft, resolution, expectedRevision);

  await repository.persistWholeDecision(transaction, staged);
  await repository.persistReceipt(transaction, staged);
  return staged.result;
});
```

The names in this skeleton express responsibilities, not existing symbols. The required atomic order and replay behavior are locked by the ADR and current serialized-writer implementation. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-128] [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-85]

### Safe Route-Origin Validation

The allowed values below are already quoted verbatim in the route contract block above. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:78]

```typescript
const GARMIN_ORIGINS = new Set([
  "workout",
  "calendar",
  "library",
  "progress",
] as const);

function parseGarminOrigin(value: unknown): GarminOrigin {
  return typeof value === "string" && GARMIN_ORIGINS.has(value as GarminOrigin)
    ? value as GarminOrigin
    : "workout";
}
```

Use the navigation stack for return behavior; never pass a caller-provided URL/href through the route. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:67-89]

## State of the Art

| Old / unsafe approach | Current required approach | When established | Impact |
|-----------------------|---------------------------|------------------|--------|
| Buffer/fs-oriented parser entry | ArrayBuffer/typed-array decode behind a React Native adapter | Official SDK 21.217.0 release, 2026-09-22 | Avoids depending on Node file APIs; Hermes/Metro still requires proof. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0] |
| Trust `checkIntegrity()` alone | Independent exact envelope-length check plus SDK signature/CRC and zero-error read | Source audit 2026-10-06 | Rejects trailing-data cases the current implementation does not reject itself. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L101-L130] |
| Filename/date/distance dedupe | Independent verified external reference and exact-byte SHA-256, with explicit revision/conflict/possible-duplicate outcomes | v1.2 ADR | Prevents duplicate history without collapsing distinct workouts. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-115] |
| Mutable latest activity facts | Immutable payload revisions plus accepted-payload pointer and match pinned to payload revision | v1.2 ADR | Provider updates cannot rewrite historical evidence silently. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:81-115] |
| Current phone zone decides historical day | Source/confirmed local time-zone provenance persisted at import | v1.2 ADR/UI contract | Calendar/match dates survive travel and DST changes. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:264-270] |
| Interactive/network map | Static local SVG projection from accepted coordinates | Revision 18 / Phase 18 UI contract | Offline, no location permission, no fabricated route. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:187-207,349-368] |
| Simulated provider success | Explicit capability gate and conditional external evidence | Phase 18 locked decision | FIT import can ship truthfully while official sync remains blocked. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:26-29] |

**Deprecated/outdated:**

- `legacyArrayMode: true` is deprecated by the official SDK and is scheduled for removal; pin it explicitly to `false`. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0]
- The prototype controls `Continue simulated consent`, `Preview Outdoor FIT`, `Preview Treadmill FIT`, and `Preview error` are fixture harness controls, not product UI. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:40]
- Existing v1.1 reports and old phase runners are regression references, not Phase 18 evidence. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:5-34]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Numeric limits for FIT bytes, messages, laps, samples, normalized output, route points, decode time, and peak memory will be selected from a representative/public-license fixture corpus and native release measurements; no values are yet locked. | Planning Preconditions | Parser implementation cannot be accepted or safely exposed until calibration completes. |
| A2 | `street`, `trail`, and `track` may be treated as explicit Outdoor Running, while unreviewed running sub-sports remain unspecified Running. | Decode DTO Then Pure Normalize | Misclassification would render the wrong route/no-route contract; fixture review must confirm the allowlist. |
| A3 | `fit-file-parser` is a viable fallback candidate if the official SDK is rejected. | Alternatives Considered | It may fail semantic, supply-chain, or Hermes checks; the plan must stop rather than assume it works. |
| A4 | The project will retain raw FIT bytes only transiently and persist the exact hash plus all supported normalized source facts. | Backup, privacy, recovery | Permanent replay/debug needs might require a separately approved privacy/capacity policy. |
| A5 | The SQLite-host repository test will be named `tests/sqlite-host/importedActivityRepository.test.ts` if Phase 13 has not already created an equivalent file. | Validation Architecture | Filename may need alignment with Phase 13; behavior coverage, not this provisional filename, is mandatory. |
| A6 | The recommended new symbol names in Component Responsibilities will be used unless Phase 13 has already established equivalent names. | Architecture Patterns | Parallel abstractions would fragment the import boundary; reconcile names before implementation. |

## Resolved Questions

1. **RESOLVED BY FAIL-CLOSED GATE — Can the project accept the official FIT Protocol License for this personal Android use and the required compatibility/performance qualification?**
   - What we know: the license is not MIT and contains internal-business-purpose, distribution, confidentiality, and benchmarking restrictions. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/LICENSE.txt]
   - What's unclear: legal applicability to this owner's personal-use APK and whether the required measurements are permitted.
   - Resolution: Plan 18-01 is a blocking-human package/licence/fixture-provenance decision. Acceptance unlocks the exact pin; rejection leaves manifests unchanged and stops for a separately researched decoder decision. No downstream task can infer acceptance.

2. **RESOLVED BY FAIL-CLOSED GATE — Does `@garmin/fitsdk` 21.217.0 actually bundle and execute correctly under Expo 57 / RN 0.86 Hermes?**
   - What we know: the package is ESM, has no runtime dependency/postinstall, and uses ArrayBuffer/DataView/TextDecoder/BigInt DataView APIs; Expo documents UTF-8 TextDecoder and RN documents bundled Hermes. [CITED: https://github.com/garmin/fit-javascript-sdk/tree/21.217.0] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/expo/] [CITED: https://reactnative.dev/docs/0.86/hermes]
   - What's unclear: Metro root-package resolution, release bytecode execution, BigInt DataView behavior, bundle impact, maximum-fixture memory/time, and responsiveness.
   - Resolution: Plan 18-02 builds/installs an exact release-Hermes qualification artifact and runs the decoder producer; Plan 18-03 is a blocking-human acceptance of the identity-bound evidence. Missing or failing native evidence blocks Plans 18-04 onward; host-only output cannot substitute.

3. **RESOLVED BY FAIL-CLOSED GATE — What exact parser/import limits are safe on the target Android profile?**
   - What we know: every named resource class must be bounded; no measured numeric values are authorized yet. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:20-24] [VERIFIED: .planning/architecture/v1.2-garmin-import.md:120-126]
   - What's unclear: representative/max owner file size and safe decode/output/memory ceilings.
   - Resolution: Plans 18-02/18-03 generate and accept exact release measurements for every named bound from synthetic/publicly licensed boundary fixtures. Plan 18-04 transcribes only the accepted limit object, and Plan 18-05 applies the existing portability-capacity estimator before either import commit path. No guessed or borrowed limit can enable the picker.

4. **RESOLVED BY LOCKED CONSERVATIVE POLICY — Which additional FIT Running sub-sports should count as explicit Outdoor?**
   - What we know: Treadmill, Indoor, Outdoor, and unspecified Running are distinct required outcomes; GPS cannot decide subtype. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:291-305]
   - What's unclear: policy for less common Running sub-sports beyond the core reviewed allowlist.
   - Resolution: unreviewed Running sub-sports persist as unspecified Running. Only the fixture-backed approved allowlist maps to Outdoor; GPS presence/absence never changes subtype. Expanding the allowlist requires separate fixture-backed owner/domain review.

5. **RESOLVED BY LOCKED PRIVACY POLICY — Is temporary-only raw FIT retention sufficient?**
   - What we know: the ADR recommends cleanup after successful normalization/commit and says permanent retention is unresolved. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:93,183-192]
   - What's unclear: whether future forensic replay is worth the privacy and backup-capacity cost.
   - Resolution: raw FIT bytes are temporary-only and are cleaned after every terminal path/startup recovery. Persist only the exact hash, parser/normalization provenance and all supported normalized source facts. Permanent originals require a separate owner/security/capacity decision and are not an implicit fallback.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Jest, TypeScript, research/package tooling | ✓ | `v24.19.0` | — [VERIFIED: shell probe 2026-10-06] |
| npm | Dependency restore and test scripts | ✓ | `11.17.0` | — [VERIFIED: shell probe 2026-10-06] |
| Java | Later Android tooling | ✓ | OpenJDK `27` | Use project-supported JDK if Gradle later rejects 27. [VERIFIED: shell probe 2026-10-06] |
| Maestro | Later native UI evidence | ✓ | `2.8.0` | — [VERIFIED: shell probe 2026-10-06] |
| Installed project `node_modules` | Local tests, Metro, Hermes smoke | ✗ | — | Run locked `npm ci` during authorized implementation. [VERIFIED: shell probe 2026-10-06] |
| Android `adb` / emulator CLI | Hermes/device/process-death proof | ✗ | — | Use an authorized Android-capable host or install platform tools; no host-only substitute closes native proof. [VERIFIED: shell probe 2026-10-06] |
| Standalone Gradle CLI | Native build | ✗ | — | Use the generated Android Gradle wrapper after authorized prebuild/build. [VERIFIED: shell probe 2026-10-06] |
| Context7 CLI/MCP | Preferred docs lookup | ✗ | — | Research seam fell back to official-source web retrieval and stored MEDIUM digests. [VERIFIED: shell/tool probe 2026-10-06] |

**Missing dependencies with no fallback:**

- Native Hermes/Metro, file-picker, process-death, and Android performance proof cannot run in this planning worktree until dependencies and Android tooling are available. Host inspection is not closure evidence. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:15-34]

**Missing dependencies with fallback:**

- Context7 was unavailable; official Garmin, Expo, React Native, OWASP, npm registry, and version-tagged GitHub sources were read directly through the research seam fallback. [CITED: https://github.com/garmin/fit-javascript-sdk/releases/tag/21.217.0]

## Validation Architecture

Validation is enabled because `workflow.nyquist_validation` and `workflow.security_enforcement` are both `true`. [VERIFIED: .planning/config.json:20-49]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `29.7.0`, React Native Testing Library `14.0.1`, real `node:sqlite` host suites, and later Expo SQLite/Android contracts. [VERIFIED: package.json:23-28,125-132] |
| Config file | `jest.config.js` with `unit`, `components`, `sqlite-host`, and `integration` projects. [VERIFIED: jest.config.js:26-89] |
| Quick run command | `npm run test:unit -- --runInBand <one test file>` or `npm run test:components -- --runInBand <one screen test>`. [VERIFIED: package.json:23-27] |
| Full host suite | `npm run typecheck && npm run lint && npm run test:all`. [VERIFIED: package.json:19-28,72] |
| Integrity coverage | Add all import identity/normalization/command, file/decoder, and matching command modules to `integrityCriticalFiles`; each registered file must have exactly 100% statements/branches/functions/lines. [VERIFIED: scripts/run-coverage-gate.mjs:16-123,171-204] |
| Native closure | New Phase 18 native contract/runner/evidence with source/APK/device/fixture identity; Phase 20 performs final native acceptance. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:51-71,164-186] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAR-01 | All contextual entries, four-root retention, Back/origin restoration, route-param allowlist | component + route | `npm run test:components -- --runInBand src/ui/__tests__/GarminSyncScreen.test.tsx` | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:187] |
| GAR-02 | Root/deep header geometry, one-line root title, inert placeholder semantics | component + native visual | Same screen test; later Phase 18 native matrix | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:188] |
| GAR-03 | Approval-needed/unavailable/disconnected truth and FIT fallback | unit + component | Same screen test plus capability-port unit test | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:189] |
| GAR-04 | Consent/cancel/denied/error/expired/revoked | deterministic contract + conditional live | Same screen test; live command only after gate | ❌; live row externally blocked [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:190] |
| GAR-05 | Connected facts/list/receipt count/actions | component + SQLite | Screen test plus `npm run test:integration -- --runInBand tests/integration/garmin-import.test.ts` | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:191] |
| GAR-06 | One in-flight sync; imported/no-new/error keeps prior facts | unit + component + SQLite | Screen/import integration tests | ❌ Wave 0; live result conditional [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:192] |
| GAR-07 | Revoke success/failure and retained imported history | unit + component + conditional live | Screen/import integration tests | ❌ Wave 0; live row externally blocked [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:193] |
| GAR-08 | Real native picker, strict decode, ambiguous-zone review, durable import | unit + component + native | `npm run test:unit -- --runInBand src/platform/files/expoFitFilePort.test.ts src/platform/garmin/fitDecoderAdapter.test.ts`; component/import contract | ❌ Wave 0 [VERIFIED: .planning/architecture/v1.2-garmin-import.md:213-223] |
| GAR-09 | Wrong/ZIP/malformed/CRC/truncated/oversize/unsupported/duplicate/interrupted/commit-failure recovery | unit + real SQLite + native lifecycle | Decoder/identity tests plus `tests/integration/garmin-import.test.ts` | ❌ Wave 0 [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:272-287,647-666] |
| GAR-10 | Outdoor facts, actual/absent route, HR optional, pace basis | unit + component | `npm run test:components -- --runInBand src/ui/__tests__/ImportedActivityDetailScreen.test.tsx` | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:196] |
| GAR-11 | Treadmill/indoor/unspecified no-route truth | unit + component | Same detail test plus normalizer fixtures | ❌ Wave 0 [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:291-305,357-368] |
| GAR-12 | Exact Lap/Time/Pace, source order, missing values, 200% reflow | unit + component + native accessibility | Same detail test and native matrix | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:198] |
| GAR-13 | Candidate identity/rank/selection without write | unit + component + SQLite digest | `npm run test:components -- --runInBand src/ui/__tests__/ActivityMatchScreen.test.tsx` | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:199] |
| GAR-14 | Exact selected candidate, Confirm-only mutation, stale/replay/failure recovery | domain + real SQLite + component | Match command tests plus Garmin integration test | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:200] |
| GAR-15 | Loading/missing/removed/projection error/retry/offline detail | component + integration | Detail screen test plus import integration test | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:201] |
| GAR-16 | Shared Light/Dark/System and focus restoration | component + native | Garmin sync screen test plus native configuration matrix | ❌ Wave 0 [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:202] |

### Required Cross-Cutting Test Matrices

- **Decoder fixture matrix:** valid Outdoor/Treadmill/Indoor/unspecified Running; no GPS/HR/laps; invalid sentinel coordinates; zero distance; stopped gaps; nonuniform/repeated timestamps; unknown fields; multiple sessions; multisport; wrong magic; 12/14-byte headers; exact length, shorter, trailing bytes; CRC invalid; limit-1/limit/limit+1 for every calibrated bound; decoder exception with partial messages; explicit parser version/options. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:213-224]
- **Identity matrix:** every ADR row in manual→manual, manual→API, API→manual, sequential and concurrent order; removed aggregate; same external ID/different hash; different external IDs/same hash; external→A/hash→B; similar facts/different bytes; lost acknowledgement after commit. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-115]
- **Transaction matrix:** fail each aggregate/payload/lap/chunk/reference/receipt/decision/match insert, beforeCommit, COMMIT, rollback, and post-commit refresh; verify zero partial source rows or exactly one replayable committed result. [VERIFIED: tests/sqlite-host/sqliteKernel.host.test.ts:423-695] [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:670-696]
- **Time matrix:** UTC/offset/local evidence, ambiguous/missing zone, DST gap/overlap, midnight, device-zone change, owner edit/cancel/confirm, and matching against persisted local day. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:213-224]
- **Portability matrix:** old v1/v2 read, new version roundtrip, exact repeats, cross-owner conflicts, chunk tamper/size limits, source/match remap, tombstones, no credential/operational-job restore, deterministic projection rebuild, dirty-generation advance for each source table. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:183-192,213-224]
- **UI matrix:** every named provider/import/detail/dedupe/revision/match state; 360×800, 390×844, 600×960, 840×1080 and landscape; Light/Dark/System→both OS schemes; 1×/200%; touch/keyboard/D-pad; normal/reduced motion; focus and Back restoration. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:557-632,670-696]

### Sampling Rate

- **Per task commit:** run the single relevant unit/component/SQLite test file plus `npm run typecheck` and `npm run lint`. [VERIFIED: package.json:19-28]
- **Per wave merge:** run all new Phase 18 host tests, then `npm run test:all`. [VERIFIED: package.json:72]
- **Phase gate:** full host suite green; all new integrity files at 100%; native picker/Hermes/process-death/performance rows have identity-bound evidence or an explicit Phase 20 handoff; GAR-04–GAR-07 remain labelled external-blocked unless real access exists. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:164-186]

### Wave 0 Gaps

- [ ] Decoder license/legitimacy decision and conditional exact install.
- [ ] `src/platform/garmin/fitDecoderAdapter.test.ts` — official SDK options, strict envelope/CRC/errors/bounds and no partial DTO.
- [ ] `src/platform/files/expoFitFilePort.test.ts` — native driver seam, cancellation, misleading/unknown size, limit+1, close failures, URI isolation.
- [ ] `src/domains/activities/normalizeFitActivity.test.ts` — subtype/time/pace/route/lap/HR source semantics.
- [ ] `src/domains/activities/activityIdentity.test.ts` — complete two-index decision matrix.
- [ ] `src/testing/contracts/garminImport.contract.ts` — source-owned native ordered case ledger.
- [ ] `tests/integration/garmin-import.test.ts` — real persisted import/revision/match/receipt/portability behavior.
- [ ] `tests/sqlite-host/importedActivityRepository.test.ts` — provisional filename for failure injection/concurrency and transaction row-count proof. [ASSUMED]
- [ ] Four approved component suites: `GarminSyncScreen.test.tsx`, `ActivityImportScreen.test.tsx`, `ImportedActivityDetailScreen.test.tsx`, `ActivityMatchScreen.test.tsx`. [VERIFIED: .planning/design/v1.2-prototype-parity-matrix.md:187-202]
- [ ] Phase 18 native route/runner/evidence validator with Hermes identity, fixture hashes, source/APK/device identity, and rejection tests for missing/duplicate/skipped/mismatched evidence. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:164-178]
- [ ] Register integrity-critical Phase 18 modules in `scripts/run-coverage-gate.mjs`. [VERIFIED: scripts/run-coverage-gate.mjs:16-123,171-204]

## Security Domain

Security enforcement is enabled at ASVS level 1. [VERIFIED: .planning/config.json:47-49]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Conditional | No local-import authentication. Any future Garmin connection uses the separately approved external-browser/provider contract; no in-app credential collection. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:211-240] |
| V3 Session Management | Conditional | If official access is later authorized, bind state/verifier/connection generation and invalidate old work before local session clearing. No provider session implementation now. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:161-181] |
| V4 Access Control | Yes | Scope every activity/reference/match/portable identity to the local owner namespace; verify provider-subject coherence before adding a source reference. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:77-115,183-190] |
| V5 Input Validation | Yes | One uncompressed FIT; actual byte bound; exact envelope length; CRC; decoder error rejection; semantic and output bounds; route param allowlists. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:19-24] |
| V6 Cryptography | Yes | Use platform `expo-crypto` SHA-256 over exact bytes; never hand-roll digest or store a provider client secret in app storage. [VERIFIED: .planning/phases/18-garmin-import/18-CONTEXT.md:21,27-29] [CITED: https://docs.expo.dev/versions/v57.0.0/sdk/crypto/] |
| V7 Error Handling and Logging | Yes | Map native/decoder/SQLite errors to bounded diagnostic codes; exclude URIs, filenames, paths, IDs, tokens, FIT bytes, coordinates, HR, and raw exceptions. [VERIFIED: src/domains/shared/diagnostics.ts:3-31,57-100] [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:272-287] |
| V8 Data Protection | Yes | Raw FIT is temporary by recommendation; normalized health/location facts are owner-scoped and portable; secrets/jobs/projections are excluded. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:183-192] [ASSUMED] |
| V12 File and Resource Handling | Yes | Treat the picker result as hostile, validate content rather than extension/MIME, cap resource consumption, and reject ZIP/archive expansion. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html] [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:244-287] |
| V13 API and Web Service | Conditional/external | No live adapter until current partner authentication, delivery verification, quotas/retries, allowlists, and revocation rules are available. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:161-181] |

### Known Threat Patterns for Expo / FIT / SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed FIT causes CPU/heap exhaustion | Denial of Service | Limit+1 byte read, exact header length, definition/message/lap/sample/output caps, abort sentinel, release-mode memory/time gate. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:117-126] |
| File metadata/path leaks private activity | Information Disclosure | Keep URI/filename/native error inside platform adapter; opaque handle and classified diagnostic only. [VERIFIED: src/platform/files/expoBackupFilePort.ts:58-120,256-260] |
| CRC-valid or decoder-partial data becomes trusted source | Tampering | Exact envelope length + SDK CRC + zero-error requirement + pure schema validation before transaction. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L101-L202] |
| Duplicate/racing import creates two aggregates | Tampering / Repudiation | Two independent unique indexes, request/content receipts, serialized transaction, conflict reread/replay. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-128] |
| Stale match completes wrong occurrence | Tampering | Stable opportunity/slot plus schedule/running/activity/payload expected revisions in one transaction. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:147-159] |
| Raw coordinates/HR/tokens enter logs/evidence/backups | Information Disclosure | Aggregate-only diagnostics, synthetic/public fixtures, explicit logical allowlist, raw secrets/jobs excluded, Android backup exclusions. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:183-192] |
| Old connection callback mutates a new account | Spoofing / Tampering | Connection-generation fence; this remains conditional and unimplemented until provider authorization. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:161-181] |
| Arbitrary route/return URL injection | Spoofing | Four-value origin allowlist and opaque local activity ID; no raw URL/provider identifier accepted. [VERIFIED: .planning/phases/18-garmin-import/18-UI-SPEC.md:65-89] |
| Private staging/credential copied by Android backup | Information Disclosure | Extend both cloud-backup and device-transfer exclusions and verify generated XML; current rules only cover database, backup-staging, and plaintext-staging. [VERIFIED: plugins/withAndroidBackupRules.ts:10-42,45-74] |

## Performance and Resource Contract

- The decoder's `read()` loop is synchronous, and React Native documents that long JavaScript-thread work drops frames and delays touch response. Parser work must be measured in a release build with the same bounded fixtures used to set acceptance limits. [CITED: https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/src/decoder.js#L166-L202] [CITED: https://reactnative.dev/docs/0.86/performance]
- Do not invent a total parse-time threshold from the existing 50 ms ordinary-JS-task or 30 s merge budgets; the native matrix explicitly says the FIT parse/import budget must be chosen from its own maximum fixture. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:140-162]
- Record input bytes, definition/message/lap/sample counts, normalized bytes/chunks, displayed route points, elapsed monotonic time, peak heap/RSS delta, JS long-task/frame impact, device/build identity, and success/error classification—never private names, paths, coordinates, or FIT bytes. [VERIFIED: .planning/verification/v1.2-native-verification-matrix.md:164-178]
- If the synchronous SDK cannot meet measured responsiveness at an acceptable input bound, keep the `FitDecoderPort` and move the implementation behind a measured native/background adapter or return for scope/dependency review; do not move it into Reanimated's UI runtime. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:126]
- Route projection must cap only the rebuildable display point set; persisted supported sample chunks remain lossless and must pass portability capacity preflight. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:145,183-190]

## Sources

### Primary (HIGH confidence)

- [Phase 18 context](./18-CONTEXT.md) — D18-01–D18-08 and scope boundary, opened with numbered lines.
- [Phase 18 UI specification](./18-UI-SPEC.md) — exact state, copy, route, dedupe, revision, matching, accessibility, and evidence contracts, opened in full with numbered lines.
- [Garmin import ADR](../../architecture/v1.2-garmin-import.md) — architecture, identities, pipeline, security gate, portability, and tests, opened in full with numbered lines.
- [Current package manifest](../../../package.json) — exact existing stack and commands, opened with numbered lines.
- `src/platform/files/expoBackupFilePort.ts` — shipped read-only picker/URI-isolation pattern, opened with numbered lines.
- `src/platform/sqlite/serializedWriter.ts` and `sqliteKernel.ts` — shipped transaction/commit/rollback pattern, opened with numbered lines.
- `src/domains/portability/backupContracts.ts`, `logicalBackupRepository.ts`, migration 23, and Android backup plugin — current allowlist, bounds, generation, capture, and exclusion boundaries, opened with numbered lines.
- `src/bootstrap/workoutAppRuntime.tsx`, `app/_layout.tsx`, and `app/(tabs)/_layout.tsx` — current runtime/provider/route composition, opened with numbered lines.
- `jest.config.js`, `scripts/run-coverage-gate.mjs`, and current test files — current four-project test and integrity-coverage patterns, opened with numbered lines.

### Secondary (MEDIUM confidence)

- https://github.com/garmin/fit-javascript-sdk/releases/tag/21.217.0 — official release/version/date.
- https://github.com/garmin/fit-javascript-sdk/tree/21.217.0 — official SDK README, API, typed-array stream, decoder options, profile and source inspection.
- https://github.com/garmin/fit-javascript-sdk/blob/21.217.0/LICENSE.txt — restrictive FIT Protocol License; human/legal acceptance unresolved.
- https://developer.garmin.com/fit/file-types/activity/ — official Activity/Session/Lap/Record semantics.
- https://developer.garmin.com/fit/cookbook/decoding-activity-files/ — official session/lap association guidance.
- https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/ — SDK 57 File API picker/read-only/read behavior.
- https://docs.expo.dev/versions/v57.0.0/sdk/crypto/ — SDK 57 binary digest API.
- https://docs.expo.dev/versions/v57.0.0/sdk/expo/ — Expo native TextDecoder availability and UTF-8 limitation.
- https://reactnative.dev/docs/0.86/hermes — bundled/default Hermes and release bytecode verification.
- https://reactnative.dev/docs/0.86/performance — JS-thread/frame behavior and release-build performance testing.
- https://owasp.org/www-project-application-security-verification-standard/ and https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html — security categories and hostile-file controls.
- npm registry metadata and `gsd-tools query package-legitimacy check`, queried 2026-10-06 — package versions, publish dates, source links, download signals, postinstall status, and SUS verdicts.

### Tertiary (LOW confidence)

- None presented as authoritative. The five explicit assumptions are isolated in the Assumptions Log.

## Metadata

**Confidence breakdown:**

- Standard stack: MEDIUM — existing packages/versions are repository-verified; the only new decoder remains SUS and license/runtime gated.
- Architecture: HIGH for repository boundaries and locked Phase 18 contracts; MEDIUM for the conditional decoder adapter.
- Pitfalls: HIGH for SQLite/file/portability/routing findings; MEDIUM for external SDK behavior; LOW only where logged as assumptions.

**Research date:** 2026-10-06
**Valid until:** 2026-10-13 for the decoder/version/license gate; 2026-11-05 for stable repository architecture.
