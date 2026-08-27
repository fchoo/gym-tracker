---
phase: 05-recovery-distribution-and-release
plan: 07
subsystem: release-evidence
tags: [release-candidate, evidence, maestro, accessibility, github-actions, no-rebuild]

requires:
  - phase: 02-owned-library-and-planning
    provides: canonical G-02-01 through G-02-09 remediation and attended-role ledgers
  - phase: 03-calendar-and-history-integrity
    provides: HIST-01 through HIST-09 source/automated verification with release evidence deferred
  - phase: 04-overall-progress-and-complete-progression
    provides: PROG-01 through PROG-11 source/automated verification with release evidence deferred
  - phase: 05-recovery-distribution-and-release/05-02
    provides: build-once candidate manifest and no-rebuild promotion foundation
provides:
  - production-only candidate identity with workflow provenance and raw/inner APK/AAB/config hashes
  - real production-package Phase 5 installed-flow, clean-state, adaptive, and bounded performance producers
  - exact Phase 2-5 attended ledger plus pending-only checklist and immutable observation recorder
  - protected human-observation and attended-record workflows plus serialized no-rebuild promotion
  - post-promotion public-asset proof and one-command non-mutating Terminal Seal handoff
affects: [release-candidate-run, attended-release-review, github-release-promotion, milestone-verification]

actuals:
  tokens: 56618
  tasks: 2
  commits: 16

tech-stack:
  added: []
  patterns: [canonical manifest authority, raw-report rehashing, immutable attended evidence, successful-run provenance, draft-then-hash-verify promotion]

key-files:
  created:
    - scripts/phase5-candidate-evidence.mjs
    - scripts/run-phase5-maestro.mjs
    - scripts/benchmark-phase5.mjs
    - scripts/verify-phase5-native-evidence.mjs
    - scripts/generate-phase5-attended-checklist.mjs
    - scripts/verify-phase5-release-gate.mjs
    - scripts/record-phase5-promotion-proof.mjs
    - scripts/stage-phase5-human-evidence.mjs
    - maestro/phase5/data-recovery.yaml
    - .github/workflows/release-human-evidence-upload.yml
    - .github/workflows/release-attended-evidence.yml
    - .planning/phases/05-recovery-distribution-and-release/05-TERMINAL-SEAL.md
  modified:
    - .github/workflows/release-candidate.yml
    - .github/workflows/release-promotion.yml
    - scripts/create-release-candidate-manifest.mjs
    - scripts/release-candidate-contract.test.mjs
    - package.json

key-decisions:
  - "The canonical release manifest is the sole candidate identity and includes production source/package/version, workflow run/repository, APK/AAB, and inner bundle/config hashes."
  - "Every machine producer remains automated-only/evidence_pending and binds one installed production package/device plus recomputed manifest and raw-report hashes."
  - "Attended approval is accepted only from canonical observations with every exact row passed, nonblank evidence, immutable attachment bytes, exact candidate devices, and the literal lowercase CLI token approved."
  - "Release promotion selects successful candidate and attended runs explicitly, checks out the candidate commit, refuses reused runs/existing tags, stages a draft, verifies downloaded public hashes, then publishes without rebuilding."

requirements-completed: []
duration: 99m
completed: 2026-08-26
status: complete
---

# Phase 05 Plan 07: Exact-Candidate Release Evidence Preparation Summary

**Production-candidate automation, immutable attended-evidence validation, and no-rebuild promotion are source-complete while the one real candidate/attended/owner gate remains explicitly unexecuted.**

## Performance

- **Duration:** 99 minutes
- **Started:** 2026-08-26T12:36:47Z
- **Completed:** 2026-08-26T14:15:58Z
- **Tasks:** 2 source/automation tasks completed
- **Files modified:** 37

## Accomplishments

- Made one canonical production manifest the sole identity for the source commit/tree/config/package/version, candidate workflow run/repository, APK/AAB bytes, and embedded bundle/config bytes. Producers require its explicit path and SHA-256 and revalidate the bundle before operating.
- Added real `com.fchoo.gymtracker` Phase 5 Maestro flows for production workout persistence, history/progress, Data and recovery, and adaptive/large-text behavior. These flows avoid development-test routes and never claim physical, assistive, design, owner, or Terminal Seal evidence.
- Added source, generated-native/backup-rule, installed production SQLite/UI, exact-candidate, adaptive, and bounded launch/navigation performance seams. Each automated result is `automated-only` with `evidence_pending`, device identity, ordered case ledger, and re-hashed raw reports.
- Added explicit Auto Backup/D2D disablement, package absence, and empty pre-restore state to the clean-restore preparation contract.
- Derived the attended matrix in exact order from Phase 2 `G-02-01..09`, Phase 3 `HIST-01..09`, Phase 4 `PROG-01..11`, and twelve canonical Phase 5 rows. Missing, extra, duplicate, reordered, or orphan rows fail closed.
- Added a pending-only checklist generator and separate recorder. The recorder cannot manufacture observations; it requires every row to be `passed`, nonblank observations, distinct real attachments, exact installed candidate identity, and the literal case-sensitive command-line token `approved`.
- Replaced digest-only attended trust with strict aggregate revalidation: final gates reopen `source.json`, `maestro.json`, `benchmark.json`, every raw report, the aggregate, checklist, observations, attended record, and each nonempty bounded attachment, then recompute hashes and exact ledgers.
- Added a protected self-hosted workflow that uploads only pre-existing human-authored observations/attachments beneath a canonical owner-controlled root. It proves candidate workflow/commit/environment/artifact provenance before candidate code runs, recursively rejects symlinks/non-regular/empty/oversized/excess files, and recreates only one fixed runner-temp staging directory.
- Added a separate protected attended workflow. The owner must explicitly supply lowercase `approved`; no script/default fabricates it. Candidate, observation, and attended runs are pinned by repository, commit, workflow path, `workflow_dispatch`, protected environment, and nonexpired artifact.
- Hardened promotion with repository-wide non-canceling serialization, strict tag/input validation before release API use, safe workflow-source checkout before helper execution, later exact candidate checkout, unused-run/existing-tag checks, draft creation, public asset hash verification, and publication only after hashes pass.
- Added immutable post-promotion proof. The Terminal Seal parser accepts only one exact normalized non-mutating argv and rejects shell chaining/metacharacters; its verifier revalidates completed promotion/public bytes plus all candidate and attended source evidence. The command was not run.

## Automated Checks

- Phase 5/release focused contract suites: **29/29 tests passed** after all independent review fixes.
- Phase 2 evidence regression: **85/85 tests passed**.
- Phase 3 evidence regression: **2/2 tests passed**.
- Phase 4 evidence regression: **2/2 tests passed**.
- Full source suite: **134/134 suites and 2,340/2,340 tests passed**.
- Coverage: **90.97% statements, 85.86% branches, 90.30% functions, 91.15% lines**.
- Integrity gate: **83/83 registered files at 100% statements, branches, functions, and lines**.
- Typecheck, lint, 223-file boundary check, release-matrix contract, JavaScript/shell syntax, and `git diff --check`: **passed**.
- No CNG/prebuild/Gradle/EAS build, APK/AAB creation, signing, install, emulator/device/Maestro execution, physical benchmark, accessibility/design observation, owner-token use, promotion, or Terminal Seal execution occurred.

## Task Commits

1. **Task 1 RED: Exact-candidate and workflow failure contracts** — `bd08034` (`test`)
2. **Task 1 GREEN: Production candidate automated evidence** — `0e9de1f` (`feat`)
3. **Task 2 RED: Attended/promotion/Terminal Seal failure contracts** — `6edeb2b` (`test`)
4. **Task 2 GREEN: Immutable attended release gate** — `70501bd` (`feat`)
5. **Review RED: Evidence-gate findings** — `cc784bd` (`test`)
6. **Review RED: Additional security findings** — `c59f33a` (`test`)
7. **Review GREEN: Strict retained evidence and post-promotion proof** — `cfb0cdc` (`fix`)
8. **Review RED: Owner-evidence workflow findings** — `cccae1d` (`test`)
9. **Review RED: Promotion concurrency and tag validation** — `e50c3d5` (`test`)
10. **Review GREEN: Explicit owner token and protected upload** — `7dab87c` (`fix`)
11. **Review RED: Workflow bootstrap and evidence-root safety** — `031b6ad` (`test`)
12. **Review GREEN: Safe validator checkout and bounded staging root** — `b70e836` (`fix`)
13. **Review RED: Candidate provenance and recursive staging** — `51ce099` (`test`)
14. **Review GREEN: Proven candidate before recursive staging** — `1e12084` (`fix`)
15. **Review RED: Actions API permission** — `b7c8e5c` (`test`)
16. **Review GREEN: Authorized evidence provenance reads** — `c21ba79` (`fix`)

Every commit ends with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`.

## Decisions Made

- Development-test builds and identifiers can provide source-equivalent historical proof only; they are rejected for exact production-candidate claims.
- Automated emulator evidence is distinct from attended emulator, physical-phone, assistive-technology, design, owner approval, and Terminal Seal evidence.
- A plausible digest without canonical evidence bytes is never sufficient for release promotion.
- Promotable candidate artifacts upload only on workflow success. Failure diagnostics are retained separately and cannot be selected as release bytes.
- Promotion completes before Terminal Seal. Immutable promotion proof is emitted after public asset hashes pass, and the final command validates that proof.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Replaced Phase 3/4 deferred validator stubs with real consolidated production flows**
- **Found during:** Task 1 preimplementation audit
- **Issue:** Existing Phase 3/4 scripts described deferred cases but had no executable production-package flow YAMLs for the final release candidate.
- **Fix:** Added four production black-box Phase 5 flows and bounded source/device/performance producers, while preserving honest automated-only classification.
- **Files modified:** `maestro/phase5/*`, `scripts/run-phase5-maestro.mjs`, `scripts/benchmark-phase5.mjs`, `scripts/verify-phase5-native-evidence.mjs`
- **Commit:** `0e9de1f`

**2. [Rule 2 - Missing Critical] Made manifest creation immediate and authoritative after the single build**
- **Found during:** Task 1 preimplementation audit
- **Issue:** The existing workflow did not propagate an explicit recomputed manifest SHA into all final-candidate producers or forbid post-manifest build commands by contract.
- **Fix:** Added workflow-order validation, production embedded-config/version checks, candidate workflow provenance, and explicit manifest SHA arguments for every producer.
- **Files modified:** `.github/workflows/release-candidate.yml`, `scripts/create-release-candidate-manifest.mjs`, `scripts/phase5-candidate-evidence.mjs`, `scripts/phase5-workflow-contract.mjs`
- **Commit:** `0e9de1f`, `70501bd`

**3. [Rule 2 - Missing Critical] Replaced digest-only attended approval with immutable row and attachment evidence**
- **Found during:** Task 2 preimplementation audit
- **Issue:** The predecessor promotion verifier accepted a plausible attended digest without reading the underlying evidence.
- **Fix:** Added exact row union/order, pending-only generation, strict non-manufacturing recorder, byte-level attachment and automated-evidence validation, device/candidate binding, and disabled the legacy digest-only route.
- **Files modified:** `scripts/generate-phase5-attended-checklist.mjs`, `scripts/verify-phase5-release-gate.mjs`, `scripts/verify-release-promotion.mjs`, `package.json`
- **Commit:** `70501bd`

**4. [Rule 2 - Missing Critical] Hardened cross-run promotion and public hash verification**
- **Found during:** Task 2 preimplementation audit
- **Issue:** Promotion downloaded by artifact name without selecting/proving successful source runs and published immediately without a post-upload hash gate.
- **Fix:** Added explicit run/repository/commit validation, successful/nonexpired artifact selection, reuse and existing-tag rejection, exact candidate checkout, draft upload, public download/hash verification, and publish-after-verify ordering.
- **Files modified:** `.github/workflows/release-promotion.yml`, `scripts/phase5-promotion-contract.mjs`, `scripts/verify-phase5-release-gate.mjs`
- **Commit:** `70501bd`

**Total deviations:** 4 Rule 2 correctness/security additions required by the release-blocking audit.

## Independent Review Remediation

All independent evidence/security findings were closed through six additional RED/GREEN rounds. The final coverage includes strict aggregate/producer/raw-report revalidation, retained checklist/observation bytes, exact Phase 2 dual-role fidelity, bounded recursive attachment defenses, protected owner-supplied observation and attended workflows, explicit owner-token provenance, dispatch-input isolation, workflow path/event/environment/artifact pinning before candidate code execution, multiline backup-rule and Android timing fixes, unique promotion proof/script keys, repository-wide promotion serialization, strict release-tag validation, required Actions API permission, and post-promotion Terminal Seal proof.

## Post-summary source reconciliation — `8ac43a9`

The original `actuals`, Performance, and sixteen Task Commits above remain the
historical Plan 05-07 closure figures. Five later review/remediation commits
(`ceb4339`, `d433c09`, `798aa70`, `d6f5cad`, and `8ac43a9`) changed seven
source/test files with 521 insertions and 41 deletions:

- cancelled, late-completing, and unmounted backup work now discards every
  unshared opaque archive handle; cleanup failure stays bounded to
  `GT-BACKUP04`;
- replaced, abandoned, and stale restore previews invalidate their exact
  single-use preflight tokens, and a retry performs a fresh preflight;
- authenticated archive version and creation time plus bounded replacement
  counts/reference availability are rendered as eight individually accessible,
  labelled facts inside a supported list container; and
- React Native Android 0.86.2's unmapped `role="listitem"` was replaced by
  supported native text semantics. Exact announcement order remains part of the
  attended candidate gate.

Closure verification at `8ac43a9` passed 134 suites and 2,348 tests with
90.94% statements, 85.86% branches, 90.21% functions, and 91.13% lines; all
83 integrity-critical files passed at 100%. The focused Data and recovery suite
passed 19/19, the focused backup/restore subset passed 55/55, and typecheck,
lint, and diff hygiene passed. All source code-review and security findings are
closed. `REL-03` through `REL-06`, the real candidate, attended observations,
owner approval, promotion, and Terminal Seal remain pending.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: workflow-input-trust | `.github/workflows/release-promotion.yml` | Cross-run IDs, repository, commit, artifact names, record hash, and release tag cross a publication boundary; all are validated before draft creation. |
| threat_flag: evidence-file-access | `scripts/generate-phase5-attended-checklist.mjs` | Attended attachment paths are untrusted inputs; containment, regular-file, symlink, uniqueness, size, and SHA-256 checks fail closed. |
| threat_flag: release-publication | `.github/workflows/release-promotion.yml` | Public asset creation is irreversible; existing tags/runs are rejected and a draft is published only after downloaded asset hashes match retained bytes. |

## Known Stubs

None. Pending checklist fields are intentional blank evidence inputs for a future real attended run, not claimed implementation stubs.

## Deferred Release Gate — Intentionally Open

REL-03 through REL-06 remain pending until one future authorized run performs all of the following against one exact production candidate after source/docs/review commits are final:

1. Build/sign APK and AAB exactly once, immediately create and verify the canonical manifest, then run the production automated matrix against those retained bytes.
2. Complete attended emulator, physical phone, assistive-technology, minimum-device/Argon2 performance, and post-implementation design observations with immutable attachments.
3. Record every row as passed with concrete observations and supply the exact lowercase token `approved`; no token was used in this plan.
4. Run the repository-serialized no-rebuild promotion workflow with explicitly selected successful, unused candidate and attended runs, then retain its public-asset-verified `promotion-proof.json`.
5. After promotion plus all summary, verification, tracking, review, and commit work are complete, run the sole command in `05-TERMINAL-SEAL.md` as the literal final executable command and make no later tool call.

## Self-Check: PASSED

- All 37 changed source/workflow/document files exist.
- All sixteen task/review commits listed above exist and carry the required trailer.
- The full source and evidence suites pass after the final implementation.
- The later five-commit lifecycle/accessibility reconciliation is independently
  reviewed and source-clean at `8ac43a9`.
- No candidate, attended record, owner approval, release asset, or final verification output was created.

---
*Phase: 05-recovery-distribution-and-release*
*Completed: 2026-08-26 (source/automation preparation only)*
