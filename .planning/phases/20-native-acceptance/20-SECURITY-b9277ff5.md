---
phase: 20
slug: native-acceptance
status: verified
exact_sha: b9277ff557998f1ddf35db0a85aa9630c696e3b2
independent_source_sha: b9277ff557998f1ddf35db0a85aa9630c696e3b2
base_sha: 835fe6ef74fdc940228302b754718b3ee33eebd9
audit_scope: final-source-security-continuation
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
unregistered_flags: 0
accepted_risks: 0
transfer_risks: 0
asvs_level: 1
block_on: high
score: 100
native_proof: not_run
native_acceptance_pending: true
created: 2026-10-22
---

# Phase 20 source security

Independent source-security continuation verified **49/49** authored mitigations on exact commit `b9277ff557998f1ddf35db0a85aa9630c696e3b2`, reviewing `835fe6ef..b9277ff5`. Zero open threats, unregistered flags, transfer risks, accepted risks or warnings. Score 100, ASVS L1, block threshold high. This source gate is not native acceptance or release authorization.

The read-only auditor loaded root instructions, security configuration, all twelve authored Phase 20 threat models, available summaries and the nine-file changed delta. No implementation writes, tests, native/device/install/build actions, commits, pushes or new worktrees were performed. Parent records this report from the independent result; historical detailed reports remain preserved as `20-SECURITY-3550e7f3.md`, `20-SECURITY-59d9085e.md` and `20-SECURITY-73e1e41a.md`.

## Changed boundary verification

| Boundary | Independent evidence |
|---|---|
| Strict token verdict metadata | `scripts/v12-artifact-privacy.mjs:9,39-46`: only five exact string verdicts are accepted under `token_measurement_verdict`; unknown strings, arrays and objects fail before the leaf bypasses recursion. Existing forbidden key/text/private-location/JWT checks remain. Attacks covered in `v12-artifact-privacy.test.mjs:51-63`. |
| Portable process ownership | `scripts/v12-posix-process-tree.mjs:16-19,34-98,151-170`: procps-compatible Linux `ps axeww -o` preserves full ownership enumeration, malformed/oversized/probe failure rejection, all-candidate pidfd transactions and fail-closed behavior. No numeric PID/PGID fallback. |
| Stable signal identity | `scripts/v12-linux-pidfd-signal.py:85-100`: acquire all stable handles, validate all pinned environments, then signal; helper/source implementation unchanged by the portable probe correction. |
| Coherent retained Phase 14 closure | `scripts/phase20-subprocess-coverage.test.mjs:76-104,1664-1669,1877-1954`: explicit current app/src copy and hash checks, source digest rebinding, complete retention validation and member/publication hash rebuilding. |
| Opt-in test fixture / pinned authority | `scripts/testing/v12-phase14-shell-evidence-fixture.mjs:178-180,361-370,404-457`: production-shaped fixture requires explicit source root and pinned visual authority; lightweight defaults remain; artifact paths are relative and missing retained reads fail. No hardcoded private HTML path. |
| Non-native evidence isolation | `phase20-subprocess-coverage.test.mjs:2329-2355` and `v12-phase20-cli-blackbox.test.mjs:115-122,390-398`: controlled fixture origins remain test-only; fake-origin preseal/final/readiness fails. Host fixtures never substitute for native observations. |
| Python and React follow-ups | Only unit assertions changed: default `secrets.token_urlsafe(24)` callback is exercised, and state-updating runtime actions/subscribers are awaited inside act. No production app/Garmin transport implementation changed. |
| Selected transport | Standalone Chaquopy/ARM64/Python 3.13 source and packaging are untouched; no FIT, desktop bridge, broker, partner API or runtime-agent fallback added. |

## Authored register coverage

Plans 20-01 through 20-11 register four threats each; Plan 20-12 registers five, total 49. All dispositions remain mitigate. Changed controls affect artifact privacy, source/configuration identity, process ownership, retained closure tamper resistance and fake-origin verdict separation. The independent audit reconfirmed those controls and verified that the remaining source mitigations were not invalidated by this delta. Detailed per-threat baseline registers remain in the preserved reports.

All 49 threats are closed; no accepted or transferred risk and no new unmapped endpoint, auth/network path, production schema mutation, raw-data output or producer-authored final verdict was introduced.

## Separate pending gates

- Final Linux tooling coverage must pass with the exact source-pinned coverage.py dependency and zero skips. A VM dependency mismatch is not a source-security PASS for that test gate.
- Fresh source/APK/device-bound Expo SQLite, Garmin, Calendar, functional, visual/accessibility and numeric performance observations remain required.
- Fresh unchanged-artifact SM-S916B observations and the sole final seal remain required.
- No production artifact readiness, Samsung completion, release authority or Terminal Seal is claimed.
