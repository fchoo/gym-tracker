---
phase: 05-recovery-distribution-and-release
plan: 01
subsystem: encrypted-logical-backup-contract
tags: [backup, portability, argon2id, aes-gcm, integrity, privacy]

requires:
  - phase: 04-overall-progress-and-complete-progression
    provides: source-authoritative SQLite facts and deferred exact-candidate release evidence
provides:
  - logical-backup v1 allowlist, bounds, and fail-closed snapshot validation
  - GTBK v1 canonical AES-256-GCM envelope with authenticated canonical metadata
  - a narrow Expo AES-GCM archive adapter with owned-buffer cleanup
affects: [backup-export, backup-restore, recovery, release]

key-files:
  created:
    - src/domains/portability/backupContracts.ts
    - src/domains/portability/backupFormat.ts
    - src/domains/portability/backupErrors.ts
    - src/domains/portability/index.ts
    - src/platform/crypto/aesGcmArchivePort.ts
  modified:
    - src/platform/crypto/passwordKdf.ts
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "Backup v1 carries only a validated logical snapshot; it never copies SQLite/WAL/journal/recovery files."
  - "The exact canonical GTBK header prefix is AES-GCM AAD, and decrypt/authenticate occurs before payload parsing."
  - "SQLite text remains opaque bounded text even when it looks like JSON, preserving source value losslessly."
  - "All archive-owned password, key, plaintext, ciphertext, nonce, salt, AAD, and native-boundary temporary buffers are wiped in finally paths."

requirements-completed: [DATA-01, DATA-02, DATA-03]
coverage:
  - id: D1
    description: Logical snapshot parsing has an explicit user-owned table allowlist, strict type/identity checks, and bounded fields, rows, strings, and nesting.
    requirement: DATA-01
    verification:
      - kind: unit
        ref: src/domains/portability/backupContracts.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: GTBK v1 protects canonical header bytes as AAD and rejects malformed, noncanonical, unsupported, altered, or unauthenticated archives before payload parsing.
    requirements: [DATA-02, DATA-03]
    verification:
      - kind: unit
        ref: src/domains/portability/backupFormat.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: The AES-GCM adapter validates fixed key/nonce/tag sizes and wipes owned native-boundary copies for success and failure outcomes.
    requirement: DATA-03
    verification:
      - kind: unit
        ref: src/platform/crypto/aesGcmArchivePort.test.ts
        status: pass
    human_judgment: false

status: complete
---

# Phase 05 Plan 01: Encrypted Logical Backup Format Summary

**GTBK v1 is now a bounded, authenticated, logical-only archive format with an audited native AES-GCM boundary and no raw database payload path.**

## Accomplishments

- Added one explicit logical snapshot contract with source-table ownership, stable table ordering, 16 KiB header, 32 MiB archive, 24 MiB plaintext, 100,000 total-row, 25,000 per-table-row, 64 KiB string, and depth-16 limits. Unknown tables, inherited object keys, duplicate primary keys, malformed identities, unsafe numbers, and unsupported versions fail closed.
- Added GTBK v1 binary encoding: `GTBK` magic, version, big-endian canonical-header length, canonical UTF-8 header, ciphertext, and detached 16-byte AES-GCM tag. Header bytes are authenticated AAD; KDF/cipher/nonce/tag/length metadata must exactly match the locked Argon2id/AES descriptor.
- Added a strict Expo-safe Base64 codec with no Node Buffer dependency, authenticate-before-parse archive opening, safe typed archive errors, and cleanup of all owned temporary byte buffers.
- Added a narrow AES-256-GCM port that validates fixed crypto dimensions, owns and wipes native-boundary copies, and lazily loads the Expo implementation with explicit nonce, tag length, and additional data.
- Made the native Argon2 bridge lazy so tests can exercise the format without importing a device-only native module; production derivation remains unchanged.
- Added all three integrity-sensitive modules to the permanent 100%-coverage gate.

## Verification

- Focused contract suites passed: `backupContracts` (36 tests), `backupFormat` (43 tests), and `aesGcmArchivePort`, each at 100% statements, branches, functions, and lines.
- `npm run test:coverage` — passed: 121 suites / 2,081 tests; global coverage 90.91% statements, 85.57% branches, 90.40% functions, and 91.20% lines. All 72 integrity-critical files reached 100% in all four metrics.
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (211 files).
- `git diff --check` — passed.

The expected shell completion warning and Expo Go remote-push warning did not affect test status. Test data contains only synthetic archive/password material.

## Deviations from Plan

1. **Opaque source text preservation:** an initial validator attempted to parse strings that looked like JSON. A losslessness regression showed that SQLite text such as `{"textScale":1.25}` must remain text. The validator now bounds all strings without reparsing them.
2. **Own-property table validation:** an initial `in` check accepted inherited property names. A regression test established an own-property check, so inherited names such as `toString` cannot become backup tables.
3. **Jest-native compatibility:** the existing Argon2 bridge loaded a native module at import time. The bridge is now loaded only when deriving, retaining production behavior while allowing archive-contract tests to run without the device module.

## Deferred Verification

No Android build, CNG generation, emulator/device/Maestro run, physical KDF calibration, attended accessibility/design review, candidate approval evidence, or Terminal Seal was created. Those remain part of the single final Phase 5 release gate against one exact candidate.

## Next Plan Readiness

Plan 05-02 can now bind candidate manifests and release evidence to the same fail-closed format/release posture. Plan 05-03 can collect only validated logical rows and provide them to this envelope; neither path is permitted to emit a raw database copy.

---
*Phase: 05-recovery-distribution-and-release*
*Plan: 01*
*Completed: 2026-08-26*
