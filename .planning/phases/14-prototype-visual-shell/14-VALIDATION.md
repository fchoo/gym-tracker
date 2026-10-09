---
phase: 14-prototype-visual-shell
status: validated
nyquist: true
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
plans: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11, 14-12]
---

# Phase 14 Validation Contract

Phase 14 is validated on the exact implementation head `e7bcdfdc7ef43252a99695de1715bcb193b58c46` with refreshed canonical native evidence committed separately at `cc6e0cc3501def7bf01ee05118a0483b8fb66bb0`. No implementation or test file changed during this refresh. The retained manifests use `base_head` as capture provenance and source-tree/APK/device hashes as acceptance identity, so the evidence remains valid across the later evidence/docs commits in this refresh.

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
| Exact implementation head for native proof | `e7bcdfdc7ef43252a99695de1715bcb193b58c46` |
| Canonical evidence commit | `cc6e0cc3501def7bf01ee05118a0483b8fb66bb0` |
| Phase 14 source tree sha256 | `56f58daec2ba04d11f38659c0dd41cb50b89b217345309405c722f6c09dd6f9b` |
| Phase 14 build manifest | `artifacts/native/phase14/build.json` |
| Phase 14 APK sha256 | `d71213e3fc21b541937315e7404a1b7ee78a58ee2414c7a36dab342a9e639d26` |
| Phase 14 device identity sha256 | `96dcf303d772667590457dc76c2cd5ee828515c31e2af1b9fee5b3f440b204f9` |
| Strict Phase 14 evidence sha256 | `42f2a0b5f4c551c7fc583d182553cde837381ed823db260485f8a8f7ee950041` |
| Verified evidence file sha256 | `5d761ca437683c8730eb3fae62738c110d3966109a59c8f8af71d6c3a931a677` |
| Font proof manifest | `artifacts/native/phase14-font-proof/build.json` |
| Font proof APK sha256 | `8347744b6181ebd223dd3300ec2b343b9a720c70625c6a3c637af0a3f5b4111f` |
| Font proof report | `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` |
| Font proof report sha256 | `aa289d84fe9a16733ffd7da6e7df78e350730cb4ec4d4bc53c3409a8feb17da4` |
| Font proof screenshot sha256 scale 1.0 | `f08352fb496642e1d489abcec4c11c1f02994cc064619362ed401e2de2ffb340` |
| Font proof screenshot sha256 scale 2.0 | `78a0866c6f25941abc7040b285bbe90d887f3ceb69a29cd635758a97e10c0142` |

## Final results

1. `npm run verify:cng` passed under the pinned environment using the silently derived public Google web client ID from `scripts/google-oauth-config.mjs`.
2. The fresh retained `phase14-font-proof` manifest matches the exact implementation head and confirms the required privacy shape: `device.serial` is omitted, `installed_apk.device_path` is omitted, `installed_apk.sha256` is present, `installed_apk.matches_retained_apk` is `true`, and `device.identity_sha256` is present.
3. The font capture passed visual review against the approved Revision 18 oracle at both scale `1.0` and scale `2.0`. `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` records `status: passed`, `overlay_review.status: passed`, and both case records as `passed`.
4. The retained font-proof APK was installed live with `adb install -r`, then `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` passed against the installed artifact.
5. The retained `phase14` APK was then reinstalled and used for the full native refresh. `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` passed all 13 stages and all 17 matrix cells.
6. `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` passed with `evidence_sha256=42f2a0b5f4c551c7fc583d182553cde837381ed823db260485f8a8f7ee950041`.
7. The source tree digest, retained APK hash, installed APK hash, and device identity all match across the Phase 14 manifest and the refreshed evidence ledger.
8. No new `APP CRASH(NATIVE)`, abort-message, signal, or fatal-exception signatures were found during the refreshed Phase 14 matrix run.
9. The requested live install ordering is preserved in this evidence cycle: font-proof install and live verification completed first, then the retained `phase14` APK was restored and used for the full exact-head matrix and strict verifier.

## Command results

| Command | Result |
|---|---|
| `npm run verify:cng` | PASS |
| `npm run android:devtest:fresh -- --suite phase14-font-proof` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --capture` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | PASS |
| `npm run android:devtest:fresh -- --suite phase14` | PASS |
| `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — 13 stages / 17 matrix cells |
| `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — `evidence_sha256=42f2a0b5f4c551c7fc583d182553cde837381ed823db260485f8a8f7ee950041` |

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
