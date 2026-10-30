# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 - In-Workout Editing, Advanced Timing & Drive Backup

**Shipped:** 2026-10-01
**Phases:** 5 | **Plans:** 36 | **Tasks:** 48

### What Was Built

- A single scrollable active-workout overview with history-safe add, replace, remove, reorder, modified-session semantics, and explicit default-No plan write-back.
- Versioned per-repetition and cluster-set timing with independent plan/session row controls, lifecycle recovery, and advisory-only cue delivery.
- Stable owner-scoped portability with encrypted GTBK restore/merge plus optional single-writer Google Drive replacement backup and quarantined recovery.
- A signed production APK/AAB installed unchanged on the Samsung SM-S916B.

### What Worked

- Keeping SQLite facts authoritative let editing, timing, portability, and automatic backup compose without putting network work on the workout path.
- Exact coverage and native manifests caught stale selectors, migration drift, resumable-upload fixture errors, and incomplete evidence before shipment.
- The owner-approved live evidence boundary kept physical-phone testing non-destructive while deterministic contracts covered adversarial recovery and deletion.
- Reusing Phase 11 logical restore/merge ports in Phase 12 avoided a second data model or automatic-only merge implementation.

### What Was Inefficient

- The first Phase 12 verification exposed seven architecture/evidence gaps that should have been caught before the initial implementation pass.
- Source changes during native compilation repeatedly made candidate evidence stale and forced exact-build reruns.
- The original Phase 12 verification umbrella and attended closeout lacked summaries until final reconciliation.
- The production build script assumed the caller had already selected pinned Java, Node, and Android SDK paths; two fast preflight failures preceded the successful build.

### Patterns Established

- Bind native evidence to implementation HEAD, source digest, APK digest, package, and device role before accepting any result.
- Separate deterministic adversarial proof from narrow attended transport/auth observations.
- Use one-active-writer replacement recovery with restore quarantine, writer epoch, ETag fencing, and latest/previous immutable snapshots.
- Preserve manual encrypted GTBK as a separate recovery product from readable automatic Drive JSON.

### Key Lessons

1. Run the full goal-backward verifier before expensive native/attended evidence so missing production wiring is found while changes are still cheap.
2. Freeze application source before the retained native build; allow only planning-document commits after evidence sealing.
3. Put pinned toolchain discovery inside production build entry points or run the repository doctor as a mandatory preflight.
4. Treat recorder approval as a real human gate and store only counts, sizes, timestamps, and hashes.
5. Close GSD metadata at each plan boundary so the milestone audit does not need retrospective summary reconstruction.

### Cost Observations

- Model mix: not measured reliably across the resumed multi-session workflow.
- Sessions: multi-session execution; exact count was not retained.
- Notable: parallel review/fix agents shortened independent review loops, while serial exact-device evidence remained the dominant elapsed-time cost.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | not retained | 7 | Established offline-first SQLite authority and signed personal-use delivery |
| v1.1 | multi-session | 5 | Added goal-backward re-verification, narrow attended cloud evidence, and cross-phase integration audit |

### Cumulative Quality

| Milestone | Tests | Coverage | Native/Attended Evidence |
|-----------|-------|----------|--------------------------|
| v1.0 | 2,473 at final recorded gate | 83 integrity-critical files at exact 100% | signed personal-use APK |
| v1.1 | 3,336 at final source gate | 106 integrity-critical files at exact 100% | Phase 10/12 native evidence plus 2/2 approved Drive observations |

### Top Lessons

1. Exact artifact identity and SQLite authority are the durable foundations for both offline workout correctness and recovery evidence.
2. Human checks are strongest when narrowly scoped and backed by deterministic tests for every destructive or adversarial branch.
