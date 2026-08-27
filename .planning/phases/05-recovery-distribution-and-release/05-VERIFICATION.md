---
phase: 05-recovery-distribution-and-release
verified: 2026-08-26T16:12:50Z
status: human_needed
score: 4/5 must-haves verified
behavior_unverified: 1
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "Data and recovery lifecycle: cancelled or abandoned secure backups and restore previews are invalidated/discarded; preview facts are semantic and bounded."
    - "Protected human-evidence upload has Actions read permission for trusted candidate-provenance inspection."
    - "Restore preview no longer relies on React Native Android's unmapped listitem role; it uses one supported list container and individually accessible labelled native text facts."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "On the signed release build, the complete app remains usable in airplane mode and passes the required native, adaptive, accessibility, performance, and visual-release gates; the public APK is byte-identical to the approved candidate."
    test: "Build one private production candidate, run its candidate-bound automated matrix, then complete the canonical attended checklist before no-rebuild promotion."
    expected: "All evidence and public APK/AAB hashes bind to one manifest/SHA-256 candidate identity."
    why_human: "No exact signed candidate, installed-device observations, owner approval record, promotion proof, or public assets exist yet; source and synthetic contract tests cannot prove those transitions."
decision_coverage:
  honored: 0
  total: 0
  not_honored: []
human_verification:
  - test: "Build/sign and retain one private production APK/AAB candidate; immediately create/verify its manifest and run the exact-candidate automated matrix."
    expected: "The single retained candidate has matching raw/inner hashes and candidate-bound source, Maestro, benchmark, and native aggregate evidence."
    why_human: "The release readiness audit found no configured signing secrets, protected environments, remote default branch, or local release keystore; no build, install, emulator, or device action was attempted."
  - test: "Complete every canonical attended row on the exact candidate: airplane, process death, notifications, clean restore, adaptive/rotation, 200% text, keyboard/D-pad/focus, reduced motion/non-color, assistive tech, performance, design, and physical Argon2 calibration."
    expected: "Every row is passed with concrete immutable observations/attachments bound to the candidate identity."
    why_human: "Physical, assistive, visual, notification, and performance observations require attendance."
  - test: "Record complete evidence with the literal lowercase token approved, then run protected no-rebuild promotion with selected successful candidate and attended runs."
    expected: "Promotion publishes downloaded retained bytes, verifies public hashes, and writes promotion-proof.json."
    why_human: "Owner authorization and public publishing are protected operational actions deliberately excluded from source-only verification."
  - test: "After promotion and all tracking/review work are complete, execute the sole command in 05-TERMINAL-SEAL.md as the literal final executable command."
    expected: "It non-mutatively validates candidate, evidence, promotion proof, and downloaded public assets."
    why_human: "Terminal Seal is intentionally a one-time post-promotion action and must not run early."
---

# Phase 5: Recovery, Distribution, and Release Verification Report

**Phase Goal:** The owner can safely export and recover all user-owned data, and can install the exact signed, physically approved, accessible Android release bytes.
**Verified:** 2026-08-26T16:12:50Z
**Status:** human_needed
**Re-verification:** Yes — after UI lifecycle and protected-evidence provenance repair

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Owner can create a versioned logical backup of user-owned plans, exercises, sessions, corrections, void state, settings, and content references; the default password-protected archive exposes no workout payload or plaintext residue. | ✓ VERIFIED | Explicit ownership filters collect source rows; GTBK v1 authenticates canonical header AAD before opening payload; commands wipe buffers and delete cache files. The repaired UI aborts a cancelled creation and discards late or unshared opaque archive handles. 55 changed command tests and 19 UI tests pass. |
| 2 | Owner can authenticate, preview, and restore a valid backup into an independently clean install, after which bundled references reconcile and search/progress/history rebuild to the same usable state. | ✓ VERIFIED | Route calls typed preflight/commit capabilities; logical restore uses one kernel.write transaction and marks rebuild_pending; reconciliation rebuilds FTS/history/progress and clean-install parity test passes. Repaired UI invalidates an abandoned/failed preflight token and displays a bounded semantic preview list; focused UI and restore-command tests pass. |
| 3 | Wrong password, tampering, unsupported version, oversized/malformed input, cancellation, validation failure, or insert failure leaves the existing database unchanged and shows a safe, actionable error. | ✓ VERIFIED | Authenticate/decrypt precedes parse; rollback tests compare canonical state for named transactional fault stages; UI maps errors to safe copy. Focused unit, host-SQLite, file-port, and UI suites pass. |
| 4 | Owner can export a versioned, safely escaped CSV with stable columns, explicit units, locale-independent values, timestamps, set kinds, corrections, void state, recommendations, and decisions. | ✓ VERIFIED | Factual SQLite rows flow through fixed v1 columns, canonical JSON/value serialization, RFC quoting/formula neutralization, then an explicit opaque-handle share lifecycle. Focused suites pass. |
| 5 | On the signed release build, the complete app remains usable in airplane mode and passes System/Light/Dark, compact/medium/expanded, rotation, 200% text, keyboard/D-pad, logical focus, reduced motion, non-color, notification, process-death, performance, and post-implementation visual review; the public APK is byte-identical to the approved candidate. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Private build-once, manifest, exact-candidate evidence, attended-ledger, no-rebuild promotion, and Terminal Seal contracts are substantive and tested. No real candidate/device/approval/promotion/public asset exists, so runtime release behavior is not proven. |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| src/domains/portability/backupContracts.ts | Logical snapshot ownership/limits | ✓ VERIFIED | 385 lines; explicit allowlist, bounds, and validation; focused tests pass. |
| src/domains/portability/backupFormat.ts and src/platform/crypto/aesGcmArchivePort.ts | GTBK v1 authenticated envelope | ✓ VERIFIED | Canonical AAD, bounded parse, decrypt-before-payload parse, fixed crypto dimensions, and cleanup. |
| logical backup repository, backup commands, Expo backup file port | Collection/encryption/cleanup/share | ✓ VERIFIED | Runtime constructs services; opaque archive handles and complete lifecycle are wired. |
| logical restore repository and restore commands | Validated one-transaction replacement | ✓ VERIFIED | Preflight before writer; typed REPLACE confirmation; rollback fault tests pass. |
| restore reconciliation repository | Reference reconciliation and rebuild retry | ✓ VERIFIED | Runtime startup and post-restore use FTS/history rebuild seams and preserve pending state on failure. |
| CSV serializer/repository/file port | Factual CSV and share lifecycle | ✓ VERIFIED | Real ordered SQLite source data flows through fixed serializer to explicit share/discard. |
| app/more/data-and-recovery.tsx | Accessible backup/restore/CSV UI | ✓ VERIFIED | Typed runtime calls, cancellation/late-result generations, opaque-backup discard, abandoned-restore token invalidation, one supported list container with eight individually accessible labelled text facts, safe states, and duplicate latches; 19 focused component tests pass. |
| release-candidate workflow and evidence scripts | Exact candidate automation | ✓ VERIFIED (contract) | Single build followed by manifest/evidence steps with manifest SHA; protected human-evidence provenance now requires Actions read permission; 19 focused Phase 5 evidence/workflow tests pass. |
| release-promotion workflow, attended checklist, Terminal Seal | No-rebuild release gate | ✓ VERIFIED (contract) | Validators reject mismatches/build steps; exact attended ledger and literal approved token are required; execution remains pending. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Data and recovery route | Workout runtime | Typed backup/restore/CSV calls | ✓ WIRED | Route calls createSecureBackup, discardSecureBackup, preflightSecureRestore, invalidateSecureRestorePreflight, commitSecureRestore, createCsvExport, and share methods; no direct repository import. |
| Workout runtime | SQLite repositories and file ports | Production service construction | ✓ WIRED | Runtime constructs collectors, restorer, reconciliation, production file ports, and exposes public capabilities. |
| Backup format | AES-GCM/KDF | Header AAD plus decrypt-before-parse | ✓ WIRED | Archive opens only after crypto authentication; adapter passes AAD as native additional data. |
| Logical restore repository | SQLite kernel | Serialized replacement | ✓ WIRED | One kernel.write wraps replacement and rebuild_pending update. |
| Reconciliation repository | FTS/history/progress seams | Ordered post-commit rebuild | ✓ WIRED | Calls rebuildSearchIndex then rebuildAll and marks ready only after checks. |
| CSV repository | Serializer/file port | Factual rows to bytes/share | ✓ WIRED | Runtime serializes source rows, writes opaque handle, and route shares/discards it. |
| Candidate workflow | Manifest/evidence producers | SHA-bound automation | ✓ WIRED | Manifest is created/verified before Maestro, benchmark, source, and aggregate evidence. |
| Promotion workflow | Attended validator/retained artifacts | Validated no-rebuild publish | ✓ WIRED | Downloads selected successful artifacts, validates attended evidence, drafts, public-hash checks, then publishes. |

### Data-Flow Trace

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Logical backup | Snapshot tables/catalog references | SQLite SELECTs over explicit user-owned filters | Yes | ✓ FLOWING |
| Restore | Validated snapshot/preview | Bounded read-only archive → authenticate/decrypt → validate | Yes | ✓ FLOWING |
| CSV export | CsvExportRow array | Serialized factual/audit/recommendation SQLite reads | Yes | ✓ FLOWING |
| Data and recovery UI | Handles/previews/statuses | Typed runtime services over real repositories/adapters | Yes | ✓ FLOWING |
| Release evidence | Candidate/evidence bytes | Retained workflow artifact contracts | Exact data source absent until final run | ⚠️ FINAL-GATE PENDING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Backup, crypto, cleanup, restore command, CSV serializer/file lifecycle | Focused unit suite | 8 suites / 206 tests passed | ✓ PASS |
| Collection, restore atomicity, reconciliation, clean-install parity, CSV repository | Focused SQLite host suite | 6 suites / 65 tests passed | ✓ PASS |
| Repaired backup/restore/CSV UI lifecycle | Focused component suite | 19 tests passed; non-failing React act-environment warnings observed | ✓ PASS |
| Repaired backup discard and restore-token invalidation | Focused command suite | 55 tests passed | ✓ PASS |
| Final evidence/provenance contracts | Focused Phase 5 evidence suite | 19 tests passed, including protected human-evidence upload provenance | ✓ PASS |
| Changed TypeScript surface | Typecheck | Passed | ✓ PASS |
| Real signed candidate/device/attended/promotion/seal | Intentionally not run | Final exact-candidate gate only | ? SKIP |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| DATA-01 | ✓ SATISFIED | Allowlisted logical collection; no raw database product path. |
| DATA-02 | ✓ SATISFIED | Argon2id/AES-GCM boundary with tested authenticated encryption and cleanup. |
| DATA-03 | ✓ SATISFIED | Authenticated metadata, bounded input, cache/owned-buffer lifecycle. |
| DATA-04 | ✓ SATISFIED | Authenticate/validate/preview before typed transaction commit. |
| DATA-05 | ✓ SATISFIED | Fault-stage rollback and safe-error coverage. |
| DATA-06 | ✓ SATISFIED | Local reference reconciliation, rebuild retry, clean-install parity. |
| DATA-07 | ✓ SATISFIED | Fixed CSV schema, safe escaping, decision/audit fields, explicit sharing. |
| REL-03 | ? NEEDS HUMAN | Complete nightly/candidate matrix contract; one real candidate execution pending. |
| REL-04 | ? NEEDS HUMAN | Build-once retained-candidate/manifest contract; no signed bytes created. |
| REL-05 | ? NEEDS HUMAN | No-rebuild promotion/public-hash contract; no protected promotion run. |
| REL-06 | ? NEEDS HUMAN | Hard candidate-bound attended gate; required observations intentionally unexecuted. |

### Test Quality Audit

| Test Set | Linked Requirements | Active | Skipped | Circular | Assertion Level | Verdict |
|---|---|---:|---:|---|---|---|
| Changed backup/restore command suites | DATA-01–05 | 55 | 0 | No | Value + behavioral | ✓ PASS |
| Changed Data and recovery component suite | DATA-01–07 | 19 | 0 | No | Behavioral | ✓ PASS |
| Changed Phase 5 evidence/workflow suite | REL-03–06 | 19 | 0 | No | Value + behavioral | ✓ PASS |

No disabled requirement tests found in the changed proof sets. Temporary synthetic fixture writes are independent negative inputs, not expected values generated by the system under test. No source-scope assertion weakness found.

### Anti-Patterns Found

No blocker or warning anti-patterns found. A scan found no unreferenced TBD/FIXME/XXX/TODO/HACK markers, placeholder output, hardcoded empty user data, or log-only production implementations in Phase 5 artifacts. The only placeholder text is a legitimate SQL parameter-placeholder variable in logicalRestoreRepository.ts.

### Decision Coverage

No trackable decisions were reported by the non-blocking CONTEXT decision-coverage gate.

## Human Verification Required

### 1. Produce and exercise the exact private candidate

**Test:** Build/sign APK and AAB once through the private candidate workflow; immediately generate/verify its canonical manifest and run its exact-candidate automated matrix.

**Expected:** One retained candidate identity with matching raw/inner SHA-256 hashes and candidate-bound source, Maestro, benchmark, and aggregate native evidence.

**Why human:** The release readiness audit found no configured signing secrets, protected environments, remote default branch, or local release keystore. No workflow was dispatched, and generating or supplying the long-lived release identity plus authorizing the first public push requires the owner.

### 2. Complete the canonical attended ledger

**Test:** Complete P5-AIRPLANE-WORKOUT, P5-PROCESS-DEATH-RECOVERY, P5-NOTIFICATION-STATES, P5-CLEAN-RESTORE, P5-ADAPTIVE-LAYOUT, P5-TEXT-200, P5-KEYBOARD-DPAD-FOCUS, P5-REDUCED-MOTION-NON-COLOR, P5-ASSISTIVE-TECH, P5-MINIMUM-DEVICE-PERFORMANCE, P5-POST-IMPLEMENTATION-DESIGN, and P5-PHYSICAL-ARGON2-CALIBRATION on that candidate.

**Expected:** Every row passes with concrete immutable observations/attachments bound to the candidate SHA-256 and installed package.

**Why human:** These are physical, assistive, visual, notification, and performance observations.

### 3. Record approval and promote unchanged bytes

**Test:** Record completed evidence using literal lowercase approved, then run protected no-rebuild promotion using selected successful candidate and attended workflow runs.

**Expected:** The recorder accepts only complete exact-candidate evidence; promotion publishes downloaded retained APK/AAB files, verifies public hashes, and writes promotion-proof.json.

**Why human:** Owner authorization and public publishing are protected operational actions.

### 4. Execute Terminal Seal last

**Test:** After promotion and all related tracking/review work are final, execute exactly the sole command in 05-TERMINAL-SEAL.md as the final executable command.

**Expected:** It non-mutatively validates existing candidate, automated/attended evidence, promotion proof, and downloaded public assets.

**Why human:** Terminal Seal is a one-time post-promotion finalization action.

## Gaps Summary

**No source or release-automation implementation gaps found.** This re-verification confirms that commits `ceb4339`, `d433c09`, `798aa70`, and `d6f5cad` close the UI lifecycle risks: cancelling or abandoning a secure backup invalidates the request and discards an eventual opaque archive; abandoned restore preflights invalidate their tokens; retry uses a fresh preflight; the replacement preview is bounded semantic content; and cleanup failure is safely mapped. Commit `8ac43a9` closes the Android source-role mismatch with supported list/text semantics, while native announcement order remains part of the attended gate. Commit `c21ba79` closes the protected evidence-provenance permission repair. DATA-01 through DATA-07 remain source-complete. REL-03 through REL-06 have fail-closed automation contracts but remain genuinely unexecuted until one exact signed candidate is built, attended, approved, promoted without rebuild, and sealed. That is the prescribed final release gate, not a code gap.

## Verification Metadata

**Verification approach:** Goal-backward re-verification of the prior report, UI lifecycle commits `ceb4339`/`d433c09`/`798aa70`/`d6f5cad`, semantics fix `8ac43a9`, release repair `c21ba79`, live code, workflows, and changed focused tests.
**Automated checks:** Full source gate passed 134 suites and 2,348 tests; 93 changed-scope tests passed; all 83 integrity-critical files passed at 100%.
**Human checks required:** 4 final-gate items.
**Candidate/device actions:** Not executed; release repository/environment/signing prerequisites are absent.
**Worktree note:** Pre-existing untracked .gsd and coverage directories were left untouched; only this report was added.

---
_Verified: 2026-08-26T16:12:50Z_
_Verifier: TraeCode (gsd-verifier)_
