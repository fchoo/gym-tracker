---
phase: 07-post-candidate-ux-refinement
type: evidence
delivery_model: personal-use-signed-apk
recorded: 2026-09-14T00:00:00Z
merge_commit: c86e3da3666c4039c8896c6ef7d61b66023f1e3c
merge_pr: 26
main_head_at_reconcile: 5c695206f04e3188b82123b8b0562ed28ea96a84
signed_build_run: 34746276143
signed_build_workflow: personal-apk.yml
release_authorization: none
---

# Phase 7 Evidence Ledger (personal-use delivery)

This ledger records how Phase 7 (Post-Candidate UX Refinement) was delivered under the
personal-use v1 model. It records no owner-approval token, promotion, public release,
tag, or Terminal Seal — those are retired for personal-use (PR #29; tracked as V2-05).

## Source and merge identity

| Item | Value |
|---|---|
| Delivery branch | `main` |
| Phase 7 merge PR | #26 — "feat: complete Phase 7 post-candidate UX refinement" |
| Phase 7 merge commit | `c86e3da3666c4039c8896c6ef7d61b66023f1e3c` |
| Code-review re-review head | `c840b83f780b7e8339d40d599a9d0e210995d4c0` (07-REVIEW.md: clean, 0/0/0) |
| CI cleanup | PRs #27, #28 (CI tuning), #29 (removed obsolete release-ceremony workflows) |
| `origin/main` at reconciliation | `5c695206f04e3188b82123b8b0562ed28ea96a84` |

## Automated evidence

| Check | Result |
|---|---|
| Required PR contract suite on PR #26 | green (bootstrap, required-suite, typecheck-through-host-SQLite, clean generated Android, native SQLite + Maestro + benchmark, exact-byte round-trip) |
| `scripts/phase7-evidence-scripts.test.mjs` | 17 tests pass |
| `scripts/phase6-evidence-scripts.test.mjs` | 22 tests pass |
| `scripts/concept-g-image-contract.test.mjs` | icon-asset contract green (gated in candidate CI) |
| Coverage (PR #26 body) | 141 suites / 2,473 tests; 91.23% statements, 86.49% branches, 90.79% functions, 91.42% lines; all 83 integrity-critical files at 100% |

## Signed personal-use build (delivery artifact)

| Item | Value |
|---|---|
| Workflow | `personal-apk.yml` |
| Run | `34746276143` (conclusion: success) |
| Artifact | `gym-tracker-personal-apk` (signed APK + AAB + release-config.json + release-toolchain.json) |
| Signature | verified in-workflow via `apksigner verify` |
| Delivery | owner downloads and sideloads the signed APK unchanged |

## Requirement coverage

UX-11 through UX-22 are implemented, merged (PR #26), covered by the required automated
PR contract suite, and shipped in the signed personal-use APK. See
`07-VERIFICATION.md` for the per-requirement verdict.

## Retired for personal-use (tracked as V2-05)

- Fresh `phase7-YYYYMMDD-<sha>` candidate dispatch and exact-byte download/verify gate.
- Samsung SM-S916B N4 exact-byte attended observation as a release-blocking gate
  (optional owner confidence only).
- Owner-approval token, no-rebuild GitHub Release promotion, public asset hashing, and
  Terminal Seal (workflows removed in PR #29).
