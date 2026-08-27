---
phase: 05-recovery-distribution-and-release
plan: 02
subsystem: release-candidate-and-promotion-contracts
tags: [release, artifacts, sha256, signed-candidate, promotion, security]

requires:
  - phase: 05-recovery-distribution-and-release/05-01
    provides: fail-closed portability and crypto boundary
provides:
  - canonical private release-candidate manifest with raw and inner-file identities
  - retained-artifact verification and exact candidate/physical-record promotion checks
  - private build-once, nightly source-contract, and no-rebuild public-promotion workflows
affects: [phase-05-final-gate, distribution, github-release]

key-files:
  created:
    - scripts/create-release-candidate-manifest.mjs
    - scripts/verify-release-candidate-manifest.mjs
    - scripts/verify-release-promotion.mjs
    - scripts/build-release-candidate-once.sh
    - scripts/configure-release-signing.mjs
    - scripts/release-matrix-contract.mjs
    - scripts/release-candidate-contract.test.mjs
    - .github/workflows/nightly.yml
    - .github/workflows/release-candidate.yml
    - .github/workflows/release-promotion.yml
  modified:
    - package.json

key-decisions:
  - "A private candidate is a retained bundle whose canonical manifest binds source commit/tree/config, pinned toolchain, APK/AAB raw bytes, and required inner-file bytes."
  - "Promotion downloads the retained candidate, validates the canonical manifest and the exact lowercase approved physical record, then uploads those same files without a build command."
  - "The promotion tag targets the manifest source commit, so the public release cannot silently point at a later checkout."
  - "The source release matrix is explicit and automated-only; it does not create candidate, approval, or terminal-seal evidence."

requirements-completed: [REL-03, REL-04, REL-05]
coverage:
  - id: D1
    description: Synthetic APK/AAB archives prove raw and inner artifact digests, canonical candidate manifests, path rejection, and candidate substitution detection.
    requirements: [REL-03, REL-04]
    verification:
      - kind: node_test
        ref: scripts/release-candidate-contract.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Promotion accepts only an exact retained candidate plus canonical physical-review record with owner token approved, matching source and artifacts, and a valid release tag.
    requirements: [REL-04, REL-05]
    verification:
      - kind: node_test
        ref: scripts/release-candidate-contract.test.mjs
        status: pass
    human_judgment: false
  - id: D3
    description: Workflow contract prevents promotion from invoking Expo, Gradle, or EAS builds and requires retained-artifact verification before upload.
    requirement: REL-05
    verification:
      - kind: node_test
        ref: scripts/release-candidate-contract.test.mjs
        status: pass
    human_judgment: false

status: complete
---

# Phase 05 Plan 02: Candidate and Promotion Contract Summary

**Release identity is now bound to one privately retained APK/AAB bundle, and public promotion validates and uploads those same bytes without rebuilding.**

## Accomplishments

- Added a canonical release-candidate manifest that binds schema, candidate identifier, source commit/tree/config digests, package, fixed toolchain metadata, APK/AAB raw SHA-256/size, and required nested bundle/config hashes.
- Added strict candidate verification that rejects malformed, extra, noncanonical fields, unsafe paths, missing files, altered raw archives, altered inner files, and manifest/candidate substitutions.
- Added promotion verification that requires the exact candidate manifest hash, matching source/artifact identity, canonical physical-review record, valid release tag, and the literal lowercase owner token approved.
- Added a private candidate workflow: least-privilege read scope, protected environment, signing material only in the candidate job, one Gradle invocation for APK/AAB, canonical manifest verification, and 30-day private retention.
- Added no-rebuild promotion: it downloads retained bytes, validates the protected review record, confirms the recorded source commit, and creates the release from those downloaded files only. It contains no Expo, Gradle, or EAS build invocation.
- Added a nightly source-contract matrix plus named package scripts for release evidence, matrix completeness, candidate verification, and promotion verification.

## Verification

- npm run test:evidence:release — passed, 8 tests. Synthetic archives covered raw/inner digest drift, noncanonical or extra manifest fields, wrong approval token, stale manifest/source/artifact identity, malformed tags, and signing patch shape.
- npm run test:release-matrix — passed; all 12 required source/coverage/evidence contract scripts are present.
- node --check for the release scripts and sh -n scripts/build-release-candidate-once.sh — passed.
- npm run typecheck, npm run lint, npm run check:boundaries, and git diff --check — passed.

## Deferred Verification

No CNG generation, Gradle signing, APK/AAB build, artifact upload, workflow dispatch, device/emulator run, physical review record, approval evidence, public release, or Terminal Seal was produced. The workflows are source contracts only until the single final exact-candidate gate.

## Next Plan Readiness

Plan 05-03 can build the logical encrypted export tracer against the fixed GTBK contract. The candidate manifest/promotion chain remains ready to consume the exact final candidate only after the later attended evidence is real and complete.

---
*Phase: 05-recovery-distribution-and-release*
*Plan: 02*
*Completed: 2026-08-26*
