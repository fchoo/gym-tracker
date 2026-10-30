# Phase 15 TIM-01 Retirement Evidence

**Recorded:** 2026-10-10
**Characterization status:** passed
**Policy validation:** passed

## Fresh characterization baseline

Phase 15 re-ran the retained-fact and lifecycle probes before the runtime
capability cut. This record contains only aggregate case status, file hashes,
schema versions, and opaque identifiers; it contains no workout content.

| Case | Boundary | Proof | Status |
| --- | --- | --- | --- |
| P15-TIM-C01 | timing state matrix | idle, running, paused, stopped, cluster-ready, cluster-gap-running, and cluster-gap-paused readers remain covered by the state suite | passed |
| P15-TIM-C02 | timing command policy | retired command policy accepts readable legacy configuration and resolves no new playback state | passed |
| P15-TIM-C03 | selected session relaunch | one synthetic cluster-gap snapshot retains canonical timing bytes, active pointer, provenance, and paused between-set rest after reopen | passed |
| P15-TIM-C04 | logical restore | schema-21/27 timing configuration and progress rows remain byte-stable through replacement restore | passed |
| P15-TIM-C05 | logical merge | the full-plan aggregate writer retains `session_advanced_timing_states` within ordered replacement and fault coverage | passed |
| P15-TIM-C06 | runtime lifecycle | foreground, queued callback, relaunch, and retired cue probes keep legacy timing inert while the independent rest lifecycle remains authoritative | passed |

## Commands executed

- `npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingState.test.ts src/domains/advancedTiming/advancedTimingCommands.test.ts src/platform/sqlite/repositories/advancedTimingRepository.test.ts` — passed: 3 suites, 132 tests.
- `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` — passed: 1 suite, 19 tests.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalRestoreRepository.test.ts tests/sqlite-host/logicalMergeRepository.test.ts` — passed: selected restore and merge host coverage.

## Evidence identities

| Input | SHA-256 |
| --- | --- |
| `src/bootstrap/workoutAppRuntime.test.tsx` | `c84c0f78af6455e4f3f86881ed7293ded1fb5901fd4e207089bce718314c2ba3` |
| `tests/integration/today-schedule-workout.test.ts` | `433376e09a1b157ff679e55aa20243b3ee3dfec4492a43743d96bb0b29ebbdfc` |
| `tests/sqlite-host/logicalRestoreRepository.test.ts` | `1d620236bf372cf0248575523a87e220cd27dbf6e2aea2a8f39efb1188995d0e` |
| `tests/sqlite-host/logicalMergeRepository.test.ts` | `1b1f25aa965e23d60fd8ffb2d3a980da29baa96ffd640375dbebbfd8c3806c9c` |
| `.planning/v1.2-owner-decisions.json` | `f1f9af1762e6e8fefbda0ee48f1ce2dca58907f19686f36e92130f718769783e` |

## Approved owner record validation

Validated automatically against `.planning/v1.2-owner-decisions.json` on
2026-10-10. The recorded owner decision date is **2026-10-07** and the exact
validated values are:

| Field | Value |
| --- | --- |
| `decisions.TIM-01.status` | `approved` |
| `decisions.TIM-01.selection` | `retire-playback` |
| `decisions.TIM-01.legacy_playback_compatibility` | `false` |
| fresh evidence hash | `c84c0f78af6455e4f3f86881ed7293ded1fb5901fd4e207089bce718314c2ba3` |

This is an approved capability retirement with no compatibility branch. A
technical failure remains an implementation blocker and does not reopen the
product decision.

## Retained-fact boundary

Schema 21/27 configuration, resolved snapshot, mutable timing state, completed
and draft set facts, active pointer, provenance, and independent between-set
rest remain portable/readable. This baseline does not retain a cadence/cluster
authoring or playback capability; the approved runtime cut follows only after
Task 15-02-02 validates the owner record.
