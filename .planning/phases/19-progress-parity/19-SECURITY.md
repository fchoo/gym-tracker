---
phase: 19-progress-parity
status: secured
head: 0932f7c87a189e72db3f3a39e691644efddd9821
audit_head: 0932f7c87a189e72db3f3a39e691644efddd9821
git_tree: 6f1eed92ba9cb97a3a72868acb7167a492dd922f
source_tree_sha256: f5ce741410f171f79c55196246d65c9ae40722068d922225f7d19e16a850ffef
register_authored_at_plan_time: true
threats_total: 41
threats_closed: 41
threats_open: 0
open_non_blocking: 0
accepted_risks: 1
asvs_level: 1
block_on: high
created: 2026-10-13
audited: 2026-10-14
---

# Phase 19 — Security

## SECURED

**Phase:** 19 — Progress Parity

**Exact source implementation:** `0932f7c87a189e72db3f3a39e691644efddd9821`

**Validated Git tree:** `6f1eed92ba9cb97a3a72868acb7167a492dd922f`

**Threats Closed:** 41/41

**ASVS Level:** 1

**Block threshold:** high

Every plan-time mitigation was re-audited against the current merged source.
All 40 mitigated threats have implementation evidence at the declared boundary,
and the one accepted low-severity risk remains explicitly documented. There are
zero blocking and zero non-blocking open threats.

### Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|---|---|---:|---|---|
| T-19-01-01 | Tampering | high | mitigate | `dashboardProjection.ts:42-64` rejects inactive, archived, malformed, sampled, inexact, fixture, and unaccepted facts; `periodProjection.ts:49-76` rejects stale recommendation fences and incompatible metric exposures. |
| T-19-01-02 | Spoofing | high | mitigate | `progressRepository.ts:463-531` joins active identity and lifecycle rows at the same aggregate revision and emits only accepted opaque local identity, revision, exact-distance, time-basis, and summary/lap evidence. |
| T-19-01-03 | Information Disclosure | medium | mitigate | `progressRepository.ts:263-287` reduces failures to allowlisted codes and subject classes; `progressRepository.test.ts:876-958` proves source IDs are absent; no logging call exists in the audited Progress/history/bodyweight modules. |
| T-19-01-04 | Denial of Service | medium | mitigate | `progressRepository.ts:193-206` pages complete ordered source facts in bounded 500-row reads; `FactualHistoryChart.tsx:110-169` samples only SVG decoration and `:253-340` exposes complete data in 100-row owner-requested pages. |
| T-19-02-01 | Tampering | high | mitigate | `progressRepository.ts:702-712,793-867` loads freshness, projection facts, imported facts, current goals, and active Running target sources inside one `readSnapshot`; `workoutAppRuntime.tsx:3240-3246` returns that snapshot directly with no post-snapshot append. |
| T-19-02-02 | Information Disclosure | high | mitigate | `ProgressScreen.tsx:363-409` consumes a narrow typed loader; `progressRepository.ts:263-287` exposes coarse diagnostics only; the audited modules contain no raw-row/provider/bodyweight logging path. |
| T-19-02-03 | Denial of Service | medium | mitigate | `progressRepository.ts:456-496,793-832` applies range predicates and snapshot-local paging; `ProgressScreen.tsx:419-434` consumes the declared 250/1000/4000 ms bounded retry schedule. |
| T-19-02-04 | Repudiation | medium | mitigate | `progressRepository.ts:301-346,498-531` retains effective/accepted source revisions and opaque identities in every projected record. |
| T-19-03-01 | Spoofing | high | mitigate | `ProgressScreen.tsx:395-417` increments a request generation, rejects obsolete completions and sport-mismatched dashboards, and invalidates in-flight reads on dependency change/unmount; `ProgressScreen.test.tsx:203-222` covers the bypass. |
| T-19-03-02 | Tampering | high | mitigate | `dashboardProjection.ts:123-185,323-395` prepares gap, comparator, target, status, history, and Running pacing facts below presentation; `ProgressScreen.tsx:193-205` renders `goal.gap` and `goal.pacing` without re-deriving analytics. |
| T-19-03-03 | Information Disclosure | medium | mitigate | `app/(tabs)/progress.tsx:21-22,59-99`, `exercise-history/[exerciseId].tsx:24-51,78-102`, and `importedActivityRoute.ts:14-35` allowlist opaque local IDs, internal origins, revisions, and bounded return tokens. |
| T-19-03-04 | Denial of Service | medium | mitigate | `ProgressScreen.tsx:411-434` combines event/generation reloads, three bounded automatic attempts, cancellation, and explicit manual retry; timer and cancellation behavior is covered at `ProgressScreen.test.tsx:284-353`. |
| T-19-04-01 | Tampering | high | mitigate | `FactualHistoryChart.tsx:110-169` derives visual coordinates from a sampled decoration while `:253-340` derives Latest/Best/Target/Gap, labels, data rows, and source actions from the original immutable series. |
| T-19-04-02 | Spoofing | medium | mitigate | `RunningHistorySheet.tsx:39-66` requires positive accepted source revisions and summary/lap evidence; rebuilding suppresses final actions, while `garmin/activity/[activityId].tsx:85-109,206-228` revalidates the requested Progress revision. |
| T-19-04-03 | Denial of Service | medium | mitigate | `FactualHistoryChart.tsx:114-169` deterministically bounds ordinary SVG points while retaining mandatory extrema/crossings; `:328-339` pages complete untruncated data rows. |
| T-19-04-04 | Information Disclosure | medium | mitigate | `FactualHistoryChart.tsx:253-340` renders owner-facing dates, values, statuses, basis text, and opaque local source identity/revision only; no raw provider payload, route sample, or diagnostic identifier crosses the port. |
| T-19-05-01 | Tampering | high | mitigate | `relativeStrength.ts:33-88` enforces owner-local at-or-before selection, active lifecycle, exact 100 g units, valid revisions, and deterministic date/time/revision/fact-ID ordering. |
| T-19-05-02 | Information Disclosure | high | mitigate | `historyRepository.ts:1023-1037,1069-1105` keeps owner/fact identity inside SQLite and projects only the selected grams/date basis; `historyRepository.test.ts:1300-1317` proves owner namespace and fact ID do not escape. |
| T-19-05-03 | Spoofing | medium | mitigate | `exercise-history/[exerciseId].tsx:24-51,78-102` rejects arrays, non-opaque IDs, unsafe labels/origins/tokens, and routes only to the fixed internal session destination with a positive revision. |
| T-19-05-04 | Tampering | high | mitigate | `historyRepository.ts:959-1106` loads freshness, raw/effective sessions, targets, source revisions, and bodyweight bases through one snapshot; `historyRepository.test.ts:1232-1389` proves one-snapshot and concurrent-writer behavior. |
| T-19-06-01 | Tampering | high | mitigate | `running/commands.ts:147-194` validates hash/revision/target input; `runningPlanRepository.ts:456-612` performs receipt replay, compare-and-swap, write, read-back, plan revision, event, and receipt in one `kernel.write`; `serializedWriter.ts:48-80` commits before acknowledgment. |
| T-19-06-02 | Repudiation | medium | mitigate | `runningPlanRuntime.tsx:117-157` retains one request envelope/hash and authoritative result; `runningPlanRepository.ts:457-476,605-610` replays immutable result JSON and rejects changed request identity; `running-foundation.test.ts:69-87` proves one revision/receipt. |
| T-19-06-03 | Spoofing | high | mitigate | `runningPlanRuntime.tsx:149-157` acknowledges only committed/already-committed authoritative read-back; `ProgressScreen.tsx:580-590` requires the exact returned plan and goal revisions before root success feedback. |
| T-19-06-04 | Denial of Service | low | accept | Accepted risk `AR-19-01` remains documented below; `running/commands.ts:147-170` synchronously rejects malformed local target input before SQLite. |
| T-19-07-01 | Tampering | high | mitigate | `workoutOutcomeRepository.ts:2771-2934` validates immutable evidence/metric/source/target fences, supersedes stale evidence without target writes, and compare-and-swaps every target row before lifecycle commit. |
| T-19-07-02 | Repudiation | high | mitigate | `workoutAppRuntime.tsx:4680-4743` routes completion and Progress Keep/Use through one full decision envelope; `workoutOutcomeRepository.ts:528-581,2716-3025` canonicalizes SHA-256 requests and writes durable receipts for accepted, rejected, and superseded outcomes. Backup/restore include both receipt tables, and `mergePlan.ts:1533-1595` remaps/hash-validates/preserves them; real-SQLite retention is asserted at `logicalMergeRepository.test.ts:2330-2381`. |
| T-19-07-03 | Elevation of Privilege | medium | mitigate | `RecommendationSurface.tsx:161-197,231-310` calls commands only from named Keep/Use actions; cancellation has no command callback, and `RecommendationSurface.test.tsx:135-156` covers Close, Back, Escape, scrim, and unmount. |
| T-19-07-04 | Spoofing | high | mitigate | `ProgressScreen.tsx:473-496` requires a matching committed lifecycle after authoritative refresh and keeps `superseded` non-success; `ProgressScreen.test.tsx:541-568` proves no success feedback on supersession. |
| T-19-08-01 | Tampering | high | mitigate | `bodyweight/contracts.ts:115-142` validates identities, canonical hash, expected revision, date/timezone, and exact 100 g bounds; `bodyweightRepository.ts:77-138` rehashes, replays, compare-and-swaps, writes, and reads back in one exclusive transaction. |
| T-19-08-02 | Information Disclosure | high | mitigate | Audited bodyweight/progress modules contain no logging call; `workoutAppRuntime.tsx:3258-3275` strips owner/revision-event internals from the UI port and discloses measurements only after explicit owner navigation. |
| T-19-08-03 | Repudiation | medium | mitigate | `bodyweightRepository.ts:79-138` replays hash-bound retained results; migration `0031_bodyweight_source_history.ts:24-60` stores immutable revision/tombstone events and receipts; integration coverage exercises restart, stale, changed-request, and corrupt-receipt paths. |
| T-19-08-04 | Elevation of Privilege | high | mitigate | Bodyweight authority remains repository-separated, and `bodyweight-history.test.ts:44-71,74-101` hashes exact target, recommendation, receipt, import, session, exercise, and set rows before/after every bodyweight lifecycle mutation. |
| T-19-09-01 | Elevation of Privilege | high | mitigate | `ProgressScreen.tsx:455-461,499-506,541-620` owns one local surface at a time; `BottomSheet.tsx:114-165,214-322` rejects nesting and makes the background modal/inert with no-write cancellation. |
| T-19-09-02 | Spoofing | high | mitigate | Target success requires exact plan/goal read-back at `ProgressScreen.tsx:580-590`; recommendation success requires committed lifecycle at `:473-496`; bodyweight runtime requires repository/history read-back before returning updated entries. |
| T-19-09-03 | Tampering | medium | mitigate | `ProgressScreen.tsx:363-434,436-453,548-551` retains selection, scroll, and exact focus independently from fetched snapshots while rejecting obsolete reads and timers. |
| T-19-09-04 | Information Disclosure | medium | mitigate | `app/(tabs)/progress.tsx:54-108` composes only typed runtime and fixed route adapters; `ProgressScreen.tsx` has no SQLite/provider import and receives opaque local identities only. |
| T-19-10-01 | Tampering | high | mitigate | `run-phase19-host-evidence.mjs:160-277` binds clean HEAD/tree, bounded command outputs, producer hash, contract, benchmark, and coverage artifacts; `verify-phase19-evidence.mjs:249-387` rehashes every retained byte and current source. `run-phase19-native-evidence.mjs:235-350,486-555` accepts the exact full build-producer schema and independently derives manifest/producer/flow/APK/installed/device identities. |
| T-19-10-02 | Spoofing | high | mitigate | `app/__native-contracts.tsx:412-428,546-576` gates Progress contracts behind packaged development-test configuration; `run-native-sqlite-contracts.mjs:493-610` requires the exact manifest, real native contract totals, zero failed/skipped cases, and installed APK bytes matching the retained APK. Phase 19 still reports native `NOT_RUN`. |
| T-19-10-03 | Information Disclosure | high | mitigate | `verify-phase19-evidence.mjs:166-194,249-251,411-497` recursively rejects sensitive keys/values before accepting host or native evidence; contract/native artifacts expose only allowlisted counts, timings, statuses, and hashes. |
| T-19-10-04 | Denial of Service | medium | mitigate | Host commands are capped by `run-phase19-host-evidence.mjs:26-30,71-105`; benchmark samples, output, subprocess time, and query rows are capped at `benchmark-phase19-progress.mjs:17-54,123-129,224-232,275-308`; native artifacts/operations are capped at `run-phase19-native-evidence.mjs:35-36,164-175,353-378,579-688`, with device-setting restoration in `finally`. |
| T-19-10-05 | Repudiation | medium | mitigate | `verify-phase19-evidence.mjs:21-152,197-212,302-324` requires exactly ordered PRO-01..18 requirements, evidence IDs, task IDs, case IDs, test IDs, 18 passed contract cases, canonical hashes, and zero skipped cases. |

## Critical Closure Traces

- **One-snapshot source authority:** Progress facts and editable Running target
  sources are loaded by one `readSnapshot`; runtime performs no later target
  query. Exercise history likewise joins freshness, effective/raw sessions,
  targets, source revisions, and bodyweight bases in one snapshot.
- **Prepared presentation facts:** comparator, gap, current/at-date target,
  status, complete history, and Running pacing are produced below the screen.
  Presentation renders typed facts and does not replay SQL/JSON/comparison math.
- **Mandatory recommendation receipts:** every production completion/Progress
  Keep/Use caller uses the shared fenced command; current-schema outcomes,
  including superseded decisions, are SHA-256 receipt-bound. Backup, restore,
  duplicate/archive/local/keep-both merge paths preserve both receipt graphs.
- **No false superseded success:** a superseded repository result remains
  superseded after refresh and cannot enqueue target-kept/updated feedback.
- **Protected bodyweight boundary:** byte/value SHA-256 digests cover protected
  target, recommendation, receipt, import, workout, exercise, and set rows; the
  test no longer treats unchanged row counts as unchanged protected state.
- **Bounded long-running paths:** repository reads page to completion, factual
  data pages at 100 rows while SVG is visual-only sampled, refresh attempts are
  finite, and host/native/ADB subprocesses, outputs, artifacts, and sample arrays
  have hard limits and cleanup/restoration paths.
- **Evidence identity:** the native consumer now validates the complete schema
  emitted by `build-current-native-test-apk.sh`, hashes that manifest and its
  producer, and recomputes retained/APK/installed/device/configuration/output
  identities rather than trusting caller-supplied hash-shaped strings.

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---|---|---|---|---|
| AR-19-01 | T-19-06-04 | Local malformed-input churn is bounded and rejected synchronously before SQLite; the residual local form-retry cost is tolerable. | Phase 19 Plan 06 disposition | 2026-10-13 |

## Backup / Restore / Merge Verification

- Schema v45 creates immutable recommendation decision receipt tables and
  backup-generation triggers (`0045_recommendation_decision_receipts.ts:4-58`).
- Logical backup v10 includes both receipt tables and owner-graph filters
  (`backupContracts.ts:59,88,138-139`; `logicalBackupRepository.ts:96,125`).
- Restore suspends/restores immutable triggers for both receipt tables
  (`logicalRestoreRepository.ts:79-109`).
- Merge remaps recommendation IDs, resolves keep-both request-ID collisions,
  validates canonical hashes/decisions/results, and rewrites retained result
  identity (`mergePlan.ts:537-565,1533-1595`).

## Phase 20 Native Deferral

No Android build/install, adb/device/Maestro execution, native capture, attended
Samsung review, or release acceptance was run. This remains deliberately
`native_status: NOT_RUN`, overall `status: REVIEW_REQUIRED`, and Phase 20-owned.
The deferral is not a threat or an unregistered flag. The Phase 19 source
prevents pre-execution native PASS and rejects execution without explicit Phase
20 authority (`run-phase19-native-evidence.mjs:557-588,691-708`).

## Unregistered Flags

None. No Phase 19 summary contains an exact `## Threat Flags` section. The
ancillary Threat Surface, Threat Mitigations, Known Stubs, and Native Deferrals
notes map to the registered threats above and add no unmapped attack surface.

## Verification Run

The final re-audit verified exact source implementation
`0932f7c87a189e72db3f3a39e691644efddd9821`, Git tree
`6f1eed92ba9cb97a3a72868acb7167a492dd922f`, and implementation source-tree
digest `f5ce741410f171f79c55196246d65c9ae40722068d922225f7d19e16a850ffef`.

| Check | Result |
|---|---|
| Phase 19 evidence contracts | PASS — 20/20, including retained-byte rehashing, identity/omission/privacy rejection, timeout/cap checks, and Phase 20 authority |
| Exact integrity coverage | PASS — 312 suites / 4,629 tests; 25 owners and four changed-line scopes at 100% |
| Progress parity requirement registry | PASS — all 18 ordered PRO records retained with source status PASS |
| Production-workload host benchmark | PASS with required sample counts, query-row cap 500, bounded subprocess/output contracts, source hash, result hash, and native `NOT_RUN` |
| Canonical host evidence collector | PASS — all 7 commands completed and the retained verifier accepted the source-bound manifest |
| Native execution | `NOT_RUN` / `REVIEW_REQUIRED` — Phase 20-owned and not a Phase 19 finding |

## Security Audit Trail

| Audit Date | Exact HEAD | Threats Total | Closed | Open | Blocking Open | Result |
|---|---|---:|---:|---:|---:|---|
| 2026-10-13 | `fd2877c99d697118fef8cf6ba47e27521d116a25` | 41 | 29 | 12 | 7 | OPEN_THREATS |
| 2026-10-13 | `e7eea042779bf0c9b426924f672c494267cccb0f` | 41 | 41 | 0 | 0 | SECURED |
| 2026-10-14 | `d97ea569fc6f8671df94f68e64635c55d06864aa` | 41 | 41 | 0 | 0 | SECURED |
| 2026-10-14 | `0932f7c87a189e72db3f3a39e691644efddd9821` | 41 | 41 | 0 | 0 | SECURED |

**threats_open:** 0
