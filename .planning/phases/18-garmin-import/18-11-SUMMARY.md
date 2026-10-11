---
phase: 18-garmin-import
plan: 11
subsystem: garmin-portability
tags: [garmin, portability, sqlite, backup, android, privacy, tdd]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: Owner-scoped source-graph merge, projection reconciliation, and one-generation bulk handover
  - phase: 18-07
    provides: Accepted Garmin source envelopes, immutable revisions, receipts, and capacity fences
  - phase: 18-09
    provides: Revision-fenced confirmed match events and rebuildable current-match projection
provides:
  - Canonical clean restore and owner/account-isolated merge proof for accepted Garmin source and match graphs
  - Conflict, remap, tombstone, capacity, tamper, idempotent replay, and post-publication rebuild enforcement
  - Real-SQLite automatic-backup generation proof for retained source/match rows and neutral projections
  - Android cloud-backup and device-transfer exclusions for encrypted Garmin sessions and response staging
affects: [18-12, 18-13, 18-14, 19-progress, 20-native-acceptance, automatic-backup]
actuals:
  tokens: 12440
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns: [canonical source-graph equality, accepted-identity conflict preview, dependency-ordered remap, source-first projection rebuild, exclusion-only Android backup rules]
key-files:
  created:
    - tests/integration/garmin-import-portability.test.ts
    - plugins/withAndroidBackupRules.test.ts
  modified:
    - src/testing/contracts/portableMerge.contract.ts
    - src/testing/contracts/portableMerge.contract.test.ts
    - src/domains/portability/mergePlan.ts
    - src/platform/sqlite/repositories/logicalMergeRepository.ts
    - tests/integration/automatic-drive-backup.test.ts
    - plugins/withAndroidBackupRules.ts
key-decisions:
  - "A source graph is a duplicate only when its canonical accepted graph matches exactly; any overlapping accepted account identity with different durable facts is a preview conflict, never an overwrite."
  - "Portable owner namespaces reject foreign archives, while Garmin account namespace remains part of source identity so equal external IDs or payload hashes across accounts never coalesce."
  - "Match/lifecycle projections remain non-portable and rebuild only after source publication; source reads, exact replay, and rebuild do not advance backup generation."
  - "Android backup configuration remains exclusion-only and names both garmin-session and garmin-response-staging in every applicable legacy, cloud, and device-transfer domain."
patterns-established:
  - "Garmin portability tracer: accepted envelope, raw-component hashes, receipt, revision, and match event survive canonical restore while authorization terms remain absent."
  - "Source conflict policy: whole-graph canonical equality is the only duplicate path once an accepted source identity overlaps."
requirements-completed: []
requirements-advanced: [GAR-08, GAR-09, GAR-14]
coverage:
  - id: D18-11-CLEAN-RESTORE
    description: Accepted Garmin source facts and one confirmed match round-trip canonically without authorization, then rebuild current relations from events
    requirement: GAR-08
    verification:
      - kind: unit
        ref: src/testing/contracts/portableMerge.contract.test.ts#portable-merge-garmin-clean-restore
        status: pass
      - kind: integration
        ref: tests/integration/garmin-import-portability.test.ts
        status: pass
    human_judgment: false
  - id: D18-11-MERGE-SAFETY
    description: Exact replay, conflict preview, owner/account isolation, remap, tombstone, pinned match, dangling reference, tamper, and capacity boundaries fail safe
    requirement: GAR-09
    verification:
      - kind: unit
        ref: src/testing/contracts/portableMerge.contract.test.ts#Garmin merge cases
        status: pass
      - kind: integration
        ref: tests/integration/garmin-import-portability.test.ts
        status: pass
    human_judgment: false
  - id: D18-11-BACKUP-BOUNDARY
    description: Retained source/match rows advance backup generation once while projections and rebuild remain neutral; token/staging paths are excluded from Android backup and transfer
    requirement: GAR-07
    verification:
      - kind: integration
        ref: tests/integration/automatic-drive-backup.test.ts
        status: pass
      - kind: unit
        ref: plugins/withAndroidBackupRules.test.ts
        status: pass
    human_judgment: false
duration: 17m 44s
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 11: Garmin Import Portability and Backup Boundaries Summary

**Accepted Garmin envelopes, immutable receipts/revisions, tombstones, and confirmed match events now restore and merge canonically while authorization stays disconnected and encrypted session/native staging paths remain excluded from Android backup and transfer.**

## Performance

- **Duration:** 17m 44s
- **Started:** 2026-10-11T11:06:59Z
- **Completed:** 2026-10-11T11:24:43Z
- **Tasks:** 3
- **Files changed:** 8
- **Commits:** 6 TDD commits plus this metadata commit

## Accomplishments

- Extended the portable-merge contract with clean restore, exact replay, changed accepted revision, owner/account isolation, colliding identity remap, removed activity, pinned match, dangling reference, and capacity-limit cases against real SQLite.
- Made accepted source identity overlap fail closed as a preview conflict unless the complete source graph is canonically identical, and made duplicate source-graph plans valid zero-write writer operations.
- Proved current match/lifecycle relations are not imported as authority, are rebuilt after source publication, and do not change source canonical state or automatic-backup generation.
- Added exclusion-only Android backup templates for `garmin-session` and `garmin-response-staging` across legacy full backup, cloud backup, and device transfer without broadening any inclusion.

## Task Commits

1. **18-11-01 RED — clean-restore portability tracer:** `10d53c5f`
2. **18-11-01 GREEN — accepted Garmin source and match restore:** `2d92ed0a`
3. **18-11-02 RED — merge/remap/conflict safety matrix:** `fd7acffb`
4. **18-11-02 GREEN — owner-safe conflict, remap, tombstone, and replay behavior:** `d24a4853`
5. **18-11-03 RED — generation and Android exclusion boundaries:** `33fa2615`
6. **18-11-03 GREEN — Garmin token/staging backup exclusions:** `fea4c9bc`

## Files Created/Modified

- `src/testing/contracts/portableMerge.contract.ts` — production-quality contract fixtures and cases for clean restore, exact replay, accepted revision conflict, owner/account isolation, ID remap, removal/match history, and adversarial rejection.
- `src/testing/contracts/portableMerge.contract.test.ts` — exact manifest and zero-skip host contract gate for all new Garmin portability cases.
- `tests/integration/garmin-import-portability.test.ts` — dedicated host-SQLite integration harness requiring every Garmin contract case to pass.
- `src/domains/portability/mergePlan.ts` — canonical source duplicate/conflict classification and accurate conflict preview counting.
- `src/platform/sqlite/repositories/logicalMergeRepository.ts` — source-graph duplicate validation that no longer falls through the custom-exercise path.
- `tests/integration/automatic-drive-backup.test.ts` — real migrated-SQLite generation deltas, projection neutrality, read neutrality, and two-pass reconciliation proof.
- `plugins/withAndroidBackupRules.ts` — exclusion-only Garmin session and response-staging rules for full backup, cloud backup, and device transfer.
- `plugins/withAndroidBackupRules.test.ts` — deterministic rule-count and no-inclusion-broadening assertions.

## Decisions Made

- Accepted source identity is `(source_kind, account_namespace, external_activity_id)`. Matching external IDs or normalized hashes outside that namespace never imply ownership or deduplication.
- A changed accepted graph for an existing source identity is a conflict for review. It cannot become an insert, partial overwrite, tombstone revival, or stale match attachment.
- Exact full-graph replay remains a zero-write `ready` outcome and does not advance automatic-backup generation.
- Source/match rows retain their own automatic-backup trigger ownership. Rebuildable current lifecycle/current match rows are restored under trigger suspension or have no source-generation trigger, so projection work stays neutral.
- `garmin-session` is already rooted under Android `noBackupFilesDir`; explicit template exclusions are retained as defense in depth and do not imply live SQLite encryption.

## TDD Gate Compliance

- Task 1: RED `10d53c5f` → GREEN `2d92ed0a`.
- Task 2: RED `fd7acffb` → GREEN `d24a4853`.
- Task 3: RED `33fa2615` → GREEN `fea4c9bc`.
- Every RED failed for the intended missing contract or exclusion behavior before its GREEN implementation.

## Verification

- `npm run test:unit -- --runInBand src/testing/contracts/portableMerge.contract.test.ts plugins/withAndroidBackupRules.test.ts` — 6 passed.
- `npm run test:integration -- --runInBand tests/integration/garmin-import-portability.test.ts tests/integration/automatic-drive-backup.test.ts` — 6 passed against real migrated SQLite.
- `npm run typecheck -- --pretty false` — passed.
- `npm run check:boundaries` — passed across 391 files.

No full/global SQLite-host or integration suite, coverage gate, APK/device/native operation, visual/accessibility/performance check, release, push, PR, publication, or deployment was performed. Phase 20 retains that checkpoint. The pre-existing schema-27 `dirty_since_ms` global debt was not touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Previewed changed accepted source identities as conflicts**
- **Found during:** Task 18-11-02
- **Issue:** The source planner treated a changed graph with the same accepted account identity as another insert, allowing the writer path to discover uniqueness conflict too late instead of presenting a fail-closed preview.
- **Fix:** Whole-graph canonical equality remains the duplicate path; any overlapping accepted source identity with different durable facts now becomes a conflict operation with an accurate conflict count and no aggregate write.
- **Files modified:** `src/domains/portability/mergePlan.ts`
- **Verification:** Garmin conflict/isolation contract case plus dedicated integration harness passed.
- **Committed in:** `d24a4853`

**2. [Rule 1 - Bug] Admitted duplicate source graphs as zero-write writer plans**
- **Found during:** Task 18-11-02
- **Issue:** `assertFullPlanMatchesLocal` lacked a source-graph branch, so an exact duplicate operation fell through to custom-exercise validation and returned `logical_merge_failed` instead of an idempotent no-op.
- **Fix:** Added owner-bound source-graph validation before the exercise path. Exact replay now returns `ready`, keeps canonical state unchanged, and advances generation zero times.
- **Files modified:** `src/platform/sqlite/repositories/logicalMergeRepository.ts`
- **Verification:** Exact-repeat contract case passed in unit and integration runs.
- **Committed in:** `d24a4853`

**3. [Rule 1 - Tracking integrity] Kept broad Garmin requirements pending**
- **Found during:** Final tracking update
- **Issue:** Plan frontmatter references GAR-08, GAR-09, and GAR-14, but those requirements also include native typed reads, complete sync recovery, and user-facing confirm flows owned by the remaining Phase 18 terminal plans.
- **Fix:** Recorded Plan 18-11 automated coverage without prematurely checking the three broad requirements complete. GAR-07 was already complete before this plan.
- **Files modified:** `.planning/REQUIREMENTS.md` remains unchanged for these rows.
- **Verification:** Requirement checklist and traceability rows remain Pending for GAR-08, GAR-09, and GAR-14.
- **Committed in:** final metadata commit

---

**Total deviations:** 3 auto-fixed (1 Rule 2, 2 Rule 1).
**Impact on plan:** The first two fixes are directly required for merge correctness and idempotency. The tracking adjustment prevents false milestone completion and leaves implementation scope unchanged.

## Issues Encountered

- The first tracer GREEN run exposed a fixture-only mistake: migration 22 had already auto-allocated an immutable custom-plan portable ID, so a later fixture update correctly failed with `portable_identity_immutable`. The update was removed; no production identity rule changed.
- The merge matrix then exposed the two production defects documented above. Both were fixed within the planned portability boundary and reverified before Task 2 was committed.

## Authentication Gates

None. No Garmin credentials, MFA, encrypted token bytes, account calls, external provider requests, or secret-bearing inputs were used.

## Known Stubs

None. Empty arrays, objects, nullable values, and SQL placeholder variables found by the scan are bounded test fixtures or established implementation structures, not UI/runtime stubs.

## Threat Flags

None. No unplanned endpoint, authentication authority, filesystem reader, schema, or network surface was added. The planned archive trust boundary and Android backup boundary were narrowed by validation and exclusion-only rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 18-12 can consume a deterministic, owner-safe portability checkpoint without expanding authorization or backup scope.
- Plan 18-13 can prove real token/logout/native adversarial behavior knowing imported source and match history remain disconnected and recoverable.
- Plan 18-14 can audit requirement coverage while GAR-08, GAR-09, and GAR-14 correctly remain pending until their broader terminal evidence is complete.
- Phase 20 retains global SQLite/integration/coverage, APK/device/native, visual/accessibility/performance, and release acceptance.
- Dirty Phase 14 evidence files and untracked `14-VERIFICATION.md` remain untouched and unstaged.

## Self-Check: PASSED

- Confirmed all eight changed implementation/test files and this summary exist on disk.
- Confirmed all six RED/GREEN task commits are reachable and carry the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- Confirmed GAR-08, GAR-09, and GAR-14 remain Pending in both the requirement checklist and traceability table.
- Confirmed the only unrelated working-tree changes remain the preserved Phase 14 evidence files and untracked `14-VERIFICATION.md`.

---
*Phase: 18-garmin-import*
*Completed: 2026-10-11*
