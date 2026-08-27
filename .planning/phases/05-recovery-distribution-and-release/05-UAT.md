---
phase: 05-recovery-distribution-and-release
status: partial
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md, 05-06-SUMMARY.md, 05-07-SUMMARY.md, 05-VERIFICATION.md]
started: 2026-08-26T16:12:50Z
updated: 2026-08-26T16:29:00Z
source_code_head: null
candidate_commit: null
candidate_run: null
candidate_manifest_sha256: null
observations_run: null
attended_run: null
promotion_run: null
requirements_pending: [REL-03, REL-04, REL-05, REL-06]
terminal_seal: unexecuted
source_warnings_open: 0
---

# Phase 05 Exact-Candidate UAT and Release Gate

This is a pending operational checklist. It records no candidate, device result,
attended observation, owner approval, promotion, or Terminal Seal success. All
human verification is intentionally consolidated here and must use one exact
signed production candidate.

## Current Test

number: 1
name: Produce and exercise the exact private candidate
expected: |
  One signed APK/AAB build produces a canonical manifest and a complete
  candidate-bound automated evidence aggregate with no post-manifest rebuild.
awaiting: release repository, environment, and signing prerequisites

## Tests

### 1. Produce and exercise the exact private candidate
expected: One build produces retained signed APK/AAB bytes, a verified manifest, and the complete automated matrix bound to those exact bytes.
result: blocked
blocked_by: release-build
reason: The configured GitHub repository is empty/public with no default branch, no Actions secrets, and no protected release environments; the four release-signing variables and a release keystore are also absent locally. No workflow was dispatched and no key was generated.

### 2. Complete the canonical attended ledger
expected: Every Phase 2–5 row passes on the exact candidate with concrete immutable observations and attachments.
result: [pending]

### 3. Record approval and promote unchanged bytes
expected: The owner supplies literal lowercase approved only after all rows pass; promotion publishes the retained bytes and records matching public hashes.
result: [pending]

### 4. Execute Terminal Seal last
expected: After promotion and every tracking/commit action, the sole non-mutating command validates the complete release chain and no command follows it.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 1

## Gaps

[none yet]

## Guardrails

- Freeze and push a clean candidate commit before dispatch.
- Build and sign APK/AAB bytes exactly once. Do not rebuild after the canonical
  manifest is created.
- Bind every automated and attended artifact to the same candidate commit,
  manifest SHA-256, package/version, raw APK/AAB hashes, and embedded
  bundle/config hashes.
- Do not pre-populate observations or owner approval. The literal lowercase
  approval token is `approved` and is supplied only after every row passes.
- Promotion must finish and public asset hashes must match before Terminal Seal.
- The sole command in `05-TERMINAL-SEAL.md` must be the literal final executable
  command. No command or tool call may follow it.

## 1. Pre-candidate source gate

- [x] All Phase 5 source code-review findings are closed at source code HEAD
  `8ac43a9e20dbeaa0d77616b69bf232360cae0714`.
- [x] Full local source gate passes: 134 suites, 2,348 tests, and all 83
  integrity-critical files at 100%.
- [x] Restore preview uses one supported Android list container and eight
  individually accessible, labelled native text facts. Exact native announcement
  order remains an attended observation, not a source claim.
- [ ] Candidate commit is clean, pushed, and recorded above.
- [ ] The protected candidate environment and all four release-signing secrets
  are present.

Readiness audit on 2026-08-26: `fchoo/gym-tracker` had no remote default
branch, no Actions secrets, and no environments. Local
`RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`,
and `RELEASE_KEY_PASSWORD` were unset and no release keystore was found. A
release signing identity must be intentionally created or supplied and backed
up; the repository's public initial push and environment protection rules also
require owner authorization.

## 2. REL-03 and REL-04 — exact candidate and automated matrix

- [ ] Dispatch `.github/workflows/release-candidate.yml` once with an immutable
  lowercase candidate ID.
- [ ] Retain the signed APK and AAB produced by that single build.
- [ ] Create and verify the canonical manifest immediately after the build.
- [ ] Complete all 16 registered source/generated/native/installed-flow/benchmark
  commands against the retained bytes.
- [ ] Record the successful workflow run, repository, commit, package/version,
  manifest SHA-256, APK/AAB hashes, and embedded bundle/config hashes above.
- [ ] Confirm no build command ran after manifest creation and every automated
  result binds to the same manifest SHA-256.

## 3. REL-06 — one attended Phase 2–5 ledger

Generate the complete canonical cross-phase checklist with the repository tool;
do not hand-write or abbreviate its Phase 2, Phase 3, or Phase 4 rows. Every row
starts pending and requires a concrete observation plus an immutable attachment
bound to the candidate. The Phase 5 portion is exactly:

- [ ] `P5-AIRPLANE-WORKOUT`
- [ ] `P5-PROCESS-DEATH-RECOVERY`
- [ ] `P5-NOTIFICATION-STATES`
- [ ] `P5-CLEAN-RESTORE`
- [ ] `P5-ADAPTIVE-LAYOUT`
- [ ] `P5-TEXT-200`
- [ ] `P5-KEYBOARD-DPAD-FOCUS`
- [ ] `P5-REDUCED-MOTION-NON-COLOR`
- [ ] `P5-ASSISTIVE-TECH`
- [ ] `P5-MINIMUM-DEVICE-PERFORMANCE`
- [ ] `P5-POST-IMPLEMENTATION-DESIGN`
- [ ] `P5-PHYSICAL-ARGON2-CALIBRATION`

For the restore preview, verify `Review backup` receives focus, all eight
label/value facts are individually reachable and announced in visual order, and
the destructive warning plus typed confirmation follow them. React Native 0.86.2
does not promise positional `item N of 8` output for these facts; the acceptance
contract is the labelled definition/table-style sequence.

## 4. Owner approval

- [ ] Upload only existing human-authored observations and bounded immutable
  attachments through the protected evidence workflow.
- [ ] Confirm every canonical row passed on the exact candidate.
- [ ] Supply the literal lowercase `approved` token to the protected attended
  workflow.
- [ ] Record the successful observations run, attended run, artifact name, and
  attended-record SHA-256 above.

## 5. REL-05 — no-rebuild promotion

- [ ] Select the successful, unused candidate and attended runs.
- [ ] Promote the retained APK/AAB bytes without rebuilding.
- [ ] Verify downloaded public asset hashes match the retained candidate.
- [ ] Retain and record `promotion-proof.json` and its workflow run above.

## 6. Terminal Seal

- [ ] Confirm every implementation, review, UAT, tracking, and documentation
  update is committed and no further command or tool call is needed.
- [ ] Read, but do not duplicate here, the sole command in
  `05-TERMINAL-SEAL.md`.
- [ ] Execute that command exactly once as the literal final executable command.

## Requirement State

| Scope | State |
|---|---|
| DATA-01 through DATA-07 | Source verified |
| REL-03 through REL-06 | Pending exact-candidate gate |
| Phase 05 | Executing |
| Milestone v1.0 | Not releasable |
