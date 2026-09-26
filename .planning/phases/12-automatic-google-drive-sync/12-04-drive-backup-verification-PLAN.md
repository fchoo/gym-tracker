---
phase: 12-automatic-google-drive-sync
plan: 04
type: execute
wave: 4
depends_on: [12-03]
files_modified:
  - src/domains/backup/automaticBackupContracts.test.ts
  - src/domains/backup/automaticBackupCoordinator.test.ts
  - src/domains/backup/automaticBackupScheduler.test.ts
  - src/domains/portability/automaticPortability.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/mergePlan.test.ts
  - src/platform/google/googleAuthAdapter.test.ts
  - src/platform/google/driveBackupStoreAdapter.test.ts
  - src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - app/more/__tests__/data-and-recovery.test.tsx
  - src/testing/contracts/googleDriveBackup.contract.ts
  - src/testing/contracts/googleDriveBackup.contract.test.ts
  - tests/sqlite-host/automaticBackupStateRepository.test.ts
  - tests/integration/automatic-drive-backup.test.ts
  - scripts/benchmark-phase12-backup.mjs
  - scripts/benchmark-phase12-backup.test.mjs
  - scripts/phase12-evidence-scripts.test.mjs
  - scripts/run-phase12-maestro.mjs
  - scripts/prepare-phase12-google-acceptance.mjs
  - scripts/record-phase12-google-acceptance.mjs
  - scripts/verify-phase12-evidence.mjs
  - scripts/verify-phase12-evidence.test.mjs
  - .github/workflows/pr.yml
  - package.json
  - .planning/phases/12-automatic-google-drive-sync/12-SECURITY.md
  - .planning/phases/12-automatic-google-drive-sync/12-VALIDATION.md
autonomous: false
requirements: [DATA-10]
must_haves:
  truths:
    - "The final matrix covers every backup/restore branch, crash boundary, writer fence, manifest state, environment boundary, and user-visible recovery path with no skipped required case."
    - "Host and real Expo SQLite run the same v23 generation, adoption, claim, rollback, reopen, and stale-writer cases against one manifest-bound Phase 12 APK."
    - "The dirty-generation trigger adds at most 16 ms p95 on the minimum supported Android profile, a maximum supported 24 MiB/100,000-row snapshot holds the SQLite writer for at most 1,000 ms, and maximum-size merge preflight stays within its approved elapsed-time and peak-memory budgets; scheduler/replacement recovery activation fails closed if any gate fails."
    - "PR CI has one explicit Phase 12 native producer and exact required Phase 12 SQLite, Maestro, benchmark, and evidence consumers; it no longer presents Phase 2 as the current native acceptance suite."
    - "Phase 12 cannot be marked complete until a dedicated-account signed dev-test emulator replacement flow and a physical-phone One-Tap/drive.file smoke test pass against real Google."
    - "Real-Google artifacts contain only manifest/build identity, case IDs, counts, sizes, timestamps, and hashes; they contain no tokens, emails, permission IDs, Drive IDs, or workout content, and cannot address production backup objects."
    - "The threat review states plainly that automatic snapshots are readable to Google-account holders, SHA-256 is not authentication or encryption, and account/device compromise is outside client-side confidentiality protection."
  artifacts:
    - {path: scripts/benchmark-phase12-backup.mjs, provides: manifest-bound Android dirty-marker, maximum-snapshot writer-occupancy, and maximum-size merge-preflight time/memory gates}
    - {path: scripts/verify-phase12-evidence.mjs, provides: fail-closed DATA-10 decision/requirement/evidence matrix}
    - {path: .planning/phases/12-automatic-google-drive-sync/12-SECURITY.md, provides: final trust-boundary and threat-mitigation closure}
    - {path: .planning/phases/12-automatic-google-drive-sync/12-VALIDATION.md, provides: host/native/UI/live-Google coverage audit}
    - {path: artifacts/native/phase12/build.json, provides: exact APK/source/package/device identity for all native evidence}
  key_links:
    - {from: Phase 12 build manifest, to: every native result, via: exact source-tree and APK hashes}
    - {from: crash-cut case ledger, to: host and Expo results, via: shared googleDriveBackup contract IDs}
    - {from: attended emulator reset, to: restored facts, via: dedicated dev-test Drive namespace and canonical digest comparison}
    - {from: physical phone, to: OAuth proof, via: signed package plus drive.file consent without destructive local reset}
---

<objective>Close DATA-10 with evidence proportionate to its recovery role: exhaustive deterministic contracts, real Expo persistence, accessible fake-port UI, enforceable performance and CI gates, a written threat model, and attended real-Google proof using an isolated dev-test namespace. No mocked result may be presented as proof of Drive behavior.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md
@.planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md
@.planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md
@.planning/phases/12-automatic-google-drive-sync/12-02-SUMMARY.md
@.planning/phases/12-automatic-google-drive-sync/12-03-SUMMARY.md
@.planning/phases/11-portable-history-merge-restore/11-VALIDATION.md
@.planning/phases/11-portable-history-merge-restore/11-SECURITY.md

Use one fresh artifacts/native/phase12/build.json produced after all Plans 01-03 application and harness changes. Every device, Maestro, benchmark, and attended result must bind to that exact source and APK identity. Never rebuild between producers. Deterministic CI uses fakes and a credential-free Google-enabled emulator; real-Google acceptance is attended and uses a dedicated test account plus the development-test namespace.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Close the failure, crash, fencing, and privacy matrix</name>
  <files>src/domains/backup/automaticBackupContracts.test.ts, src/domains/backup/automaticBackupCoordinator.test.ts, src/domains/backup/automaticBackupScheduler.test.ts, src/domains/portability/automaticPortability.test.ts, src/platform/google/googleAuthAdapter.test.ts, src/platform/google/driveBackupStoreAdapter.test.ts, src/platform/sqlite/repositories/automaticBackupStateRepository.test.ts, src/bootstrap/workoutAppRuntime.test.tsx, tests/sqlite-host/automaticBackupStateRepository.test.ts, tests/integration/automatic-drive-backup.test.ts, src/testing/contracts/googleDriveBackup.contract.ts, src/testing/contracts/googleDriveBackup.contract.test.ts, .planning/phases/12-automatic-google-drive-sync/12-SECURITY.md</files>
  <read_first>.planning/phases/12-automatic-google-drive-sync/12-CONTEXT.md, .planning/phases/12-automatic-google-drive-sync/12-RESEARCH.md, .planning/phases/12-automatic-google-drive-sync/12-01-SUMMARY.md, .planning/phases/12-automatic-google-drive-sync/12-02-SUMMARY.md, .planning/phases/12-automatic-google-drive-sync/12-03-SUMMARY.md, src/testing/contracts/googleDriveBackup.contract.ts, tests/integration/automatic-drive-backup.test.ts</read_first>
  <action>Audit the implemented branch-by-branch matrix and add every missing case. Contracts cover exact/min/max/max-plus-one manifest/snapshot/row/string sizes; missing Content-Length; canonical digest mismatch; malformed, truncated, duplicate, cross-environment, wrong-namespace, corrupt, unsupported, and future-schema payloads; permissionId/account/scope changes; raw ETag/If-Match and 409/412; multipart 5 MiB boundary; preallocated-ID retry after ambiguous create; resumable creation/chunk/query/restart/cancel; redirect/origin rejection; and bounded list/recovery scan.

Coordinator/state coverage includes zero-artifact initialization; invalid artifacts that remain quarantined; direct empty restore; non-empty previewed merge; same namespace; one-time adoption; collision; stale fingerprint/receipt/claim/connection/account/environment; active workout; local restore then claim then backup; claim failure; clean-restore acknowledgement; merge dirty state; old writer before and after claim; process restart before first publish; manifest conflict; disconnect/reconnect; latest/previous rotation; explicit previous fallback; future-schema update; missing/corrupt manifest recovery; ambiguous lineage; orphan grace; stale cleanup; disconnect retention; fresh-auth deletion tombstone; partial deletion; and a stale candidate upload that completes after the first permanent-delete sweep.

Run deterministic crash cuts after each durable boundary: quarantine persist, immutable candidate upload, candidate round-trip validation, manifest conditional promotion, manifest reread, local acknowledgement, direct restore/merge/adoption commit, pending claim, writer-epoch transfer, and cleanup selection. Reopen and prove old or new complete state only. Repeat persistence-critical IDs through the shared host/Expo contract. Use never-settling and rejecting fakes to prove complete, undo, finish, corrections, plan changes, foreground/background, and disposal never await backup.

Write 12-SECURITY.md with an ASCII trust-boundary diagram and threat table for Google auth/token refresh, permissionId identity, drive.file scope, readable JSON, environment isolation, ETag plus writer epoch, integrity digest, restore quarantine, namespace adoption, logs/evidence, cleanup/delete, stale phone, and account/device compromise. State that SHA-256 detects corruption but is not authentication, that anyone with Google-account access may read automatic backups, and that manual GTBK is the encrypted option. Confirm no automatic cipher/passphrase/SecureStore/Firestore path exists. Register every integrity-critical Phase 12 file in the exact 100 percent gate.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/backup/automaticBackupContracts.test.ts src/domains/backup/automaticBackupCoordinator.test.ts src/domains/backup/automaticBackupScheduler.test.ts src/domains/portability/automaticPortability.test.ts src/platform/google/googleAuthAdapter.test.ts src/platform/google/driveBackupStoreAdapter.test.ts src/testing/contracts/googleDriveBackup.contract.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/automaticBackupStateRepository.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/automatic-drive-backup.test.ts &amp;&amp; npm run test:components -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase12/build.json &amp;&amp; npm run test:sqlite:device -- --suite google-drive-backup --manifest artifacts/native/phase12/build.json</native></verify>
  <acceptance_criteria>All named cases pass with zero skips; every crash cut preserves one recoverable pair; host/Expo share exact case IDs; all precommit failures preserve source/schema/triggers/generations; stale writers cannot publish, acknowledge, or clean; and the security document closes or explicitly accepts every threat without claiming automatic encryption.</acceptance_criteria>
  <done>The backup/restore protocol has exhaustive deterministic safety proof and an honest closed threat model.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Enforce Android performance and exact Phase 12 CI</name>
  <files>src/domains/portability/mergePlan.ts, src/domains/portability/mergePlan.test.ts, scripts/benchmark-phase12-backup.mjs, scripts/benchmark-phase12-backup.test.mjs, scripts/phase12-evidence-scripts.test.mjs, scripts/run-phase12-maestro.mjs, scripts/verify-phase12-evidence.mjs, scripts/verify-phase12-evidence.test.mjs, .github/workflows/pr.yml, package.json</files>
  <read_first>src/domains/portability/mergePlan.ts, src/domains/portability/mergePlan.test.ts, scripts/benchmark-phase5.mjs, scripts/phase11-evidence-scripts.test.mjs, scripts/run-phase11-maestro.mjs, .github/workflows/pr.yml, package.json, artifacts/native/phase12/build.json</read_first>
  <action>Add a manifest-bound Phase 12 Android benchmark using bounded representative and maximum-supported synthetic histories. Across at least 100 mutation samples, the v23 dirty-generation trigger's added p95 latency must be at most 16 ms. Across at least 20 maximum-history captures, measured serialized-writer occupancy must be at most 1,000 ms p95. For maximum-size automatic merge preflight, first prove the planner builds one immutable index keyed by session/exercise/set and uses `MERGE_DIGEST_CONCURRENCY = 4` while preserving canonical output. Across at least 10 maximum-supported 24 MiB/100,000-row preflight samples on the minimum supported Android profile, elapsed time must be at most 10,000 ms p95 and peak process-memory growth over the settled preflight baseline must be at most 192 MiB. Also record snapshot byte/row count, post-lock serialization time, peak process memory, and multipart/resumable scheduling time without turning other observational values into false gates. Reject missing samples, stale source/APK identity, malformed timings, wrong fixture size, skipped cases, unbounded digest concurrency, non-equivalent merge output, or measurements taken with Drive/network work inside the writer. If a writer threshold fails, do not enable the automatic scheduler; if a merge threshold fails, do not enable replacement merge; remediation requires a separately reviewed design.

Replace the PR workflow's current Phase 2 native producer with one Phase 12 producer after the standard host gates. It builds artifacts/native/phase12/build.json once, then runs exact migrations-effects and google-drive-backup native suites, test:maestro:phase12, benchmark:phase12:backup, and verify:phase12:evidence consumers against that manifest. Preserve prior phase script availability and tests, but do not keep Phase 2 as the current native acceptance producer. Update required-script assertions to fail on a missing Phase 12 command. CI remains credential-free and uses deterministic auth/Drive ports; it must never contain a Google token or test-account secret.

Harden phase12 evidence tests against missing/extra case IDs, wrong environment/package, stale manifest/source/APK, skipped assertions, duplicate evidence, absent crash cuts, absent accessibility variants, cross-environment markers, secret fields, or a live-Google claim backed only by mocks. Run the complete fake-port Maestro flow from Plan 03 against the same APK and label it UI/lifecycle evidence only.</action>
  <verify><automated>node --test scripts/benchmark-phase12-backup.test.mjs scripts/phase12-evidence-scripts.test.mjs scripts/verify-phase12-evidence.test.mjs &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; npm run test:all -- --runInBand &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run android:devtest:fresh -- --suite phase12 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase12/build.json &amp;&amp; npm run test:sqlite:device -- --suite google-drive-backup --manifest artifacts/native/phase12/build.json &amp;&amp; npm run test:maestro:phase12 -- --manifest artifacts/native/phase12/build.json &amp;&amp; npm run benchmark:phase12:backup -- --manifest artifacts/native/phase12/build.json &amp;&amp; npm run verify:phase12:evidence -- --manifest artifacts/native/phase12/build.json --automated-only</native></verify>
  <acceptance_criteria>The one Phase 12 APK passes the dirty-trigger, writer-occupancy, and calibrated maximum-size merge time/memory gates, proves bounded digest concurrency and byte-equivalent deterministic merge results, exact native persistence and UI suites, all host gates, and a fail-closed automated evidence matrix; PR CI names and consumes that exact producer with no Google credentials.</acceptance_criteria>
  <done>Automatic backup cannot ship if it slows the workout writer, replacement merge can freeze or exhaust memory on a valid maximum-size backup, required recovery proof is skipped, or native CI is stale.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Complete attended real-Google replacement evidence</name>
  <files>scripts/prepare-phase12-google-acceptance.mjs, scripts/record-phase12-google-acceptance.mjs, scripts/verify-phase12-evidence.mjs, scripts/verify-phase12-evidence.test.mjs, .planning/phases/12-automatic-google-drive-sync/12-VALIDATION.md</files>
  <read_first>artifacts/native/phase12/build.json, .planning/phases/12-automatic-google-drive-sync/12-SECURITY.md, scripts/verify-phase12-evidence.mjs, scripts/phase12-evidence-scripts.test.mjs</read_first>
  <action>Create trusted prepare/record tooling that accepts only the exact retained development-test APK and produces a checklist bound to its manifest/source/APK/package identities. Use a dedicated Google test account and prove the remote namespace contains no production objects before any mutation. Never print or persist tokens, email, permissionId, Drive IDs, object names containing account data, or workout rows; evidence stores only hashed/redacted identity, case IDs, object counts, sizes, times, digests, and pass/fail.

On one Google-enabled emulator, run the real replacement sequence: fresh dev-test install and One-Tap/drive.file consent; create known synthetic data; first immutable upload and validated manifest; create a second generation and prove latest/previous rotation; clear/uninstall only com.fchoo.gymtracker.devtest; reinstall the exact retained APK; reconnect; prove restore-first quarantine cannot upload; restore the detected latest; compare canonical source digest; claim a successor writer epoch; create and promote the post-restore backup; exercise corrupt-manifest bounded recovery and one generation-fenced orphan trash. Repeat reset with bounded local synthetic data before connection to prove non-empty previewed merge and one-time namespace adoption. Preserve old-writer credentials in the deterministic/native harness and prove stale rejection; do not require a second live device.

On the physical phone, install or use the same signed profile approved for the smoke test and prove One-Tap configuration, registered package/signing identity, drive.file consent, token refresh, and development-test environment isolation. Do not upload, download, clear, replace, merge, or inspect Gym Tracker backup data on the phone, and do not perform destructive restore there.

Present the generated checklist to the owner. Only after explicit attended approval, run the trusted recorder to publish the redacted result and final verifier. Write 12-VALIDATION.md mapping every DATA-10 clause and D-01 through D-08 to named unit, component, host SQLite, real Expo, Maestro, benchmark, emulator real-Google, or phone-smoke evidence. Phase 12 remains incomplete if either attended role is missing, rejected, stale, cross-environment, or tied to rebuilt bytes.</action>
  <verify><automated>node --test scripts/verify-phase12-evidence.test.mjs scripts/phase12-evidence-scripts.test.mjs &amp;&amp; npm run verify:phase12:evidence -- --manifest artifacts/native/phase12/build.json --require-real-google --require-emulator-replacement --require-phone-auth-scope</automated><manual>Owner verifies the generated emulator replacement and physical-phone auth/scope checklist and responds with the recorder's required approval signal.</manual></verify>
  <acceptance_criteria>The exact retained APK has redacted real-Google evidence for two-generation rotation, destructive emulator replacement restore, non-empty merge/adoption, writer transfer, manifest recovery and fenced cleanup, plus physical-phone One-Tap/drive.file/environment proof; production data and identifiers are absent.</acceptance_criteria>
  <done>DATA-10 has real transport and replacement evidence, not just mocks, without risking the owner's production backup or phone data.</done>
</task>
</tasks>

<verification>Run the full automated and native commands above against one fresh Phase 12 manifest, then complete the attended real-Google checkpoint without rebuilding. The final evidence verifier and 12-VALIDATION.md must map every requirement, decision, risk, performance threshold, UI flow, and real-Google case to fresh passing evidence with zero skips.</verification>

<success_criteria>Phase 12 is complete only when deterministic CI, exact host/native crash contracts, accessible fake-port UI, hard writer and maximum-size merge performance gates, security closure, and isolated attended real-Google replacement evidence all pass for the same source and APK identity.</success_criteria>

<output>Create .planning/phases/12-automatic-google-drive-sync/12-04-SUMMARY.md, 12-SECURITY.md, and 12-VALIDATION.md when done.</output>

## NOT in scope

- Concurrent multi-device use, live reconciliation, operation-log convergence, and conflict resolution between active phones; the product has one active backup writer.
- Automatic-backup passphrases, XChaCha or other client-side encryption, SecureStore key custody, key rotation, or recovery phrases; manual GTBK remains the encrypted option.
- Firestore, Firebase, a hosted service, family sharing, multi-account vaults, or appDataFolder.
- Guaranteed network completion after app close; background is best effort and launch/foreground is the recovery guarantee.
- Destructive testing of the owner's production phone data or production Drive namespace.
- Public/store release promotion; this phase verifies the signed personal-use development-test artifact and DATA-10 implementation.
- A two-column or context-rail Data & recovery tablet layout; recovery preserves one centered reading/focus order at every width.
- An in-app updater or unconfigured download link for future-schema backups; the personal APK flow explains how to return and Check again.
- A dedicated CSV page or pre-export confirmation sheet; CSV remains a proportional direct hub action.
- A bottom sheet or inline expansion for the three GTBK workflows; they require a dedicated Manual encrypted backup route.

## What already exists

| Existing capability | Reuse in Phase 12 |
|---|---|
| Phase 11 canonical logical snapshot collector and 24 MiB/100,000-row bounds | Sole source for automatic snapshot facts and limits; no raw database dump or second table list. |
| Phase 11 direct restore, merge planner, fingerprinted private writer, and deterministic rebuild | Wrapped by narrow automatic ports; the planner is indexed and concurrency-bounded without changing output, and no duplicate restore/merge engine is added. |
| SQLite FIFO BEGIN IMMEDIATE writer | Preserves coherent capture and atomic generations; capture is idle-only and measured. |
| Phase 11 native contracts and manifest-bound evidence tooling | Extended with Phase 12 suite recognition and case IDs rather than replaced. |
| Data & recovery route and manual GTBK/CSV actions | Split into a compact hub plus dedicated manual route while preserving behavior through controller-level parity tests; CSV remains a direct hub action. |
| Repository DESIGN.md and semantic theme/type/spacing tokens | Calibrate every Phase 12 screen; no new visual language or local color/type literals. |
| AdaptiveScreen, ScreenHeader, ContentCard, PrimaryAction, SecondaryAction, InlineNotice, and ConfirmationSheet | Reuse for the approved one-column hub, guided stages, attention states, and confirmations. |
| Existing Phase 11 GTBK state machines | Extract into one UI-owned controller and pure preview components before the route split; preserve review focus, exact confirmation, cancellation, safe errors, and rebuild retry. |
| helper-payroll-app One-Tap and bounded Drive parsing patterns | Read-only references for auth/REST structure; unconditional PATCH, Firestore, and encryption are rejected. |

## Architecture and state flow

```
authoritative SQLite commit
        |
        +-- same transaction --> mutation_generation = G
        |
        +-- post-commit hint --> single-flight scheduler
                                  |
                         [no active workout]
                                  |
                    coherent snapshot + G under writer
                                  |
                         release SQLite writer
                                  |
                   canonical JSON + SHA-256 + upload
                                  |
                     bounded download + full validate
                                  |
            manifest If-Match: latest=new, previous=old latest
                                  |
                       reread manifest + validate
                                  |
             acknowledge G only if epoch/account/ETag still match
```

```
new installation + Google login
             |
       restore quarantine ------------------------------+
             |                                           |
   no artifacts -> first backup pending           valid backup found
                                                         |
                                  +----------------------+------------------+
                                  |                                         |
                             local empty                              local non-empty
                                  |                                         |
                           direct restore                     preview + optional one-time
                                  |                            namespace adoption + MERGE
                                  +----------------------+------------------+
                                                         |
                                              local commit + rebuild
                                                         |
                                            durable pending claim
                                                         |
                                      ETag transfer to successor epoch
                                                         |
                                             active writer; backup owed
```

Inline diagrams should accompany the coordinator state machine, v23 claim/adoption rules, and shared crash-cut contract. Do not add diagrams to simple UI presentation helpers.

```text
persisted coordinator / scheduler state
                 |
       root-runtime projection
                 | generation-fenced publish
      +----------+-----------+
      |                      |
 Data & recovery   Automatic backup settings
      |                      |
 route unmount detaches presentation only after restore starts
```

## Failure-mode summary

| Boundary | Example failure | Test | User outcome |
|---|---|---|---|
| Google identity | Scope revoked or account switches during refresh | Adapter and coordinator account-generation cases | Backup pauses; local workouts continue; reconnect offered. |
| Snapshot capture | Process dies or writer transaction fails | Host/Expo rollback and reopen cases | Dirty generation remains; next foreground retries. |
| Candidate transfer | Simple/resumable upload is partial or times out | Size-bound and resumable interruption cases | Manifest remains on prior verified pair. |
| Validation | Digest, schema, environment, namespace, or graph invalid | Parser/coordinator matrix | Candidate is never promoted; bounded recovery copy/status shown. |
| Manifest promotion | ETag changes or writer epoch is stale | Raw If-Match and stale-writer cases | No blind retry; stale phone becomes paused. |
| Local acknowledgement | Process dies after manifest promotion | Crash-cut reopen receipt case | Reread proves accepted snapshot, then idempotently acknowledges. |
| Restore/merge | Validation, collision, write, commit, or rebuild fails | Automatic portability host/native matrix | Source remains unchanged or rebuild stays pending; cloud remains quarantined. |
| Presentation publication | A stale scheduler/account callback arrives after reconnect or route remount | Runtime-provider generation/subscription matrix | Older result is ignored; both routes render the same current model. |
| Retention/delete | Stale cleanup or partial destructive delete | Generation-fenced cleanup/delete cases | Referenced backups survive; partial outcome is explicit. |
| Performance | Capture exceeds writer budget or maximum-size merge exceeds time/memory budget | Manifest-bound Android benchmark | Automatic scheduler or replacement merge remains disabled; manual GTBK still works. |

No failure above is both silent and untested. Phase completion is blocked if the evidence matrix finds such a gap.

## Parallelization strategy

| Lane | Work | Modules | Depends on |
|---|---|---|---|
| A | Wave 1 contracts, OAuth/Drive adapter, v23/native harness | domains/backup, platform/google, platform/sqlite, scripts | Phase 11 |
| B | Automatic portability adapter | domains/portability, platform/sqlite | Wave 1 schema compatibility |
| C | Generation repository, coordinator, scheduler | domains/backup, platform/sqlite, bootstrap | Waves 1-2 foundations |
| D1 | Manual GTBK/CSV controller extraction, NavigationRow, and route registration | ui/portability, ui/components, app/more, app root | Coordinator public types only |
| D2 | Compact hub, Automatic backup settings, and guided recovery projection | app/more, bootstrap | C and D1 |
| D3 | State/accessibility matrices and fake-port Maestro | app tests, bootstrap tests, maestro, scripts | D2 |
| E | Final matrix, benchmark, CI, security, real-Google tooling | tests, scripts, workflow, planning evidence | Waves 1-3 merged |

Execute A and B sequentially where they share restore/schema files; C follows their merged contracts. D1 may begin against frozen public types, then D2 and D3 stay sequential because they share app/more and runtime test surfaces. E follows the merged source to avoid stale artifact identities. Do not run D1-D3 in parallel worktrees.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2d / CC: ~2h)** — Foundation — Implement bounded contracts, OAuth/Drive isolation, raw ETag writes, v23 state, native harness, and automatic portability ports.
  - Surfaced by: Architecture review — old plans had no executable automatic Phase 11 boundary or schema-23 compatibility.
  - Files: Plan 12-01 allowlist.
  - Verify: Plan 12-01 automated and native commands.
- [ ] **T2 (P1, human: ~3d / CC: ~3h)** — Backup engine — Implement atomic generations, writer fencing, validated immutable promotion, handover, recovery, retention, and idle scheduler.
  - Surfaced by: Architecture and code-quality review — multi-device change-log was unnecessary and unsafe for the replacement-phone goal.
  - Files: Plan 12-02 allowlist.
  - Verify: Plan 12-02 unit, integration, host, and real Expo contracts.
- [ ] **T3 (P1, human: ~2d / CC: ~2h)** — Recovery UX — In three green slices, extract manual/CSV controllers and register routes; build the approved runtime-projected hub/settings routes; then close the complete state/cancellation/accessibility and fake-port Maestro matrices.
  - Surfaced by: Design plus focused engineering review — the original single long page obscured protection proof, duplicated state machines, mixed administration/destruction with routine backup, and left runtime ownership/state publication underspecified.
  - Files: Plan 12-03 allowlist.
  - Verify: Plan 12-03 component, accessibility, and Maestro commands.
- [ ] **T4 (P1, human: ~2d / CC: ~2h)** — Verification — Close crash/security/performance/CI matrices, including maximum-size merge time/memory, and produce isolated attended real-Google evidence.
  - Surfaced by: Test and performance review — mock-only proof cannot validate OAuth, Drive preconditions, replacement restore, writer latency, or maximum-size merge viability.
  - Files: Plan 12-04 allowlist.
  - Verify: Plan 12-04 automated, native, benchmark, and attended gates.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|---|---|---|---|
| Phase 12 Data & recovery state family | `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/phase12-data-recovery-20260926/approved-guided-recovery.html` | Guided recovery mode | Compact proof-first normal hub; quarantine becomes one guided task; includes normal, restore, merge, problem, and automatic-settings references. |

## Design Review Outcome

| Pass | Initial | Final | Approved fix |
|---|---:|---:|---|
| Information architecture | 7/10 | 10/10 | Compact status/recovery hub plus separate Automatic backup settings and Manual encrypted backup routes. |
| Interaction state coverage | 8/10 | 10/10 | Persistent non-blocking restore-required state and complete visible-state matrix. |
| User journey | 8/10 | 10/10 | Three plain-language recovery stages with stage-specific recovery actions. |
| AI-slop / visual specificity | 9/10 | 10/10 | Neutral factual status, no filled success card, metric treatment, or status pill. |
| Design-system alignment | 8/10 | 10/10 | Shared NavigationRow contract and reuse of existing semantic primitives. |
| Responsive/accessibility | 8/10 | 10/10 | One centered 720dp column, 200% vertical growth, stable reading/focus order. |
| Unresolved decisions | 7 open | 0 open | Manual GTBK page, direct CSV, owner-facing merge summary, fallback tone, newer-build state, retired-phone state, and stage-aware cancellation resolved. |

Overall design completeness: **7/10 -> 10/10**. Fourteen design decisions were incorporated; none were deferred. The existing `TODOS.md` post-implementation visual QA item remains the rendered-device follow-up.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run |
| Codex Review | `/codex review` | Independent second opinion | 0 | - | Not run |
| Outside Voice | Independent Gemini review | Cross-model challenge | 1 | CLEAR | Passed; 3 low-risk clarifications folded into Plans 01-02 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR | Focused post-design recheck folded 10 findings with 0 unresolved and 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 7/10 -> 10/10; 14 design decisions incorporated; 0 unresolved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not applicable |

**CROSS-MODEL:** Internal architecture, code-quality, test, and performance reviewers converge with the earlier independent Gemini review on the replacement-backup architecture. Two fresh outside-voice agents timed out and the Codex CLI fallback failed with HTTP 401, so no new external recommendation was incorporated.

**VERDICT:** ENG + DESIGN + OUTSIDE VOICE CLEARED - ready to implement.

NO UNRESOLVED DECISIONS
