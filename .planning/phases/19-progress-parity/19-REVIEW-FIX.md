---
phase: 19-progress-parity
fixed_at: 2026-10-13T14:17:01Z
review_path: .planning/phases/19-progress-parity/19-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-10-13T14:17:01Z
**Source review:** `.planning/phases/19-progress-parity/19-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 3
- Fixed: 3
- Skipped: 0
- UI review retained: 24/24, zero BLOCKER/WARNING/FLAG findings
- Security review retained: 41/41 threats closed
- Native execution: `NOT_RUN`, as required; Phase 20 ownership is unchanged

## Fixed Issues

### CR-01: Editing a retained target after a non-CAS failure permanently reuses the failed request identity

**Status:** fixed: requires human verification
**Files modified:** `src/ui/components/RunningTargetSheet.tsx`, `src/bootstrap/runningPlanRuntime.test.tsx`
**Commit:** `0ea34509`
**Applied fix:** Bound each retained target request ID to a canonical fingerprint of every mutation field. An unchanged retry keeps the exact request identity for lost-acknowledgement replay; changing any draft field allocates a new request identity, while a prior ambiguous commit is still fenced by the stale source revision and authoritative reload path. Added a real sheet/runtime regression covering pre-commit failure, retained edit, new request, and committed read-back.

### CR-02: Production All ordering never supplies factual ordering metadata for Strength goals

**Status:** fixed: requires human verification
**Files modified:** `src/domains/progress/dashboardProjection.ts`, `src/platform/sqlite/repositories/progressRepository.ts`, `tests/sqlite-host/progressRepository.test.ts`
**Commits:** `cdd8dfe5`, `2e0164d4`
**Applied fix:** Reused one stable semantic Strength goal identity in both projection grouping and repository ordering. The repository now emits a complete cross-sport order from persisted Strength completion times and Running goal creation times inside the same SQLite snapshot, then passes those declarations to the existing source-order/date/stable-identity comparator. A real-SQLite test proves both Strength-first and Running-first outcomes from changed factual ordering, including the legacy missing-source-revision path.

### CR-03: Activating an All active-goal row drops keyboard/D-pad focus

**Status:** fixed: requires human verification
**Files modified:** `src/ui/screens/ProgressScreen.tsx`, `src/ui/__tests__/ProgressScreen.test.tsx`
**Commit:** `c0566a3a`
**Applied fix:** Added a versioned external focus request to the sport segmented control. Activating an All active-goal row closes local surfaces, retains the selected range, switches sport, marks only the exact destination tab as preferred, and focuses its native ref after the selected render commits. The component regression asserts the destination tab's selected and preferred-focus state.

## Skipped Issues

None.

## Verification

Verification ran in the specified isolated worktree `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p19-fix5-live` on `agent-phase19-fix5`. Dependencies were resolved through a temporary worktree-local symlink to `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/node_modules`; the symlink is excluded from source identity and removed before handoff.

- TDD RED: each of the three new regressions failed against the pre-fix behavior before its source change.
- Focused GREEN: Running runtime 15/15, Running target sheet 9/9, Progress screen 33/33, Progress projection/repository unit 20/20, and real-SQLite Progress repository 28/28.
- Canonical Phase 19 host collector: PASS at `2e0164d40f0cf5116776fdb03d971d1f71605062`; source tree SHA-256 `a3cf97a8b80fe529b363c3ea19935187a033e7a50388ed2dabe5e593f05f2c88`.
- Full host/UI matrix: 312/312 suites and 4,612/4,612 tests passed across unit, components, SQLite-host, and integration projects.
- Integrity coverage: 25 owners and four changed-line scopes; 100% statements, branches, functions, and lines.
- Phase 19 evidence: all seven retained host commands PASS; 18/18 PRO records PASS; independent retained-manifest verification PASS.
- Production benchmark: PASS with exact 20/100/20/100/20/100 sample counts; useful-content max 8.380 ms, review-open p95 4.040 ms, targeted-rebuild max 19.963 ms, range-query p95 4.642 ms, chart-render p95 0.154 ms, and JS-task max 0.099 ms.
- TypeScript: PASS.
- Boundary scan: PASS across 429 files.
- Diff check: PASS.
- Multi-distance target, portability, receipt, evidence-identity, privacy, and benchmark invariants remain covered by the canonical matrix.
- Phase 19 UI review: 24/24 remains clean after source audit and focused interaction coverage.
- Phase 19 security review: 41/41 threats remain closed; no new SQL, external-input, logging, secret, or command-execution boundary was introduced.
- Android/Gradle/APK, adb, emulator/device, Maestro, native screenshots, and native benchmark: `NOT_RUN`.

## Scope Confirmation

- No Phase 16 files modified.
- No `19-REVIEW.md`, `19-UI-REVIEW.md`, or `19-SECURITY.md` edits.
- No shared component or Phase 14 files modified.
- No push, deployment, APK build, or native execution performed.

---

_Fixed: 2026-10-13T14:17:01Z_
_Fixer: TRAE (gsd-code-fixer)_
_Iteration: 2_
