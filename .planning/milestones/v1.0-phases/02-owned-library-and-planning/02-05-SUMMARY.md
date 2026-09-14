---
phase: 02-owned-library-and-planning
plan: 05
subsystem: content
tags: [starter-plans, deterministic-generation, owner-acceptance, sha256, metric-profiles, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Owner-accepted 310-row exercise catalog and exact catalog-acceptance hash from Plan 02-01
  - phase: 02-owned-library-and-planning
    provides: Nine versioned metric profiles and exact identity semantics from Plan 02-02
  - phase: 01-trustworthy-workout-loop
    provides: Reviewed Full Body Foundation source values and stable exercise identities
provides:
  - Six deterministic original starter templates with 20 days and 69 explicit exercise decisions
  - Complete coverage of all nine metric profiles with explicit contract versions and five reviewed occurrence overrides
  - D-55 Gym Body-Part Split with Monday-Friday Chest, Back, Shoulders, Legs, and Arms days using four weighted load/reps exercises per day
  - Exact owner acceptance binding the starter asset, manifest, review, catalog acceptance, definition graph, counts, and original five template identities
affects: [starter-import, plan-cloning, library-plans, plan-activation, cross-profile-workouts]

actuals:
  tokens: 148973
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - Generated starter assets remain non-authoritative candidates until a separate owner acceptance record binds their exact bytes
    - Every plan occurrence carries explicit metric identity, target, rest, policy, and substitution disposition
    - Deterministic checks rebuild in memory and compare bytes without mutating approved artifacts
    - Contract amendments preserve prior accepted candidates by hashing each original template independently

key-files:
  created:
    - artifacts/review/phase2/starter-plans-acceptance.json
    - artifacts/review/phase2/starter-plans-review.json
    - assets/content/starter-plans.v2.json
    - assets/content/starter-plans.v2.manifest.json
    - scripts/content/build-starter-plans.mjs
    - scripts/content/diff-starter-plans.mjs
    - scripts/content/validate-starter-plans.mjs
  modified: []

key-decisions:
  - "The owner accepted exactly six starter templates bound to asset SHA-256 8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4 and review SHA-256 f339971327ef613a476b2aa6b784043bbd82929894ef6edb4129151eaffa2f21."
  - "Gym Body-Part Split follows D-55 exactly: Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, Friday Arms, with four load_reps exercises per day and no substitutions."
  - "The first five templates remain byte-identical to the final pre-amendment candidate at 2d2df33; the sixth template is an additive owner-reviewed contract amendment."
  - "Candidate files retain pending_owner_acceptance provenance; only starter-plans-acceptance.json conveys owner authority for the unchanged approved bytes."

patterns-established:
  - "Acceptance boundary: recompute every approved hash, count, identity, and D-55 constraint before writing the separate owner decision record."
  - "Template preservation boundary: hash each template's canonical JSON independently so additive starter amendments cannot silently alter earlier candidates."
  - "Fitness-content boundary: unresolved and inferred counts must both remain zero before acceptance."

requirements-completed: [LIB-06]

coverage:
  - id: D1
    description: "Six deterministic starter templates contain 20 days, 69 explicit exercise decisions, nine metric profiles, five reviewed metric overrides, and zero substitutions, unresolved values, or inferred values."
    requirement: LIB-06
    verification:
      - kind: unit
        ref: "scripts/content/validate-starter-plans.mjs#starter plan self-test"
        status: pass
      - kind: other
        ref: "node scripts/content/validate-starter-plans.mjs --check"
        status: pass
    human_judgment: false
  - id: D2
    description: "The deterministic review artifact exposes all exact template, day, exercise, metric, target, rest, policy, source-note, substitution, and interval-comparator decisions."
    requirement: LIB-06
    verification:
      - kind: unit
        ref: "scripts/content/diff-starter-plans.mjs#starter review self-test"
        status: pass
      - kind: other
        ref: "node scripts/content/diff-starter-plans.mjs --check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gym Body-Part Split matches D-55 with Monday-Friday Chest, Back, Shoulders, Legs, and Arms; every day has four weighted load/reps occurrences and no substitutions."
    requirement: LIB-06
    verification:
      - kind: unit
        ref: "scripts/content/validate-starter-plans.mjs#six-template-gym-body-part-split-contract"
        status: pass
    human_judgment: false
  - id: D4
    description: "The owner approved the exact six-template fitness content, including every target, rest, policy, schedule, source note, and interval protocol."
    requirement: LIB-06
    verification:
      - kind: manual_procedural
        ref: "artifacts/review/phase2/starter-plans-acceptance.json#reviewerResponse approved"
        status: pass
    human_judgment: true
    rationale: "Fitness-content appropriateness and intentional parameter selection require explicit owner judgment."
  - id: D5
    description: "The acceptance record binds the exact approved asset, manifest, review, catalog acceptance, definition graph, counts, and original five template hashes."
    requirement: LIB-06
    verification:
      - kind: other
        ref: "Task 3 live SHA-256, count, template-preservation, and D-55 assertion"
        status: pass
      - kind: other
        ref: "node -e acceptance artifact contract check"
        status: pass
    human_judgment: false

duration: 9h 48m
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 05: Accepted Starter Plan Content Pack Summary

**Six owner-approved starter templates with all-nine-profile coverage, deterministic review tooling, an equipment-heavy weekday body-part split, and exact hash-bound acceptance**

## Performance

- **Duration:** 9h 48m
- **Started:** 2026-08-17T16:11:10Z
- **Completed:** 2026-08-18T01:59:25Z
- **Tasks:** 3
- **Files modified:** 22 total files (7 content deliverables and 15 D-55 planning-contract files)
- **Implementation and amendment commits:** 7
- **Templates:** 6
- **Days:** 20
- **Exercise decisions:** 69
- **Metric profiles:** 9
- **Metric overrides:** 5
- **Substitutions / unresolved / inferred:** 0 / 0 / 0

## Accomplishments

- Generated six deterministic starter templates: Full Body Foundation, Upper / Lower, Push / Pull / Legs, Minimal Equipment Full Body, Strength + Conditioning, and Gym Body-Part Split.
- Enforced E-34 through E-41, exact catalog and metric references, all-nine-profile coverage, stable ordering, integer precision, byte-identical generation, and fail-closed interrupted writes.
- Produced one deterministic owner review artifact exposing all 69 exercise decisions, exact targets, warm-ups, rests, policies, source notes, substitutions, and the literal `rounds_then_work` interval comparator.
- Added D-55 as an additive sixth template while preserving the exact full-template hashes of the original five final candidates.
- Recorded the owner's explicit `Approved` response in a separate immutable acceptance record after recomputing every approved SHA-256, count, preserved-template identity, and body-part split constraint.

## Task Commits

1. **Task 1 RED:** `278d076` — failing starter schema, profile, reference, determinism, precision, and interruption contract table.
2. **Task 1 GREEN:** `e9b0867` — deterministic five-template candidate generator, manifest, and complete nine-profile fixture.
3. **Task 2 RED:** `d3426e3` — failing deterministic diff, review completeness, unresolved, and inference contracts.
4. **Task 2 GREEN:** `2d2df33` — exact owner review artifact with 49 original exercise decisions and D-54 source diff.
5. **Approved amendment candidate:** `caae94e` — additive Gym Body-Part Split, six-template validation, and 69-decision review artifact.
6. **Contract amendment:** `4b49dee` — locked D-55 and the six-template requirement across Phase 2 planning artifacts.
7. **Task 3 Acceptance:** `89961e6` — exact owner approval bound to the accepted hashes, counts, D-55 contract, and original five template identities.

## Files Created/Modified

- `scripts/content/build-starter-plans.mjs` — strict deterministic six-template definition builder, schema boundary, manifest builder, and atomic output writer.
- `scripts/content/validate-starter-plans.mjs` — E-34 through E-41, profile/reference, byte-idempotency, interruption, original-template preservation, and D-55 contract checks.
- `scripts/content/diff-starter-plans.mjs` — stable D-54 source diff and complete owner-readable starter review generator/checker.
- `assets/content/starter-plans.v2.json` — exact six-template candidate graph with 20 ordered days and 69 explicit exercise decisions.
- `assets/content/starter-plans.v2.manifest.json` — source, definition, pack, count, and profile-coverage provenance.
- `artifacts/review/phase2/starter-plans-review.json` — exact owner review surface with zero unresolved or inferred decisions.
- `artifacts/review/phase2/starter-plans-acceptance.json` — explicit owner approval bound to exact approved bytes and identities.

## Decisions Made

- Exact accepted SHA-256 values:
  - starter asset: `8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4`
  - starter manifest: `babdb7dee0f11f874a1c1b02294724f74e07b8887e52ff6498b3749d9050fd05`
  - starter review: `f339971327ef613a476b2aa6b784043bbd82929894ef6edb4129151eaffa2f21`
  - catalog acceptance: `1648bc3c64752e827d488406d5f3805010ff3a521ad74b6a5e907c87174bb2df`
  - definition graph: `3c8b6bc8c8ca65b841269d4bf3e4e2ed3a9750606b05fbe13cbdad05016edd9b`
- Exact preserved template hashes:
  - Full Body Foundation: `f2df21fc8d57b53e7f4bf7fe6934a50b0d70c7a78f82efef7e1642f289016f0f`
  - Upper / Lower: `6b2b761f1cbca0aebdde07cf01e06b776bb0e200b8ab52c365ae5e21e96215e2`
  - Push / Pull / Legs: `8be21b6c6f7d8f44638dcffe4abb1a04d9d600d0a9a8c164bcd1be8cafb86adc`
  - Minimal Equipment Full Body: `6e2cd2754b63a00bffb1e7e35b9fb9253dfb42f49d2a862a5294436f19b485c8`
  - Strength + Conditioning: `7ce210ebf1f9814d5ec921adfd2b0815248f6a40e4759c74bb9f90fc7b540ec1`
- `Gym Body-Part Split` is exactly Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, and Friday Arms. Each day has four `load_reps` occurrences, no bodyweight occurrence, no metric override, and no substitution.
- The generated asset, manifest, and review retain candidate provenance. The separate acceptance record is the only owner-authority fact and binds those unchanged bytes.

## Deviations from Plan

None - the revised six-template plan executed exactly as written.

## TDD Gate Compliance

- Task 1 RED gate: `278d076` established failing direct-Node contracts before starter generation.
- Task 1 GREEN gate: `e9b0867` implemented the deterministic candidate generator and passed the exact validator commands.
- Task 2 RED gate: `d3426e3` established failing review/diff contracts before report generation.
- Task 2 GREEN gate: `2d2df33` implemented the deterministic review artifact and passed the exact diff checker.
- The owner-approved D-55 expansion was committed in `caae94e`, preserving all five final pre-amendment template hashes and extending the same Task 1/Task 2 checks to six templates.
- Task 3 was the planned blocking-human acceptance checkpoint and required no implementation RED/GREEN cycle.

## Authentication Gates

None.

## Issues Encountered

- The initial preservation probe compared the current six-template asset to `e9b0867`, which predates Task 2's planned review enrichment of Full Body Foundation and therefore produced one expected older hash. Comparing against the final five-template candidate at `2d2df33` proved all five current templates byte-identical before acceptance.
- A custom final-verification wrapper initially passed array indexes into `fs.promises.readFile` through `Array.map`; the project checks had already passed, and rerunning the wrapper with an explicit callback confirmed the final acceptance contract.
- The shell emits the pre-existing `compdef:153: _comps: assignment to invalid subscript range` message during some zsh commands. All starter and GSD commands returned their own statuses independently.

## Known Stubs

None.

## Threat Model Verification

- **T-02-01 starter tampering:** the asset, manifest, review, catalog acceptance, definition graph, original five templates, and all counts are hash-bound and recomputed before authority is recorded.
- **T-02-03 ownership-intent tampering:** the generated files remain explicitly non-authoritative candidates; only the separate owner decision record conveys acceptance, and no activation or user-owned write path was added.
- **T-02-05 metric/policy tampering:** every occurrence has explicit metric identity, target, rest, policy, and substitution disposition; all nine profiles resolve and unresolved/inferred counts are zero.
- **T-02-07 information disclosure:** source notes and review output contain only committed public catalog/plan decisions and no local workout observations or owner database values.
- No new runtime network endpoint, authentication path, package dependency, SQLite schema, runtime file-access path, or user-data trust boundary was introduced.

## User Setup Required

None - no package installation, credentials, external service, runtime network access, or manual environment setup required.

## Verification

- `node scripts/content/validate-starter-plans.mjs --self-test` — 10 starter contracts passed.
- `node scripts/content/validate-starter-plans.mjs --check` — six templates and nine profiles passed deterministic regeneration/reference checks.
- `node scripts/content/diff-starter-plans.mjs --check` — six templates and 69 review decisions passed exact report checks.
- Task 3 approved-identity assertion — all five approved artifact/definition SHA-256 values, 6/20/69/9/5/0/0/0 counts, original five template hashes, and D-55 constraints passed.
- Acceptance contract check — `accepted: true`, owner `approved`, timestamp, exact SHA-256 bindings, counts, and preserved-template hashes match live files.
- Approved-byte immutability check — the asset, manifest, review, and three tooling files are unchanged from `caae94e` after acceptance.
- Stub/skip scan, threat-surface scan, deletion check, tracked-file check, and required commit-trailer checks passed.

## Next Phase Readiness

- Starter import and clone activation may consume only the exact asset and manifest bytes bound by `starter-plans-acceptance.json`.
- Library plan browsing may expose all six templates, including the D-55 weekday body-part split, with complete source notes and metric semantics.
- Cross-profile workout execution has explicit fixture coverage for every approved profile and contract version needed by the six starters.
- No blockers, known stubs, skipped tests, open broken-window entries, unrun verification, or new threat flags remain.

## Self-Check: PASSED

- All seven plan deliverable files exist and are tracked.
- All seven Task 1, Task 2, amendment, contract, and Task 3 commits exist with the required TRAE co-author trailer exactly once.
- The acceptance record matches the exact approved asset, manifest, review, catalog acceptance, definition graph, counts, original five template hashes, and D-55 fixture.
- Summary frontmatter records measured estimate-scale actuals and completed requirement `LIB-06`.
- The blocking-human checkpoint is resolved by the owner's explicit `Approved` response.
- `.gsd/dispatch-isolation-sentinel.json` remains untracked and untouched.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
