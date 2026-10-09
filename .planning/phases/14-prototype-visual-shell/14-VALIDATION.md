---
phase: 14-prototype-visual-shell
status: validated
nyquist: true
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
plans: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11, 14-12]
---

# Phase 14 Validation Contract

Phase 14 is validated on the exact implementation head `01b75c6914c7163b88f9273f8d1bdc71664c409b` with the final synchronized canonical native evidence committed separately at `355bf509becc3433997ba72662895e1b1b19db61`. This validation reflects the runner isolation fix on that implementation head, which force-stops the app before matrix state restoration and removes the emulator-only SIGSEGV previously seen during viewport/font-reset cleanup. The retained manifests use `base_head` as capture provenance and source-tree/APK/device hashes as acceptance identity, so the evidence remains valid across the later evidence/docs commits in this refresh.

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
| Exact implementation head for native proof | `01b75c6914c7163b88f9273f8d1bdc71664c409b` |
| Canonical evidence commit | `355bf509becc3433997ba72662895e1b1b19db61` |
| Phase 14 source tree sha256 | `54514a268dba236df31ad54ef5c8ffd7cebe3e73cf42a19892e012262cf2fdc2` |
| Phase 14 build manifest | `artifacts/native/phase14/build.json` |
| Phase 14 APK sha256 | `5ecbab8f506978122c485143f78153f42ec2e9075538d2d2047ef01928561982` |
| Phase 14 device identity sha256 | `96dcf303d772667590457dc76c2cd5ee828515c31e2af1b9fee5b3f440b204f9` |
| Strict Phase 14 evidence sha256 | `9ebe2485ec0072a79fbfc7d0d85821f89fa8bec104c554fdf986fc624aebee6f` |
| Verified evidence file sha256 | `d493dab714ef6c24526e6c5f523c4685f89211123a1d4f6649b5910143a741bf` |
| Font proof manifest | `artifacts/native/phase14-font-proof/build.json` |
| Font proof APK sha256 | `62c0090ac7b922d8a2421142ae17400180d785095e34728b40b36f7633f6b741` |
| Font proof report | `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` |
| Font proof report sha256 | `d7b206d4c174a5ff3fdff200d1047e57c73f377d664f0a6cf812d16374b468d5` |
| Font proof screenshot sha256 scale 1.0 | `b48a92c8cd63a137d4362512394104d1d2a4e167020089a58a1f64cf6ef8cc34` |
| Font proof screenshot sha256 scale 2.0 | `546d72b0507ba8debe85bdd48436a6a0c34c1a029226fc1ea2e4201eab62b171` |
| Refresh test count | `13` stages / `17` matrix cells / `13` evidence rows / `14` canonical evidence JSONs |

## Final results

1. `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run test:evidence:phase14`, and `npm run test:all` all passed on the implementation head `01b75c6914c7163b88f9273f8d1bdc71664c409b`. `test:all` finished with `218` suites passed, `3601` tests passed, coverage `Statements 91.99% / Branches 88.86% / Functions 90.5% / Lines 92.34%`, and the integrity gate JSON `{"ok":true,"integrity_critical_files":131,"metrics":["statements","branches","functions","lines"],"required_percent":100}`.
2. `npm run verify:cng` passed under the pinned environment using the silently derived public Google web client ID from `scripts/google-oauth-config.mjs`.
3. The fresh retained `phase14-font-proof` manifest matches the exact implementation head and confirms the required privacy shape: `device.serial` is omitted, `installed_apk.device_path` is omitted, `installed_apk.sha256` is present, `installed_apk.matches_retained_apk` is `true`, and `device.identity_sha256` is present.
4. The font capture passed visual review against the approved Revision 18 oracle at both scale `1.0` and scale `2.0`. `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` records `status: passed`, `overlay_review.status: passed`, and both case records as `passed`.
5. The retained font-proof APK was installed live with `adb install -r`, then `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` passed against the installed artifact.
6. The retained `phase14` APK was then reinstalled and used for the full native refresh. `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` passed all 13 stages and all 17 matrix cells.
7. `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` passed with `evidence_sha256=9ebe2485ec0072a79fbfc7d0d85821f89fa8bec104c554fdf986fc624aebee6f`.
8. The refreshed evidence ledger records `13` passing stages, `17` passing matrix cells, and `13` passing canonical shell rows, while the evidence refresh itself is sealed by `14` canonical JSON files including the font proof report.
9. The source tree digest, retained APK hash, installed APK hash, and device identity all match across the Phase 14 manifest and the refreshed evidence ledger.
10. The post-rerun scoped crash audit returned `MATCH_COUNT=0`. No new `APP CRASH(NATIVE)`, abort-message, signal, or fatal-exception signatures were found during the refreshed Phase 14 matrix window on this implementation head.
11. The requested live install ordering is preserved in this evidence cycle: font-proof install and live verification completed first, then the retained `phase14` APK was restored and used for the full exact-head matrix and strict verifier.

## Command results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run check:boundaries` | PASS |
| `npm run test:evidence:phase14` | PASS |
| `npm run test:all` | PASS — `218` suites / `3601` tests / integrity gate passed |
| `npm run verify:cng` | PASS |
| `npm run android:devtest:fresh -- --suite phase14-font-proof` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --capture` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | PASS |
| `npm run android:devtest:fresh -- --suite phase14` | PASS |
| `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — 13 stages / 17 matrix cells |
| `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — `evidence_sha256=9ebe2485ec0072a79fbfc7d0d85821f89fa8bec104c554fdf986fc624aebee6f` |

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

## Nyquist disposition

Nyquist compliance remains `true`. All 13 shell requirements are closed on the refreshed exact-head source digest, the canonical evidence set is current, and the validation state remains `validated`.
