---
phase: 19-progress-parity
status: open_threats
head: fd2877c99d697118fef8cf6ba47e27521d116a25
register_authored_at_plan_time: true
threats_total: 41
threats_closed: 29
threats_open: 7
open_non_blocking: 5
accepted_risks: 1
asvs_level: 1
block_on: high
created: 2026-10-13
audited: 2026-10-13
---

# Phase 19 — Security

## OPEN_THREATS

**Phase:** 19 — Progress Parity

**Exact HEAD:** `fd2877c99d697118fef8cf6ba47e27521d116a25`

**Closed:** 29/41 | **Open:** 12/41

**ASVS Level:** 1

**Block threshold:** high

The audit treated all plan-time mitigations as absent until current code or tests
proved them. Seven high-severity threats remain blocking. Five medium-severity
threats remain open below the configured threshold and do not contribute to
`threats_open`.

### Closed

| Threat ID | Category | Severity | Disposition | Evidence |
|---|---|---:|---|---|
| T-19-01-01 | Tampering | high | mitigate | `dashboardProjection.ts:27-38` rejects inactive, unaccepted, fixture, invalid-ID/revision, non-exact, and sampled Running facts; `periodProjection.ts:52-74` rejects invalid revisions, stale recommendations, ineligible metrics, and incompatible exposures. |
| T-19-01-02 | Spoofing | high | mitigate | `progressRepository.ts:423-476` joins active identity/lifecycle rows at one aggregate revision and emits only opaque local identity, accepted state, revision, and source-summary/lap eligibility; `dashboardProjection.test.ts:53-73` covers sampled/unaccepted/removed/malformed/fixture rejection. |
| T-19-01-03 | Information Disclosure | medium | mitigate | `progressRepository.ts:238-262` reduces diagnostics to allowlisted codes and subject classes; `progressRepository.test.ts:752-788` proves source IDs are absent; no logging calls exist in the audited Progress/history/bodyweight modules. |
| T-19-02-02 | Information Disclosure | high | mitigate | `ProgressScreen.tsx:22-49` exposes typed ports only; `progressRepository.ts:238-262` returns coarse diagnostics; `progressRepository.test.ts:550-593` proves provider payload and removed-source data are absent from runtime output. |
| T-19-02-04 | Repudiation | medium | mitigate | `progressRepository.ts:463-476` preserves accepted activity identity/revision and `historyRepository.ts:1080-1100` preserves corrected/effective session revisions in projected rows. |
| T-19-03-01 | Spoofing | high | mitigate | `ProgressScreen.tsx:300-318` increments a request generation and rejects obsolete completions or sport-mismatched projections; `ProgressScreen.test.tsx:178` exercises stale-result rejection. |
| T-19-03-03 | Information Disclosure | medium | mitigate | `app/(tabs)/progress.tsx:21-22,59-92`, `exercise-history/[exerciseId].tsx:24-51,78-101`, and `importedActivityRoute.ts:14-35` allowlist opaque local IDs, origins, revisions, and return-token shapes. |
| T-19-04-01 | Tampering | high | mitigate | `FactualHistoryChart.tsx:109-170` derives sampled SVG points from the immutable series while `FactualHistoryChart.tsx:252-329` derives summary/data/source actions from the original series, not chart coordinates. |
| T-19-04-02 | Spoofing | medium | mitigate | `RunningHistorySheet.tsx:36-58` requires positive source revision and accepted source-summary/lap evidence; `RunningHistorySheet.tsx:92-116` suppresses source actions during rebuild; imported detail rechecks the expected revision at `workoutAppRuntime.tsx:2987-3035`. |
| T-19-04-04 | Information Disclosure | medium | mitigate | `FactualHistoryChart.tsx:199-231,276-329` exposes owner-facing date/value/status and opaque source identity only; raw provider payloads, route samples, and diagnostic identifiers are not rendered. |
| T-19-05-01 | Tampering | high | mitigate | `relativeStrength.ts:33-88` enforces active at-or-before facts, exact 100 g units, valid revisions, and deterministic date/time/revision/fact-ID ordering; `relativeStrength.test.ts:27-96` covers tombstones, future dates, ties, and invalid facts. |
| T-19-05-02 | Information Disclosure | high | mitigate | `historyRepository.ts:442-475` projects only the selected grams/date basis without owner identity; `historyRepository.test.ts:1232-1317` verifies the owner namespace does not escape; UI disclosure is confined to the owner-opened history/Relative surfaces. |
| T-19-05-03 | Spoofing | medium | mitigate | `exercise-history/[exerciseId].tsx:24-51,65-101` rejects non-scalar or non-opaque IDs, non-allowlisted origins/return tokens, and routes only to the fixed internal session destination. |
| T-19-05-04 | Tampering | high | mitigate | `historyRepository.ts:959-1106` loads freshness, effective/raw sessions, targets, source revisions, and bodyweight basis through one `readSnapshot`; `historyRepository.test.ts:1232-1391` covers one-snapshot and concurrent-writer behavior. |
| T-19-06-01 | Tampering | high | mitigate | `running/commands.ts:147-194` validates canonical target/revision inputs; `runningPlanRepository.ts:393-549` performs receipt lookup, compare-and-swap, target write, read-back, plan revision, event, and receipt in one `kernel.write`; `serializedWriter.ts:48-80` uses `BEGIN IMMEDIATE` and commit-before-return. |
| T-19-06-02 | Repudiation | medium | mitigate | `runningPlanRuntime.tsx:114-156` retains a stable request envelope/hash; `runningPlanRepository.ts:395-414,511-547` replays immutable result JSON and rejects changed request identity; `running-foundation.test.ts:69-89` proves one revision/receipt. |
| T-19-06-03 | Spoofing | high | mitigate | `runningPlanRuntime.tsx:148-156` requires authoritative aggregate read-back at the expected goal revision; `RunningTargetSheet.tsx:159-180` acknowledges only the resolved runtime result and preserves failure state. |
| T-19-06-04 | Denial of Service | low | accept | Documented as `AR-19-01`; `running/commands.ts:147-169` and `RunningTargetSheet.tsx:144-158` synchronously bound malformed local input before SQLite. |
| T-19-07-01 | Tampering | high | mitigate | `workoutOutcomeRepository.ts:2540-2597,2603-2708` validates evidence/metric/source/target fences, supersedes stale evidence without target writes, and uses target compare-and-swap; `load-reps.test.ts:1401-1581` covers stale, voided, incomplete, and malformed evidence. |
| T-19-07-03 | Elevation of Privilege | medium | mitigate | `RecommendationSurface.tsx:158-194,228-306` sends commands only from named Keep/Use actions; shared `BottomSheet` cancellation has no command callback; `RecommendationSurface.test.tsx:133-154` covers close, Back, Escape, scrim, and unmount. |
| T-19-08-01 | Tampering | high | mitigate | `bodyweight/contracts.ts:115-142` validates identity/hash/revision/date/timezone/exact 100 g bounds; `bodyweightRepository.ts:79-138` rehashes, replays receipts, compare-and-swaps revision, writes/read-backs in one exclusive transaction. |
| T-19-08-02 | Information Disclosure | high | mitigate | Audited bodyweight/progress modules contain no logging calls; `workoutAppRuntime.tsx:3272-3289` strips owner/revision-event internals from the UI port; settings/history/editor surfaces disclose values only after explicit owner navigation. |
| T-19-08-03 | Repudiation | medium | mitigate | `bodyweightRepository.ts:85-138` replays hash-bound retained results; migration `0031_bodyweight_source_history.ts:24-60` stores append-only revision/tombstone events and immutable receipts; `bodyweight-history.test.ts:74-103` covers replay and lifecycle transitions. |
| T-19-09-01 | Elevation of Privilege | high | mitigate | `ProgressScreen.tsx:333-347,369-373,385-386,443-502` maintains one local surface at a time; `BottomSheet.tsx:114-116,285-323` rejects nesting and provides modal/inert dismissal behavior. |
| T-19-09-03 | Tampering | medium | mitigate | `ProgressScreen.tsx:275-318` keeps sport/range/retry state outside fetched snapshots and rejects obsolete reads; `ProgressScreen.tsx:288-331,408-415` retains scroll/focus state independently. |
| T-19-09-04 | Information Disclosure | medium | mitigate | `app/(tabs)/progress.tsx:54-101` composes only typed runtime and fixed route adapters; `ProgressScreen.tsx:1-20` has no SQLite/platform import; route identities are bounded and opaque. |
| T-19-10-02 | Spoofing | high | mitigate | `app/__native-contracts.tsx:394-561` gates the real Expo runner behind development-test configuration; `run-native-sqlite-contracts.mjs:500-577` requires all cases passed, zero skipped, and installed APK bytes matching retained APK; automated-only evidence remains `NOT_RUN`/`REVIEW_REQUIRED`. |
| T-19-10-03 | Information Disclosure | high | mitigate | `verify-phase19-evidence.mjs:117-153,212-245` enforces exact schemas and recursively rejects sensitive fields/values; `progressParity.contract.ts:44-56,265-293` emits counts, timings, and hashes only; privacy tests pass. |
| T-19-10-05 | Repudiation | medium | mitigate | `verify-phase19-evidence.mjs:16-18,36-111,156-170` requires the exact ordered PRO-01..18 registry, unique evidence IDs, task IDs, and existing refs; `run-native-sqlite-contracts.mjs:303-330,569-577` rejects missing, failed, or skipped native cases. |

### Open (blocking — severity >= high threshold)

| Threat ID | Category | Severity | Mitigation Expected | Files Searched / Gap Evidence |
|---|---|---:|---|---|
| T-19-02-01 | Tampering | high | One snapshot must cover freshness and every fact returned to the Progress UI. | `progressRepository.ts:618-835` is one snapshot, but `workoutAppRuntime.tsx:3230-3259` appends `runningTargetSources` using a post-snapshot `kernel.queryAll` plus separate aggregate reads. The returned UI snapshot can therefore mix dashboard and target-source revisions. |
| T-19-03-02 | Tampering | high | The screen must consume prepared facts and contain no comparator/analytics logic. | `ProgressScreen.tsx:69-79` computes the target gap and direction; `ProgressScreen.tsx:193-210` recomputes pace and 400 m/200 m splits. The screen does not consume `deriveRunningPacing` output, so the declared boundary is absent. |
| T-19-07-02 | Repudiation | high | Every Keep/Use decision needs an explicit decision field, canonical hash, durable receipt, and retained lifecycle record. | `workoutAppRuntime.tsx:4693-4714` still exposes legacy Keep/Use entry points with only recommendation ID/time. `workoutOutcomeRepository.ts:2519-2561,2734-2777` writes a receipt only when `explicitDecisionEnvelope` is true, leaving callable receiptless decision paths. |
| T-19-07-04 | Spoofing | high | Success only after committed/already-committed authoritative read-back; stale/superseded outcomes must remain non-success. | `workoutOutcomeRepository.ts:2570-2580` can validly return `superseded`, but `ProgressScreen.tsx:350-363` ignores the returned status and always emits “target updated” or “target kept” after any non-null reload. No test covers superseded-to-toast rejection. |
| T-19-08-04 | Elevation of Privilege | high | Separate bodyweight authority plus protected target/recommendation/session digests. | Repository separation exists, but `bodyweight-history.test.ts:44-52` implements `protectedDigest` as row counts only. Equal counts cannot prove target, recommendation, or session bytes/revisions were unchanged; no actual protected-state digest exists in the Phase 19 code/tests. |
| T-19-09-02 | Spoofing | high | Every cross-surface success message must follow a committed/already-committed authoritative read-back. | Target/bodyweight paths read back, but the shared recommendation path at `ProgressScreen.tsx:350-363` emits success for `superseded` and does not verify the refreshed recommendation/target state. One affected surface leaves this threat open. |
| T-19-10-01 | Tampering | high | Evidence must bind source/tree/APK/installed/config/output hashes through a fail-closed verifier. | `verify-phase19-evidence.mjs:20-32,156-209` hard-codes host `PASS` and checks only that referenced files exist; it consumes no test-result artifact or output hash. In addition, the Phase 19 manifest consumer requires exact reduced keys (`run-phase19-native-evidence.mjs:164-189`) that do not match the actual build manifest emitted by `build-current-native-test-apk.sh:247-294`, so the implemented identity chain is not end-to-end. |

### Open (non-blocking — severity below high threshold)

| Threat ID | Category | Severity | Mitigation Expected | Files Searched / Gap Evidence |
|---|---|---:|---|---|
| T-19-01-04 | Denial of Service | medium | Bounded input plus visual-only sampling while complete ordered evidence remains pageable. | `progressRepository.ts:180-182,327-355,422-442` hard-caps facts at 500 with no cursor/page contract; `FactualHistoryChart.tsx:109-170` samples visuals, but the complete history beyond the cap is unreachable. |
| T-19-02-03 | Denial of Service | medium | Indexed range predicates, batched links, pageable complete data, and bounded refresh attempts. | Date predicates and fixed limits exist at `progressRepository.ts:699-739`, but there is no cursor/page API. `automaticRefresh` is only metadata at `progressRepository.ts:184-192`; repository-wide references show no consumer that schedules the declared bounded backoff. |
| T-19-03-04 | Denial of Service | medium | Event/generation refresh plus bounded fallback and manual retry. | `ProgressScreen.tsx:316-318,375-379` has generation/manual refresh, but never consumes `refresh.automaticRefresh.backoffMs/maxAttempts`; no bounded fallback timer exists. |
| T-19-04-03 | Denial of Service | medium | Deterministic SVG sampling and pageable/virtualized complete data rows. | SVG sampling is present at `FactualHistoryChart.tsx:109-170`, but `FactualHistoryChart.tsx:316-329` eagerly maps every received row and implements neither pagination nor virtualization; upstream all-time data is capped at 500. |
| T-19-10-04 | Denial of Service | medium | Bounded fixtures/subprocesses/timeouts, raw sample caps, one build, and device-setting restoration. | Device-setting restoration exists at `run-phase19-native-evidence.mjs:278-315`, but `benchmark-phase19-progress.mjs:258-269` invokes Jest with `execFileSync` and no timeout; most `adb` commands use `run-native-sqlite-contracts.mjs:285-287` without `timeoutMs`; benchmark validation at `benchmark-phase19-progress.mjs:62-137` has minimum sample counts but no maximum raw-sample cap. |

*Only the seven blocking-open threats count toward `threats_open` in frontmatter.*

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---|---|---|---|---|
| AR-19-01 | T-19-06-04 | Local malformed-input churn is bounded and rejected synchronously before SQLite; the residual local form-retry cost is tolerable. | Phase 19 Plan 06 disposition | 2026-10-13 |

## Backup / Restore / Merge Verification

- Schema v45 creates both immutable recommendation decision receipt tables and backup-generation triggers (`0045_recommendation_decision_receipts.ts:4-58`).
- Logical backup v10 includes both receipt tables and owner-graph filters (`backupContracts.ts:133-140,248-251`; `logicalBackupRepository.ts:92-125`).
- Restore suspends/restores immutable and backup triggers for both receipt tables (`logicalRestoreRepository.ts:75-113`).
- Merge maps receipts into owned-plan aggregates and rejects receipts outside their recommendation closure (`mergePlan.ts:53-75`; `logicalMergeRepository.ts:419-451`; `logicalMergeRepository.test.ts:1828-1838`).

## Phase 20 Native Deferral

No Phase 20 native execution was required or attempted. No retained Phase 19
native artifact exists. Current Phase 19 outputs correctly retain
`native_status: NOT_RUN`, `status: REVIEW_REQUIRED`, and Phase 20 ownership
(`verify-phase19-evidence.mjs:174-209`; `run-phase19-native-evidence.mjs:214-240`).
This deferral is not an unregistered flag. T-19-10-01 remains open for the
independent Phase 19 verifier/manifest-chain gaps stated above, not because the
Phase 20 device run is absent.

## Unregistered Flags

None. No Phase 19 summary contains an exact `## Threat Flags` section. The
ancillary `Threat Surface`, `Threat Mitigations`, `Known Stubs`, and `Native
Deferrals` notes map to existing threat IDs and do not introduce an unmapped
attack surface.

## Verification Run

| Check | Result |
|---|---|
| Focused unit | 11 suites, 67 tests passed |
| Focused components/routes | 11 suites, 77 tests passed; existing non-failing React `act(...)` warnings observed |
| Focused SQLite repositories/portability | 5 suites, 178 tests passed |
| Focused integration | 3 suites, 54 tests passed |
| Progress parity host contract | 1 suite, 2 tests passed |
| Phase 19 benchmark/native/evidence script contracts | 13 tests passed |
| Host synthetic benchmark | passed; native remained `NOT_RUN` |
| Automated-only evidence command | `REVIEW_REQUIRED`; source `PASS`; native `NOT_RUN` |
| TypeScript | `tsc --noEmit` passed |
| Boundary/lint scan | passed across 428 files |

These passing checks demonstrate the controls they exercise; they do not close
the bypasses and omitted controls listed above.

## Security Audit Trail

| Audit Date | Exact HEAD | Threats Total | Closed | Open | Blocking Open | Result |
|---|---|---:|---:|---:|---:|---|
| 2026-10-13 | `fd2877c99d697118fef8cf6ba47e27521d116a25` | 41 | 29 | 12 | 7 | OPEN_THREATS |

Next: implement the missing mitigations, preserve the Phase 20 native deferral,
then re-run `/gsd-secure-phase 19`.

**threats_open:** 7
