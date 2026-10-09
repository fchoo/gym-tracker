---
phase: 14-prototype-visual-shell
status: validated
nyquist: false
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
plans: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11, 14-12]
---

# Phase 14 Validation Contract

Phase 14 has been re-audited on this checkout. CNG, the package evidence command, the host evidence suites, and the source/APK/device byte identities pass. Nyquist is not complete on the current checkout because the retained font and native manifests are based at implementation commit `6a7eb050d43deee5150e95ebc2d8121a1ef66fd2`, while the current checkout is `77d7497f6c143de720dde70f628d0925968d699c`; the strict verifiers reject that head advance. The native verifier permits only evidence-file changes, but the validation-document commit is also in the diff. The font verifier requires exact equality and rejects the same advance.

## Exact environment

All commands below were executed with this pinned environment:

```bash
PATH=/Users/bytedance/.nvm/versions/node/v24.19.0/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:$PATH
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
ANDROID_SDK_ROOT=/opt/homebrew/share/android-commandlinetools
JAVA_HOME=/Users/bytedance/Library/Java/JavaVirtualMachines/temurin-17.0.20+8.jdk/Contents/Home
GYM_TRACKER_ANDROID_SERIAL=emulator-5554
NODE_OPTIONS=--max-old-space-size=8192
export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="$(node --input-type=module -e "import { GOOGLE_OAUTH_REGISTRATIONS } from './scripts/google-oauth-config.mjs'; process.stdout.write(GOOGLE_OAUTH_REGISTRATIONS.webClientId);")"
```

## Final identities

| Identity | Value |
|---|---|
| Source/test command commit | `46a219969a6e57cf94e5a67c507cf1d2c34a91e4` |
| Exact implementation head for CNG/native proof | `6a7eb050d43deee5150e95ebc2d8121a1ef66fd2` |
| Exact evidence commit | `a2486ba33895efa7ab5ffd915ffe8c7fa6fa53bf` |
| Phase 14 source tree sha256 | `b4d89baf7b4f9f15145f9d7c45b5159765fe255544e2e5611b7498142e77f4d6` |
| Phase 14 build manifest | `artifacts/native/phase14/build.json` |
| Phase 14 APK sha256 | `2b16921d8a60c867594be20fdcb66bc26d3da6fd7ca8147e44d50b3b8e746af3` |
| Phase 14 device identity sha256 | `96dcf303d772667590457dc76c2cd5ee828515c31e2af1b9fee5b3f440b204f9` |
| Phase 14 evidence verifier sha256 | `165db78562358320efdc1a3aa74dacb9e2a7ad234c48871bf26f015eece06e26` |
| Font proof manifest | `artifacts/native/phase14-font-proof/build.json` |
| Font proof APK sha256 | `6453eae760ff3e4e9a79c859b5ee08cadcdc5a6506b838aef18dc31fd306d1c9` |
| Font proof report | `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` |
| Font proof reviewed screenshot sha256 scale 1 | `9e399dbc77a57475135938736017a2b554d658417708062d0506a5d8f36d9369` |
| Font proof reviewed screenshot sha256 scale 2 | `4a16b7a012b315ea2ca4ea854555ce3f4dc3b23385a0d5202981f690c6a23a84` |

## Phase gate

The Phase 14 gate is not satisfied on the current checkout because the exact-head font and native CLI verifiers fail closed. The retained artifacts remain structurally complete and their source/APK/device component identities pass independently, but those facts do not override the strict current-head binding rules.

1. `test:evidence:v12:shell` exists in `package.json`, maps to the real Phase 14 shell evidence owner test, and passes.
2. `verify:cng` passes from a clean tracked implementation tree using the silently derived public web client ID from `scripts/google-oauth-config.mjs`.
3. A fresh exact-head `phase14-font-proof` APK and a fresh exact-head `phase14` APK were built, installed, and retained with matching installed APK hashes.
4. The retained font proof contains passed cases at both scale `1.0` and `2.0`, with refreshed overlay review, but the current-checkout existing-proof verifier fails `phase14_font_manifest_stale` because its manifest base head is not the current HEAD.
5. The retained 13-stage / 17-cell Phase 14 native matrix is structurally complete and all source/APK/installed-APK/device hashes match, but `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` fails `phase14_manifest_stale` because the current validation-document commit is outside the evidence-only allowlist.
6. The requested post-evidence package/evidence/type/lint/boundary gate passed on the refreshed evidence head.
7. The DEV-02 owner record remains approved, with exact Light title and sport token roles preserved and native blended-fill evidence marked passed in `shell.tokens`.
8. The Phase 14 validation document records the re-audit truth: CNG, `adb` availability, and the missing package command are resolved, while the two current-head stale-manifest blockers remain escalated.

## Task closure (prior exact-head snapshot)

| Task | Automated proof | Native/artifact proof | Verdict |
|---|---|---|---|
| 14-01-T1 | `phase14-font-proof.test.mjs` PASS | Official font/oracle inputs consumed by exact-head proof | CLOSED |
| 14-01-T2 | font-proof CLI tests PASS | Production-isolated proof route exercised by fresh APK | CLOSED |
| 14-02-T1 | font-proof self-tests PASS | Exact-head Android font proof PASS at scales 1.0 and 2.0 | CLOSED |
| 14-02-T2 | theme/store/component coverage PASS | `shell.appearance` and `shell.tokens` exact-head native evidence PASS | CLOSED |
| 14-02-T3 | startup/root failure tests PASS | `shell.launch` exact-head native evidence PASS | CLOSED |
| 14-03-T1 | root shell tests PASS | `shell.four-roots` and `shell.root-state` exact-head native evidence PASS | CLOSED |
| 14-03-T2 | focus/deep-route tests PASS | `shell.root-state` focus/back trace PASS | CLOSED |
| 14-04-T1 | BottomSheet tests PASS | `shell.sheets` keyboard/escape/scrim/IME native evidence PASS | CLOSED |
| 14-04-T2 | dialog/delegation tests PASS | shared sheet/dialog native frame evidence PASS | CLOSED |
| 14-04-T3 | toast tests PASS | `shell.toasts` reduced-motion/native avoidance evidence PASS | CLOSED |
| 14-05-T1 | Active Workout sheet regressions PASS | `shell.sheets` native picker/dock evidence PASS | CLOSED |
| 14-05-T2 | timing/date sheet regressions PASS | `shell.sheets` native timing/date evidence PASS | CLOSED |
| 14-05-T3 | duration/start regressions PASS | `shell.sheets` native start/cancel/focus evidence PASS | CLOSED |
| 14-06-T1 | settings route/component tests PASS | `shell.appearance` and `shell.settings-deep-links` native evidence PASS | CLOSED |
| 14-06-T2 | rest-alert settings tests PASS | `shell.rest-alerts` and `shell.settings-deep-links` native evidence PASS | CLOSED |
| 14-07-T1 | removed-session lifecycle tests PASS | `shell.removed-sessions` restore/reload evidence PASS | CLOSED |
| 14-07-T2 | removed-session state tests PASS | `shell.removed-sessions` empty/error/200%-text evidence PASS | CLOSED |
| 14-08-T1 | recovery/CSV tests PASS | `shell.data-recovery` native status/cleanup evidence PASS | CLOSED |
| 14-08-T2 | automatic-backup/privacy tests PASS | `shell.automatic-backup` native policy/takeover/delete/privacy evidence PASS | CLOSED |
| 14-08-T3 | manual backup/restore tests PASS | `shell.manual-backup` native REPLACE/MERGE/rebuild evidence PASS | CLOSED |
| 14-09-T1 | `npm run test:evidence:v12:shell` PASS | all 13 canonical shell evidence files structurally verified PASS | CLOSED |
| 14-09-T2 | typecheck/lint/boundaries PASS | clean-head `verify:cng` PASS with silent OAuth derivation | CLOSED |
| 14-09-T3 | `phase14-native-matrix.test.mjs` PASS | full 17-cell native matrix PASS | CLOSED |
| 14-10-T1 | verifier subset semantics covered by tests PASS | exact-head native evidence for first four shell IDs PASS | CLOSED |
| 14-10-T2 | verifier subset semantics covered by tests PASS | exact-head native evidence for middle five shell IDs PASS | CLOSED |
| 14-10-T3 | full verifier PASS | exact-head native evidence for last four shell IDs PASS | CLOSED |
| 14-11-T1 | owner/deviation checks PASS | DEV-02 native blended-fill evidence present and passed | CLOSED |
| 14-11-T2 | package command present and contract-tested PASS | no missing-command blocker remains | CLOSED |
| 14-12-T1 | Library sheet regressions PASS | `shell.sheets` native Library-path evidence PASS | CLOSED |
| 14-12-T2 | completion confirmation regressions PASS | `shell.sheets` native completion-path evidence PASS | CLOSED |

## Final re-audit task status (authoritative)

| Task | Current host/contract result | Current exact-head native result | Verdict |
|---|---|---|---|
| 14-01-T1 | Font oracle self-tests PASS | Source-only task | CLOSED |
| 14-01-T2 | Font-proof CLI/route self-tests PASS | Source-authoring task; retained route is not independently promoted beyond the stale font manifest | CLOSED (source) |
| 14-02-T1 | Font-proof self-tests PASS | Existing verifier returns `phase14_font_manifest_stale` | ESCALATED |
| 14-02-T2 | Theme/store/component coverage PASS | `shell.appearance`/`shell.tokens` are not current-head verifier-accepted | ESCALATED |
| 14-02-T3 | Startup/root-failure tests PASS | `shell.launch` is not current-head verifier-accepted | ESCALATED |
| 14-03-T1 | Root-shell tests PASS | `shell.four-roots`/`shell.root-state` are not current-head verifier-accepted | ESCALATED |
| 14-03-T2 | Focus/deep-route tests PASS | Retained focus/back trace is not current-head verifier-accepted | ESCALATED |
| 14-04-T1 | BottomSheet tests PASS | `shell.sheets` keyboard/IME/focus evidence is not current-head verifier-accepted | ESCALATED |
| 14-04-T2 | Dialog/delegation tests PASS | Shared-frame evidence is not current-head verifier-accepted | ESCALATED |
| 14-04-T3 | Toast tests PASS | `shell.toasts` evidence is not current-head verifier-accepted | ESCALATED |
| 14-05-T1 | Active Workout regressions PASS | Picker/dock evidence is not current-head verifier-accepted | ESCALATED |
| 14-05-T2 | Timing/date regressions PASS | Timing/date evidence is not current-head verifier-accepted | ESCALATED |
| 14-05-T3 | Duration/start regressions PASS | Start/cancel/focus evidence is not current-head verifier-accepted | ESCALATED |
| 14-06-T1 | Settings route/component tests PASS | Appearance/deep-route evidence is not current-head verifier-accepted | ESCALATED |
| 14-06-T2 | Rest-alert settings tests PASS | Rest-alert/deep-route evidence is not current-head verifier-accepted | ESCALATED |
| 14-07-T1 | Removed-session lifecycle tests PASS | Restore/reload evidence is not current-head verifier-accepted | ESCALATED |
| 14-07-T2 | Removed-session state tests PASS | Empty/error/200%-text evidence is not current-head verifier-accepted | ESCALATED |
| 14-08-T1 | Recovery/CSV tests PASS | Automatic recovery evidence is not current-head verifier-accepted | ESCALATED |
| 14-08-T2 | Automatic-backup/privacy tests PASS | Policy/takeover/delete/privacy evidence is not current-head verifier-accepted | ESCALATED |
| 14-08-T3 | Manual backup/restore tests PASS | REPLACE/MERGE/rebuild evidence is not current-head verifier-accepted | ESCALATED |
| 14-09-T1 | `test:evidence:v12:shell` PASS — 6 tests | Structural ledger passes, but strict all-evidence binding fails | ESCALATED |
| 14-09-T2 | CNG/typecheck/lint/boundaries PASS | CNG identity generation passes; no native claim in this task | CLOSED |
| 14-09-T3 | Phase 14 evidence self-tests PASS — 17 tests | Retained 17-cell matrix is not current-head verifier-accepted | ESCALATED |
| 14-10-T1 | Verifier subset semantics PASS in tests | Strict verifier fails `phase14_manifest_stale` | ESCALATED |
| 14-10-T2 | Verifier subset semantics PASS in tests | Strict verifier fails `phase14_manifest_stale` | ESCALATED |
| 14-10-T3 | Verifier semantics PASS in tests | Strict verifier fails `phase14_manifest_stale` | ESCALATED |
| 14-11-T1 | DEV-02 owner/deviation checks PASS | Native blended-fill artifact is retained but not current-head verifier-accepted | ESCALATED |
| 14-11-T2 | Package command and contract test PASS | No missing-command gap; native evidence remains stale-bound | ESCALATED |
| 14-12-T1 | Library regressions PASS | Library-path evidence is not current-head verifier-accepted | ESCALATED |
| 14-12-T2 | Completion regressions PASS | Completion-path evidence is not current-head verifier-accepted | ESCALATED |

## SHL closure (prior exact-head snapshot)

| Requirement | Exact proof | Verdict |
|---|---|---|
| SHL-01 | `shell.four-roots` exact-head native evidence PASS | CLOSED |
| SHL-02 | `shell.root-state` exact-head native evidence PASS | CLOSED |
| SHL-03 | `shell.appearance` exact-head native evidence PASS | CLOSED |
| SHL-04 | `font-axis-proof.json` PASS plus `shell.tokens` DEV-02 native evidence PASS | CLOSED |
| SHL-05 | `shell.sheets` exact-head native evidence PASS | CLOSED |
| SHL-06 | `shell.toasts` exact-head native evidence PASS | CLOSED |
| SHL-07 | `shell.launch` exact-head native evidence PASS | CLOSED |
| SHL-08 | `shell.rest-alerts` exact-head native evidence PASS | CLOSED |
| SHL-09 | `shell.settings-deep-links` exact-head native evidence PASS | CLOSED |
| SHL-10 | `shell.removed-sessions` exact-head native evidence PASS | CLOSED |
| SHL-11 | `shell.data-recovery` exact-head native evidence PASS | CLOSED |
| SHL-12 | `shell.automatic-backup` exact-head native evidence PASS | CLOSED |
| SHL-13 | `shell.manual-backup` exact-head native evidence PASS | CLOSED |

## Final re-audit SHL status (authoritative)

| Requirement | Host/contract result | Current exact-head native result | Verdict |
|---|---|---|---|
| SHL-01 | Host and matrix-contract coverage PASS | `shell.four-roots` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-02 | Host and matrix-contract coverage PASS | `shell.root-state` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-03 | Host and matrix-contract coverage PASS | `shell.appearance` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-04 | Font/evidence self-tests and DEV-02 record checks PASS | Existing font verifier returns `phase14_font_manifest_stale`; token evidence is not current-head accepted | ESCALATED |
| SHL-05 | Sheet/dialog/consumer tests PASS | `shell.sheets` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-06 | Toast tests PASS | `shell.toasts` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-07 | Startup/retry tests PASS | `shell.launch` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-08 | Rest-alert tests PASS | `shell.rest-alerts` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-09 | Settings/deep-route tests PASS | `shell.settings-deep-links` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-10 | Removed-session lifecycle and exactly-once restore tests PASS | `shell.removed-sessions` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-11 | Recovery/CSV tests PASS | `shell.data-recovery` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-12 | Automatic-backup/privacy tests PASS | `shell.automatic-backup` blocked by `phase14_manifest_stale` | ESCALATED |
| SHL-13 | Manual backup/restore tests PASS | `shell.manual-backup` blocked by `phase14_manifest_stale` | ESCALATED |

## Prior exact-head command results (before final validation commit)

| Command | Result |
|---|---|
| `npm run test:evidence:v12:shell` | PASS — 6 tests |
| `npm run verify:cng` | PASS — two clean development-test generations match |
| `node --test scripts/phase14-font-proof.test.mjs` | PASS — 8 tests |
| `npm run android:devtest:fresh -- --suite phase14-font-proof` | PASS — fresh exact-head `phase14-font-proof` APK built and installed |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --capture` | PASS — produced reviewable exact-head proof |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | PASS |
| `npm run android:devtest:fresh -- --suite phase14` | PASS — fresh exact-head `phase14` APK built and installed |
| `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — all 13 stages / 17 cells completed |
| `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — `evidence_sha256=165db78562358320efdc1a3aa74dacb9e2a7ad234c48871bf26f015eece06e26` |
| `npm run test:evidence:phase14` | PASS — 17 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — boundary check covered 323 files |
| `npm run check:boundaries` | PASS — 323 files |

## Independent re-audit command results

All commands below used Node 24.19.0/npm 11.17.0, the pinned Java/Android SDK paths, `emulator-5554`, and a silently derived `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

| Command | Result |
|---|---|
| `npm run verify:cng` | PASS — two clean development-test generations match |
| `npm run test:evidence:v12:shell` | PASS — 6 tests |
| `npm run test:evidence:phase14` | PASS — 17 tests |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | BLOCKER — `phase14_font_manifest_stale`; manifest base head is `6a7eb050…`, current HEAD is `77d7497f…` |
| `npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --all` | BLOCKER — `phase14_manifest_stale`; the current diff from the manifest base includes `14-VALIDATION.md` as well as evidence files, so it is not evidence-only |
| Hash-only identity probe for source digest, retained APK, installed APK, and device identity | PASS — all four match; package `com.fchoo.gymtracker.devtest`, profile `development-test`, serial `emulator-5554` |

The identity probe passing does not override either verifier's current-head policy. No assertion was weakened and no implementation file was changed.

## Canonical evidence ledger

| Evidence ID | Requirement | Result |
|---|---|---|
| `shell.four-roots` | SHL-01 | PASS |
| `shell.root-state` | SHL-02 | PASS |
| `shell.appearance` | SHL-03 | PASS |
| `shell.tokens` | SHL-04 | PASS |
| `shell.sheets` | SHL-05 | PASS |
| `shell.toasts` | SHL-06 | PASS |
| `shell.launch` | SHL-07 | PASS |
| `shell.rest-alerts` | SHL-08 | PASS |
| `shell.settings-deep-links` | SHL-09 | PASS |
| `shell.removed-sessions` | SHL-10 | PASS |
| `shell.data-recovery` | SHL-11 | PASS |
| `shell.automatic-backup` | SHL-12 | PASS |
| `shell.manual-backup` | SHL-13 | PASS |

## Audit trail

| Prior gap | Closure in this validation cycle | State |
|---|---|---|
| Missing `test:evidence:v12:shell` package command | Added real package script and contract test in `46a219969a6e57cf94e5a67c507cf1d2c34a91e4` | CLOSED |
| Post-command gate exposed a typed mock error in `RemovedSessionsScreen.test.tsx` | Fixed mock typing and committed in `6a7eb050d43deee5150e95ebc2d8121a1ef66fd2` | CLOSED |
| `verify:cng` previously failed closed without the public web client ID | Derived `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` silently from `scripts/google-oauth-config.mjs`; `verify:cng` now passes | CLOSED |
| Earlier exact-head evidence became stale after the type-only source change | Rebuilt fresh font proof and fresh Phase 14 native evidence on implementation head `6a7eb050d43deee5150e95ebc2d8121a1ef66fd2` | CLOSED |
| Font proof previously carried a stale-manifest blocker | Fresh `phase14-font-proof` manifest/APK captured, overlay-reviewed, and verified existing PASS | CLOSED |
| Full shell evidence previously carried stale/`adb` blockers | Fresh `phase14` manifest/APK built, matrix executed, and full verifier PASS | CLOSED |
| Earlier evidence commit `2b83e0b0f573d625b7bfe40312cbfb8696073145` no longer matched the final exact implementation head | Refreshed tracked canonical evidence at `a2486ba33895efa7ab5ffd915ffe8c7fa6fa53bf` | CLOSED |

## Nyquist disposition

Nyquist compliance is `false` on the current checkout. The host-side requirements and CNG gate pass, and all source/APK/device identity components match. The required strict existing-artifact verifiers do not pass because the final validation-document commit advances HEAD beyond the evidence base, and the font verifier does not permit any head advance. These are evidence-binding blockers, not grounds to weaken assertions or treat the retained base-head proof as current-checkout proof.

## Validation Audit 2026-10-09 — independent re-audit

| Metric | Count |
|---|---:|
| Prior escalations rechecked | 5 |
| Prior gaps still closed | 3 — CNG environment, package command, source/APK/device identity components |
| New/current binding gaps found | 2 |
| Resolved in this re-audit | 0 |
| Escalated | 2 — current-head font manifest and current-head Phase 14 manifest |
| Implementation files changed | 0 |

### Escalations

1. **Font proof exact-head binding:** `run-phase14-font-proof.mjs --verify-existing` returns `phase14_font_manifest_stale`. The retained manifest is based at `6a7eb050…`, while current HEAD is `77d7497f…`.
2. **Full Phase 14 evidence exact-head binding:** `verify-phase14-evidence.mjs --all` returns `phase14_manifest_stale`. The current diff from the manifest base contains `.planning/phases/14-prototype-visual-shell/14-VALIDATION.md` in addition to evidence files, violating the verifier's evidence-only advancement rule.
