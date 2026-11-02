# Phase 09: In-Workout Exercise Editing - Pattern Map

**Mapped:** 2026-09-16
**Scope:** Targeted replan of uncompleted 09-02 Task 1 compatibility closure and dependent Phase 09 work. Plan 09-01 is complete and is a source pattern, not work to repeat.
**Files analyzed:** 20 planned/change-sensitive files
**Analogs found:** 20 / 20

## Replan Gate

Migration 0019_session_exercise_editing.ts is shipped and immutable. Its receipt table restricts operation to add_exercise and has session_exercise_id REFERENCES session_exercises(id) ON DELETE RESTRICT. That foreign key blocks the permitted D-05/D-06 deletion of a zero-completion provisional exercise.

Task 1 owns the forward-only v20 rebuild. It must be green before any destructive repository command or UI work:

1. **Task 1:** migration, portability, stale-fixture, failure/retry closure through schema 20.
2. **Task 2:** receipt-guarded Replace/Remove only after Task 1 is green; it reads/writes v20 scalar receipt evidence exclusively.
3. **Task 3:** runtime/overflow UI only after Task 2 returns durable authoritative outcomes.

Do not edit migration 19, create a second receipt ledger, or begin Task 2/3 while the Task 1 compatibility proof is red.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality | Gate |
|---|---|---|---|---|---|
| src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts | migration | transform | 0018_workout_remove_receipt_entity_ids.ts | exact | Task 1 |
| src/platform/sqlite/migrations/index.ts | config/registry | batch | adjacent v18/v19 registration | exact | Task 1 |
| src/domains/portability/backupContracts.ts | contract/model | file-I/O | v19 logical backup table/reference declarations | exact | Task 1 |
| src/domains/portability/restoreCommands.ts | service | file-I/O | supported schema and restore source-filter path | exact | Task 1 |
| src/testing/contracts/migrationsEffects.contract.ts | config/contract | batch | fixed native migration-case manifest | exact | Task 1 |
| tests/sqlite-host/migrations-effects.test.ts | test | transform | v18 rebuild + v19 verifier cases | exact | Task 1 |
| tests/sqlite-host/logicalBackupRepository.test.ts | test | file-I/O | v19 archive graph round-trip cases | role-match | Task 1 |
| tests/sqlite-host/logicalRestoreRepository.test.ts | test | file-I/O | v19 restore/retry cases | role-match | Task 1 |
| scripts/run-coverage-gate.mjs | config | batch | exact file-registration allowlist | exact | Task 1 |
| src/bootstrap/workoutAppRuntime.test.tsx | test fixture | request-response | mocked migration verifier schema objects | role-match | stale fixture |
| src/domains/portability/portabilityMigration.test.ts | test fixture | file-I/O | supported-schema migration assertions | role-match | stale fixture |
| src/domains/portability/restoreCommands.test.ts | test fixture | file-I/O | restore preflight/version tests | role-match | stale fixture |
| src/domains/portability/cleanInstallRestore.test.ts | test fixture | file-I/O | clean-install archive/restore path | role-match | stale fixture |
| tests/integration/session-exercise-editing.test.ts | integration test | CRUD | completed Phase 09 Add tracer | exact | Task 2 only |
| src/domains/workout/activeWorkout.ts | model/repository interface | request-response | existing Add/Remove contracts | exact | Task 2 held |
| src/domains/workout/sessionExerciseCommands.ts | domain command | request-response | setCommands.ts validation envelope | role-match | Task 2 held |
| src/platform/sqlite/repositories/workoutRepository.ts | repository/service | CRUD | addExercise receipt transaction | exact | Task 2 held |
| src/bootstrap/workoutAppRuntime.tsx | controller/runtime | request-response | add command post-commit refresh | exact | Task 3 held |
| src/ui/screens/ActiveWorkoutScreen.tsx | component | event-driven | Phase 8 overview and picker | role-match | Task 3 held |
| src/ui/__tests__/ActiveWorkoutScreen.test.tsx; maestro/phase9/in-workout-exercise-editing.yaml | tests | event-driven | existing Phase 8/09 evidence | role-match | Task 3 held |

## Pattern Assignments

### src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts (migration, transform)

**Analog:** [0018_workout_remove_receipt_entity_ids.ts](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:72)

Copy migration 18's destructive-rebuild sequence, not the old migration in place. Its core pattern at [lines 76-105](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:76) is:

    DROP immutable-update trigger
    DROP immutable-delete trigger
    ALTER public receipt table RENAME TO legacy table
    CREATE strict replacement table
    INSERT replacement rows SELECTing every legacy receipt field
    DROP legacy table
    CREATE inspection index and immutable triggers

Migration 19's incompatible contract is explicit at [0019_session_exercise_editing.ts:12](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0019_session_exercise_editing.ts:12): operation is only add_exercise and its entity foreign key prevents provisional deletion. Map every legacy row's session_exercise_id to v20 subject_session_exercise_id, preserve all legacy values byte-for-byte, and set replacement_session_exercise_id to null.

**V20 semantic target:** [0020_session_exercise_edit_receipts.ts:10](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts:10) establishes add/replace/remove operations, scalar bounded subject/replacement IDs, replacement presence only for Replace, session-only foreign key, a session/commit-time inspection index, and immutable update/delete triggers. Its exact-schema verifier at [line 76](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts:76) is the model for rejecting wrong columns, foreign keys, index, trigger SQL, or a lingering renamed table.

**Required test seam:** seed a genuine v19 add receipt, run v20, assert exact legacy-field preservation; prove its subject exercise can be deleted while the receipt remains; inject failure after each migration statement and assert v19 schema/data survive intact; then retry from the rolled-back v19 state and reach verified v20.

---

### src/platform/sqlite/migrations/index.ts (registry, batch)

**Analog:** sequential import/array/export registration at [index.ts:16](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/index.ts:16).

Register v20 exactly once after v19 in the runtime migrations array and named exports. Legacy test setup may deliberately use migrations.slice(0, -1) to create a v19 fixture, but production migration registration must advance the current runtime schema to 20.

---

### src/domains/portability/backupContracts.ts and src/domains/portability/restoreCommands.ts (contract/service, file-I/O)

**Analog:** existing v19 logical-backup table shapes, user-owned source filtering, table ordering, and reference graph.

Carry the receipt table as authoritative user-owned data, but remove the obsolete receipt-to-session_exercises reference edge: v20 subject/replacement IDs are scalar retained evidence, not graph dependencies. Raise every supported archive/source schema through 20 in restoreCommands. A valid v20 archive must pass preflight; a future schema must continue to fail closed.

**Required portable round trip:** archive and restore a v20 receipt whose subject_session_exercise_id names a deleted provisional row. The receipt must restore without inventing an exercise dependency, while its workout_sessions FK remains valid. Include injected restore failure followed by a retry, proving neither duplicate nor lost receipts.

---

### src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, and scripts/run-coverage-gate.mjs (contract tests/config, transform/batch)

**Analog:** migration 18's strict verifier at [0018_workout_remove_receipt_entity_ids.ts:107](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:107), plus the host runner failure-injection convention in migrations-effects.test.ts.

Start the host fixture at v19, seed a receipt, apply only v20, and verify exact copied row, final columns/checks/indexes/FKs/triggers, preserved receipt after subject deletion, and rollback after every rebuild stage. The Phase 09 native selection must move from migration-session-exercise-editing-v19 to migration-session-exercise-edit-receipts-v20 without expanding the fixed kernel case count.

Register the v20 migration and changed portability modules in run-coverage-gate.mjs. Verifier and restore changes are integrity-critical and must remain inside the 100% coverage gate.

---

### Named stale fixtures (test fixtures, file-I/O/request-response)

| Fixture | Existing stale pattern | Required closure |
|---|---|---|
| src/bootstrap/workoutAppRuntime.test.tsx | imports SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS; mock verifier exposes two receipt FKs including session_exercises | use v20 schema fixture; expect scalar subject/replacement columns, session-only FK, v20 index, and immutable triggers |
| src/domains/portability/portabilityMigration.test.ts | latest supported migration/schema ends at 19 | accept and verify 20 exactly |
| src/domains/portability/restoreCommands.test.ts | preflight/version fixtures stop at 19 | accept 20 and retain fail-closed future-version errors |
| src/domains/portability/cleanInstallRestore.test.ts | clean install and graph fixtures reflect old receipt edge | new installs reach 20; restore archive retaining a deleted-subject receipt |
| tests/sqlite-host/migrations-effects.test.ts | v19 native suite plus old receipt verifier fixture | v20 selected suite, scalar FK/index/trigger checks, destructive rebuild rollback matrix |
| tests/integration/session-exercise-editing.test.ts | completed Add tracer assumes v19 receipt shape | after Task 1, assert Add replay against v20 scalar fields; later extend only after Task 1 green |

**Mandatory retry proof:** migration-runner failure must roll back to a usable v19 database and a fresh retry must reach v20. Logical restore must also survive an injected failure and retry without duplicating or losing a receipt.

---

### src/platform/sqlite/repositories/workoutRepository.ts (repository, CRUD) - Task 2 held

**Analog:** completed addExercise receipt transaction. It is the durable-acknowledgement template: inspect matching receipt first; inside one FIFO kernel.write commit source facts, session revision/active pointers, effects, and receipt; only then return committed or already_committed.

After Task 1 passes, Replace/Remove must read/write only v20 subject_session_exercise_id and replacement_session_exercise_id fields; never reintroduce a receipt entity foreign key. Copy Add's fresh null-lineage snapshot construction. Copy the history boundary from the existing skipExercise behavior: only zero-completed/no-undo provisional rows may be deleted; history-bearing originals become skipped, with completed/undo facts retained.

Required command tests: matching retry returns canonical stored result; changed request hash, operation, identity, expected revision, or facts conflicts before mutation; add-then-remove leaves its legacy Add receipt replayable after the provisional subject row disappears.

---

### src/domains/workout/activeWorkout.ts and src/domains/workout/sessionExerciseCommands.ts (model/domain command, request-response) - Task 2 held

**Analog:** setCommands.ts validation and ActiveWorkoutRepository capability plus WorkoutCommandConflictError conventions. Keep inputs bounded and immutable: request ID, lower-case SHA-256, session/exercise IDs, expected revisions, occurred time, and operation-specific facts. Return committed/already_committed result unions, not SQL-shaped rows.

Task 2 is blocked until Task 1 schema, archive/restore, fixture, and retry proof are green.

---

### src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, component tests, and Maestro (runtime/component/tests, request-response/event-driven) - Task 3 held

**Phase 8/09 UI analog:** retain the existing native bottom-sheet/overflow and reviewed single-select picker. The approved contract requires exact labels Replace exercise and Remove exercise, focus restoration on dismissal, and no mutation at menu-open ([09-UI-SPEC.md:98](/Users/bytedance/Documents/personal/gym_tracker_v11_design/.planning/phases/09-in-workout-exercise-editing/09-UI-SPEC.md:98)).

Wire UI only after the Task 2 runtime returns its authoritative result; no optimistic row deletion/replacement. Render history retention as literal Skipped plus text/icon non-color treatment. Maestro must distinguish provisional absence from retained Skipped history, preserve completed observation, verify remaining-work/current fallback, and prove receipt-backed relaunch persistence.

## Shared Patterns

### Forward-only schema evolution

**Sources:** [migration 18](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:72) and [migration 19](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0019_session_exercise_editing.ts:39).

Use a new migration wrapped by the migration runner and verify exact final schema. Never revise shipped SQL.

### Immutable scalar receipt evidence

**Sources:** [v19 immutable triggers](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0019_session_exercise_editing.ts:23) and [v20 receipt schema](/Users/bytedance/Documents/personal/gym_tracker_v11_design/src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts:10).

Receipts remain append-only. Scalar IDs preserve replay evidence when the sole permitted physical deletion removes a provisional subject; only the session relationship remains a foreign key.

### Test, rollback, and retry discipline

**Sources:** [09-02 migration core](/Users/bytedance/Documents/personal/gym_tracker_v11_design/.planning/phases/09-in-workout-exercise-editing/09-02-PLAN.md) and [09-01 summary](/Users/bytedance/Documents/personal/gym_tracker_v11_design/.planning/phases/09-in-workout-exercise-editing/09-01-SUMMARY.md:84).

Every persistence-shape change needs schema-verifier negatives, per-stage migration rollback, legacy preservation, logical backup/restore graph proof, stale fixture repair, coverage-gate registration, and a green retry after injected failure.

## No Analog Found

None. V20 directly follows the prior receipt-ledger rebuild pattern; later command/runtime/UI work has established Add, set-command, and overview analogs once the compatibility gate passes.

## Metadata

**Analog search scope:** migrations 0017-0020, migration registry, Add receipt path, portability contracts/restore, named stale fixtures, host migration tests, and Phase 8/09 UI contracts.
**Files scanned:** 31 focused files/artifacts.
**Pattern extraction date:** 2026-09-16
