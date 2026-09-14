# Roadmap: Gym Tracker

## Milestones

- ✅ **v1.0 Personal-use Gym Tracker** — Phases 1-7 (shipped 2026-09-14, delivered as the signed personal-use APK)

## Delivery model

v1 ships as a signed personal-use Android APK/AAB built once by `personal-apk.yml`
(reviewed source gates → signed Gradle release build → `apksigner` verification →
downloadable artifact). The public-release ceremony (exact-candidate attended device
matrix, owner-approval token, no-rebuild GitHub Release promotion, and Terminal Seal)
is retired for the personal-use milestone (removed in PR #29) and tracked as **V2-05**
for any future public distribution.

## Phases

<details>
<summary>✅ v1.0 Personal-use Gym Tracker (Phases 1-7) — SHIPPED 2026-09-14</summary>

Full phase detail, requirements, and verification gates are archived in
`.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`,
and `.planning/milestones/v1.0-MILESTONE-AUDIT.md`.

- [x] Phase 1: Trustworthy Workout Loop (10/10 plans) — completed 2026-08-17
- [x] Phase 2: Owned Library and Planning (34/34 plans) — completed 2026-08-26
- [x] Phase 3: Calendar and History Integrity (5/5 plans) — completed 2026-08-25
- [x] Phase 4: Overall Progress and Complete Progression (8/8 plans) — completed 2026-08-26
- [x] Phase 5: Recovery, Distribution, and Release (7/7 plans) — completed 2026-09-14 (signed personal-use build; promotion ceremony retired)
- [x] Phase 6: Material 3 UX Remediation (9/9 plans) — completed 2026-09-06 (merged via PRs #10-#25)
- [x] Phase 7: Post-Candidate UX Refinement (10/10 plans) — completed 2026-09-14 (merged via PR #26)

**Coverage:** 94/94 v1 requirements (FOUND, WORK, LIB, HIST, PROG, UX-01..22, DATA, REL) mapped and complete.

</details>
