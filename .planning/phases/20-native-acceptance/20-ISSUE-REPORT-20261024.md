# Phase 20 issue report — 24 October 2026

Current implementation source: `13688243644167ab9553a25ca2605bdc86a82625`.

The root-routing and isolated Recovery repair is physically verified on the Samsung SM-S916B. A fresh source-bound APK completed one setup sequence, published ARMED, restarted and published durable Recovery readback. Both complete payload hashes verified, and the phone displayed “Recovery cut armed” followed by “Recovery observation complete”. Phase 20 remains incomplete because this bounded diagnostic covers one Recovery case; the complete final acceptance matrix still needs one unchanged source/APK/Samsung run.

## Confirmed issues and current status

| Issue | Root cause and correction | Validation and status |
| --- | --- | --- |
| Root route rejected valid Recovery identity | The root paired global pathname with layout-local query parameters. `d67c3c2a` now uses global parameters at the root, with local leaf parameters and identity guards retained. | Earlier Samsung evidence verified route entry. The current Samsung arm/recover diagnostic now passes. Closed for this repair. |
| Duplicate Recovery setup | The leaf could mount under the previous navigator before the root installed the validated isolated branch. A root-owned context now gates native execution until its database name matches the nonce. | Host absent/mismatched-scope regressions pass. Current phone evidence has exactly one delete/migrate/seed/baseline/runtime setup sequence. Closed for this repair. |
| Fresh database deletion failed | Pinned Expo SQLite throws `ERR_DATABASE_NOT_FOUND` when a nonce database does not yet exist. Only an actual Error with that exact code is tolerated. | Strict error/non-Error and settlement tests pass; current phone setup passes. Other deletion failures remain errors. Closed. |
| SQLite closed while ARMED publication was pending | Three asynchronous barrier returns escaped the try/finally before publication set the armed state. All three returns are now awaited. | Three delayed-success regressions failed before repair; the complete 112-test Recovery scope passes. Current phone ARMED and Recovery readback pass. Closed. |
| Recovery result transport lost or mixed complete facts | Oversized single Android log records needed bounded chunks. ARMED and Recovery then collided because retained logs reused the same nonce/sequence numbers. Every Recovery chunk now carries the full payload digest and the host reconstructs streams by that digest. | Complete 38-test host-domain scope passes, including all 112 observations, retained two-phase logs, reorder/identical-repeat cases, ten malformed-stream cases and legacy Garmin compatibility. Physical ARMED/recovery hashes verify; zero malformed nonce records. Closed for this repair. |
| APK inspector stalled on archive input | Python waited for EOF on a large synchronous parent-to-child pipe. The inspector now receives the identical bytes through a private regular-file descriptor, with bounded execution and cleanup. | Complete four-file packaging scope:30 tests passed, inspector100% all four metrics, 160MiB regression passed. The same compiled APK inspected in under one second, and the fresh phone build passed. Closed. |

Exact-source review and security under `artifacts/native/host/recovery-final-13688243/` are clean; both previous P1 findings are closed and the security repair audit closes8/8 checks. Recovery's two new mandatory modules are100% statements, branches, functions and lines. Prepared coverage provenance covers206 critical modules:203 predecessor modules are byte-identical, one archive inspector has fresh replacement proof and two Recovery modules have fresh proof. No old aggregate is relabelled as a new test run.

## Owner data and existing corrections

Garmin remains connected after cold restart. Encrypted session-file presence and imported-table counts/digests were verified both after installation and after the Recovery diagnostic. The baseline is unchanged:one activity, one activity identity, zero revision proposals and zero revision decisions. No credentials were retrieved or resubmitted; no new import/sync was requested and raw rows were not logged or retained.

The owner-confirmed activity date/time remains unchanged. Missing compatible timezone evidence defaults to the registered `Asia/Singapore`; source named zones and incompatible historical/travel time/offset evidence take precedence. The earlier80-test timezone runtime scope remains valid through unchanged source bytes.

Earlier Garmin treadmill/metadata/detail/fractional-UTC corrections, Android native packaging, shared-log preservation, Calendar coverage registration and all11 pinned Maestro2.8 flow syntax repairs remain preserved. The USB connection was restored; current source-bound Samsung checks succeeded under the owner's extended-unlock authorization.

## Current native evidence

- Diagnostic APK SHA-256:`961f72a7c30ed390f13841e1c6bebdbabd55b801c5f61e88ce927d7ba2290d90`.
- Source/tree/installed-byte bindings, Android Python binaries and compiled native access passed. Build receipt:`artifacts/native/host/recovery-scope-log-136882436441/build-operation.json`.
- Physical route proof:`artifacts/native/host/recovery-scope-log-136882436441/physical-routing-2eeafa81bddd/result.json`.
- Exactly one setup; ARMED2935bytes in2chunks; Recovery4810bytes in4chunks. Both full SHA-256 digests verified; largest observed marker1844UTF8bytes.
- Owner preservation:`artifacts/native/host/recovery-scope-log-136882436441/owner-imported-facts-after-install.json` and `owner-imported-facts-after-recovery.json`.
- These receipts explicitly remain non-acceptance and unsealable. Earlier failed runs and the stalled a620 build remain preserved.

## Native automation repairs now verified

The earlier immutable run passed SQLite and then failed Recovery before its first cut. Its failed receipt remains unsealable. Subsequent diagnostics identified two independent automation defects: pinned Maestro2.8 default artifact capture cleared shared logcat, and Recovery headings rendered at the top edge beneath Android status bars.

The source-owned officialSDK path now disables artifact capture, binds all source/toolchain/JAR identities, uses actual YAML/Env/Orchestra/JUnit, and releases only its newly owned instrumentation PID after rechecking process birth and cmdline. Host/core/native binding coverage is complete; actual pass/fail/missing-device checks preserve logs and terminate the owned target. Remaining Calendar/visual/functional CLI paths are being migrated with their existing budgets and evidence guards intact.

The Recovery preparation/execution screen now applies actual safe-area insets on all four edges. Six regressions failed before repair;101affected tests pass. Fresh diagnosticAPK39eefe94 built fromcc7218 now passes the actual SDK ARMED visibility assertion. A restarted flow passes observation-complete only after normal-root readiness precedes the deep link; the original immediate-link attempt is preserved as failure. Both full payload hashes verify, setup is single, and SDK target absence verifies. The narrow root-ready production flow is committed and both phases pass the actual SDK. A richer post-commit interruption also passes on a fresh diagnostic nonce; prior timeout/readback-UI failures remain preserved, with no retry or acceptance claim.

Calendar migration is complete:59caller tests and84transport tests pass with whole affected modules100% statements/branches/functions/lines. Visual and directfunctional caller integration, retainedSDKprovenance and completecoverage are still active. They must complete before the fresh final-source acceptance build. Current successfuldiagnostics retain separate compiledapp/hostSDK source identities and cannot sealPhase20.

## Acceptance still outstanding

Create a fresh immutable final-source Samsung build/run, then collect its complete SQLite,112-case Recovery, native rollback, Garmin lifecycle/dedupe/matching, Calendar, functional, visual/accessibility and numeric performance evidence. Seven fresh attended observations follow on that same source/APK/device. The final validator may seal only after all required evidence passes.

These are unfinished acceptance requirements. Phase20 and production readiness remain incomplete. The owner draft is restored, the protected `.coverage` digest remains unchanged, and diagnostic leases were released. Continue from the latest section of `20-RESUMED-NATIVE-SYNC.md` without re-executing Phases13–19.
