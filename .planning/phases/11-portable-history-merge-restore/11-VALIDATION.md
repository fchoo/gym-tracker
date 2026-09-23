---
phase: 11
slug: portable-history-merge-restore
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-23
audited: 2026-09-23
requirements: [DATA-08, DATA-09]
automated_gaps: 0
manual_only: 2
---

# Phase 11 — Validation Strategy

> Retrospective Nyquist audit of portable backup, restore-clean, merge, and lifecycle evidence.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest projects (`unit`, `components`, `sqlite-host`, `integration`) plus Node test runner, real Expo SQLite contracts, and Maestro 2.8.0 |
| **Config file** | `jest.config.js`, `scripts/run-coverage-gate.mjs`, `scripts/run-native-sqlite-contracts.mjs`, `scripts/run-phase11-maestro.mjs` |
| **Quick run command** | `node --test scripts/phase11-evidence-scripts.test.mjs` |
| **Full suite command** | `npm run test:all -- --runInBand && npm run test:coverage -- --runInBand` |
| **Native command** | `npm run test:sqlite:device -- --suite migrations-effects|portable-merge --manifest artifacts/native/phase11/build.json` |
| **UI command** | `npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json` |
| **Latest evidence head** | `4173c72b105315e76c95c4b25538c23ea1eb51e7` |

## Sampling Rate

- **After portability-domain changes:** Run focused unit plus host SQLite suites.
- **After writer/contract changes:** Run integration, exact coverage, and both real Expo SQLite suites.
- **After recovery UI/evidence changes:** Run component tests, the 7-case evidence-script suite, and Phase 11 Maestro.
- **Before phase completion:** Typecheck, lint/boundaries, full Jest, exact integrity coverage, migrations 13/13, portable merge 13/13, and Maestro 4/4 must all be green.
- **Watch mode:** Prohibited for completion evidence.

## Requirement and Decision Coverage

| Contract | Coverage | Primary Evidence | Status |
|----------|----------|------------------|--------|
| D-01 per-class conflict rules | Planner unit matrix, host writer/reconciliation, integration, native mixed/keep-both/dedup/settings/session cases | `mergePlan.test.ts`, `logicalMergeRepository.test.ts`, `portableMerge.contract.ts` | ✅ covered |
| D-02 owner-scoped identities | Identity unit tests, schema-22 migration/backfill, class-aware mapping/remap, native dedup | `portableIdentity.test.ts`, `0022_portable_owner_identities.ts`, native 13-case result | ✅ covered |
| D-03 GTBK v1/v2 compatibility | Contract/codec tests, v1 clean restore, safe v1 merge refusal, v2 restore/merge, Maestro restore | `backupContracts.test.ts`, `backupFormat.test.ts`, `cleanInstallRestore.test.ts`, Phase 11 Maestro | ✅ covered |
| D-04 fail-closed atomic merge | Auth-before-parse, cancellation, one-use token, stale fingerprint, malformed graph, writer-stage rollback, duplicate-only ready, deterministic rebuild | merge command/writer suites, integration, native rollback/parity cases | ✅ covered |
| DATA-08 merge into existing data | Preview, exact confirmation, one transaction, rollback, rebuild, relaunch | component + host + integration + native SQLite + Maestro | ✅ covered |
| DATA-09 canonical portable backup | Encrypted versioned export, safe metadata, clean restore and manual merge on another app state | unit + host + real Expo SQLite + Maestro | ✅ covered |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Automated Evidence | Status |
|---------|------|------|-------------|--------------------|--------|
| 11-01-02 | 01 | 1 | DATA-09 / D-02 / D-03 | portability unit tests; host migration/backup/restore; exact coverage; migrations-effects | ✅ green |
| 11-01-03 | 01 | 1 | DATA-08 / D-04 | merge/preflight unit tests; typecheck; exact coverage | ✅ green |
| 11-01-05 | 01 | 1 | DATA-08 / D-04 | host writer/reconciliation; integration; migrations-effects and portable-merge native suites | ✅ green |
| 11-02-01 | 02 | 2 | DATA-08 / D-01 | merge-plan and merge-command unit matrices | ✅ green |
| 11-02-02 | 02 | 2 | DATA-08 / D-04 | host rollback/state-equality matrix; reconciliation; integration; exact coverage | ✅ green |
| 11-02-03 | 02 | 2 | DATA-08 / DATA-09 | shared contract tests and real Expo portable-merge suite | ✅ green |
| 11-03-01 | 03 | 3 | DATA-08 / DATA-09 | runtime backup/merge command and component tests | ✅ green |
| 11-03-02 | 03 | 3 | DATA-08 / DATA-09 | Data & recovery and Settings accessibility/component tests | ✅ green |
| 11-03-03 | 03 | 3 | DATA-08 / DATA-09 | evidence-script gate, typecheck/lint/boundaries, Maestro 4/4 | ✅ green |
| 11-04-01 | 04 | 4 | DATA-08 / DATA-09 | complete host/integration/coverage/native matrix | ✅ green |
| 11-04-02 | 04 | 4 | DATA-08 / DATA-09 | component/evidence/lint checks and Maestro | ✅ green |
| 11-04-03 | 04 | 4 | DATA-08 / DATA-09 | full test gate; migrations 13/13; portable merge 13/13; Maestro 4/4 | ✅ green |

## Wave 0 Requirements

Existing infrastructure covers every Phase 11 requirement. No new Wave 0 fixture or runner is required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `uphold-d02` execution record | DATA-09 / D-02 | Decision checkpoint ordering is a process record, while its resulting identity behavior is automated. | Confirm the decision record remains present in the Phase 11 summaries and that identity tests/native dedup remain green. |
| `uphold-d04` execution record | DATA-08 / D-04 | Decision checkpoint ordering is a process record, while token, transaction, rollback, and rebuild behavior is automated. | Confirm the decision record remains present and the D-04 host/native matrix remains green. |

These are documentation/provenance checks, not untested product behavior. No automated test is skipped.

## Validation Audit 2026-09-23

| Metric | Count |
|--------|-------|
| Requirements audited | 2 |
| Decision contracts audited | 4 |
| Automated gaps found | 0 |
| Resolved | 0 |
| Manual execution-record checks | 2 |
| Skipped automated cases | 0 |

## Validation Sign-Off

- [x] All tasks have automated verification.
- [x] Sampling continuity is preserved across every plan wave.
- [x] Existing infrastructure covers every requirement and decision contract.
- [x] No watch-mode flags are used for completion evidence.
- [x] Final exact-current evidence is bound to `4173c72`.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-09-23
