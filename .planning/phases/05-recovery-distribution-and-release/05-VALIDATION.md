---
phase: 05-recovery-distribution-and-release
status: validated-inline
validated: 2026-08-26
source_head: 8ac43a9e20dbeaa0d77616b69bf232360cae0714
plans: [05-01, 05-02, 05-03, 05-04, 05-05, 05-06, 05-07]
requirements: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, REL-03, REL-04, REL-05, REL-06]
---

# Phase 5 Plan Validation

## Verdict

PASS — seven sequential executable plans cover all Phase 5 requirements. The graph begins with a security/format contract and private-release rehearsal, proves one encrypted logical-export tracer, then adds transactional restore, derivative recovery, CSV, and a final candidate-bound release gate. The standard GSD planner/checker agent loop was replaced by this documented inline validation because the owner prohibited subagents for the active run.

## Requirement ownership

| Primary owner | Requirements | Proof focus |
|---|---|---|
| 05-01 | DATA-01, DATA-02, DATA-03 | Logical v1 contract, authenticated metadata/AES-GCM/Argon2id, bounds, cleanup, frozen vectors |
| 05-02 | REL-03, REL-04, REL-05 | Private build-once candidate, digest/metadata retention, no-rebuild promotion contracts |
| 05-03 | DATA-01, DATA-02, DATA-03 | Real user-owned data collection, encrypted archive lifecycle, runtime/More export tracer |
| 05-04 | DATA-04, DATA-05 | Authenticate/decrypt-before-parse, preview, typed confirmation, one-transaction source replacement, no-mutation failures |
| 05-05 | DATA-06 | Local bundled-reference reconciliation, FTS/projection/recommendation recovery, clean-install parity |
| 05-06 | DATA-07 | Stable readable CSV schema/query/escaping/share flow |
| 05-07 | REL-03, REL-04, REL-05, REL-06 | Exact-candidate automated matrix and one hard attended/promotion gate |

Secondary references in later plan frontmatter document integration coverage; the table is the primary ownership source.

## Dependency and execution order

```text
05-01 logical envelope + crypto/limits
   |
   +--> 05-02 candidate/promotion rehearsal
   |
   +--> 05-03 encrypted logical backup tracer
              |
              v
          05-04 authenticated preflight + atomic source replacement
              |
              v
          05-05 reference reconciliation + rebuild pending/retry
              |
              +--> 05-06 CSV export (uses established file/runtime surface)
                             \
05-02 + 05-03 + 05-04 + 05-05 + 05-06 --> 05-07 final source/release gate
```

No Phase 5 implementation work is parallelized. Backup/export, restore/replacement, catalog reconciliation, derivative rebuild, runtime capabilities, migration state, UI flows, candidate evidence, and release promotion all overlap the same persistence/runtime contracts. Sequential slices reduce conflict and make each integrity boundary independently testable.

## Architecture and design review findings folded in

- Product backup is a versioned logical format, never raw SQLite; header metadata is authenticated AAD and payload parsing/writing is bounded/fail-closed.
- Restore cannot mutate source facts until an archive authenticates, parses, and validates completely. The only source replacement is one serialized transaction; insert fault injection proves rollback.
- Existing FTS/projection APIs own their transactions, so facts replacement commits a `rebuild_pending` state and deterministic rebuild is separately retryable. Plans intentionally do not claim unsupported cross-repository atomicity.
- Bundled catalog identity is reconciled locally; it is not backup authority. Derivatives are regenerated rather than copied.
- Data and recovery is a focused More hierarchy with an explicit readable-CSV warning and typed `REPLACE` restore confirmation. It preserves the light grey/white and dark graphite/near-black visual system and covers all accessible states.
- Candidate identity is a retained manifest plus raw/inner hashes; promotion downloads/verifies bytes and never rebuilds. The physical gate remains a genuine human/device check, not a test-generated approval record.

## Validation checks

- [x] Every DATA/REL requirement has exactly one primary owner and at least one concrete verification path.
- [x] Every plan has bounded objective, dependencies, task-level acceptance criteria, explicit files, and targeted automated verification.
- [x] All security-sensitive paths have strict schema/limit/error/cleanup tests and avoid secret-bearing diagnostics.
- [x] Restore covers wrong password, tamper, unsupported version, oversize, malformed, cancellation, validation failure, and injected write failure with exact no-mutation proof.
- [x] All user-facing flows cover loading/error/cancel/empty/one-many/success/pending-rebuild/share-unavailable, focus, keyboard/D-pad, non-color, reduced motion, adaptive layout, and 200% text.
- [x] Release workflow plans have private signing isolation, candidate metadata/digests, retained downloads, rejection paths, and an explicit no-build promotion invariant.
- [x] No plan imports a repository from a route, exposes raw SQLite as a backup, stores passwords/keys, uses automated evidence as human approval, modifies protected `.gsd`/coverage folders, or creates a public release before the final gate.

## Deferred final verification

Plans 05-01 through 05-06, and source-only work in 05-07, deliberately exclude Android builds/native generation, emulator/device/Maestro execution, physical KDF timing, notification/process-death observation, airplane-mode proof, assistive technology, attended visual/design review, owner approval evidence, Terminal Seal, signing, and public publication.

After the source work is complete, the final 05-07 checklist must run once against one privately retained candidate. It is not valid until every required attended result is truthful, every digest matches, and the owner supplies literal lowercase `approved`. The promotion workflow publishes the retained bytes first; the subsequent Terminal Seal command only validates the completed promotion and existing public bytes, and never rebuilds them.

## Canonical Phase 5 attended rows

<!-- phase5-ledger:v1 name=attended-rows -->

| id | evidence_class | observation |
|---|---|---|
| P5-AIRPLANE-WORKOUT | attended-physical-phone | Complete the offline workout and recovery journey with airplane mode enabled. |
| P5-PROCESS-DEATH-RECOVERY | attended-physical-phone | Kill and relaunch during an active workout and rest, then verify SQLite-backed recovery. |
| P5-NOTIFICATION-STATES | attended-physical-phone | Observe denied, late, granted, foreground, and background notification behavior without treating delivery as authority. |
| P5-CLEAN-RESTORE | attended-physical-phone | With Auto Backup and D2D disabled and empty pre-restore state, restore the exact encrypted archive and verify source parity. |
| P5-ADAPTIVE-LAYOUT | attended-emulator | Review compact, medium, expanded, landscape, and rotation behavior on the exact candidate. |
| P5-TEXT-200 | attended-emulator | Review all release surfaces at 200 percent text without clipping or hidden actions. |
| P5-KEYBOARD-DPAD-FOCUS | attended-emulator | Verify keyboard and D-pad order, activation, and focus restoration. |
| P5-REDUCED-MOTION-NON-COLOR | attended-emulator | Verify reduced-motion state changes and non-color status semantics. |
| P5-ASSISTIVE-TECH | attended-assistive | Complete screen-reader and semantic-control review with assistive technology enabled. |
| P5-MINIMUM-DEVICE-PERFORMANCE | attended-physical-phone | Record bounded minimum-device launch, workout, restore, and Argon2 timings. |
| P5-POST-IMPLEMENTATION-DESIGN | attended-design | Compare implemented System, Light, Dark, and recovery surfaces with the approved design references. |
| P5-PHYSICAL-ARGON2-CALIBRATION | attended-physical-phone | Run and retain the ten-sample physical Argon2 calibration on exact candidate bytes. |

## Validation Audit 2026-08-26

| Metric | Count |
|---|---:|
| Source-contract requirements audited | 11 |
| Source-contract requirements covered | 11 |
| Source-contract blockers | 0 |
| Source-contract warnings | 0 |
| Real candidate/device/attended requirements pending | 4 |
| New tests generated | 0 |

### Executed Source Verification

- Phase 5 evidence suite — 19/19 passed.
- Release evidence suite — 10/10 passed.
- Phase 2 evidence regression — 85/85 passed.
- Phase 3 evidence regression — 2/2 passed.
- Phase 4 evidence regression — 2/2 passed.
- Release matrix contract — passed with all 16 required commands registered.
- Phase 5 portability host fixtures — 5 suites and 48 tests passed.
- Phase 5 portability unit fixtures — 8 suites and 206 tests passed.
- Data and recovery component suite — 19/19 passed.
- Focused backup/restore command subset — 55/55 passed.
- Runtime and preflight unit fixtures — 2 suites and 103 tests passed.
- Portability migration fixture — 17/17 passed.
- Full source gate at `8ac43a9` — 134/134 suites and 2,348/2,348 tests passed; coverage 90.94% statements, 85.86% branches, 90.21% functions, and 91.13% lines; all 83 integrity-critical files passed at 100%.

### Coverage Interpretation

DATA-01 through DATA-07 are covered by executable source, host-SQLite, unit, and component behavior tests. These tests do not substitute for exact-production-candidate or native operating-system behavior.
The restore preview retains one supported `role="list"` container and exposes each bounded label/value fact as an individually accessible native text element. This closes the earlier source-role mismatch without claiming positional TalkBack output; exact native reading order remains in the attended gate.

REL-03 through REL-06 remain partial by design: their source, workflow, and evidence contracts are green, but no candidate build, workflow dispatch, device/emulator run, attended observation, owner approval, public promotion, or Terminal Seal execution has occurred.

### Deferred Manual and Release Gate

The canonical attended ledger above remains pending until one exact signed production candidate is built, tested, attended, approved, promoted without rebuilding, and sealed.
