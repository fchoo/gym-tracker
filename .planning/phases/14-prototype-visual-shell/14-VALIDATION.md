---
phase: 14-prototype-visual-shell
status: validated
nyquist: true
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
plans: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11, 14-12]
---

# Phase 14 Validation Contract

Phase 14 is validated on the exact implementation head `103053b8f5e6c03aa088a3f0a8f175e3b9d001c8` with refreshed canonical native evidence committed separately at `30e7b5bc401aef41f3e4ca54e46e0d43cae659df`. No implementation or test file changed during this refresh. The retained manifests use `base_head` as capture provenance and source-tree/APK/device hashes as acceptance identity, so the evidence remains valid across the later evidence/docs commits in this refresh.

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
| Exact implementation head for native proof | `103053b8f5e6c03aa088a3f0a8f175e3b9d001c8` |
| Canonical evidence commit | `30e7b5bc401aef41f3e4ca54e46e0d43cae659df` |
| Phase 14 source tree sha256 | `dce7d0c87227836ea2af7710a3bbd9f2c980e1c95156a2d51261c5ac1ea70042` |
| Phase 14 build manifest | `artifacts/native/phase14/build.json` |
| Phase 14 APK sha256 | `a8acf57648e1194077732f607f1f7162d79a8ac92ce6c87e0dcf0bc6f0d785fe` |
| Phase 14 device identity sha256 | `96dcf303d772667590457dc76c2cd5ee828515c31e2af1b9fee5b3f440b204f9` |
| Strict Phase 14 evidence sha256 | `4d8853d118a8c7635db2afb4fa324bbbca78c3a6833de4e96b9de0dbbedf1b07` |
| Verified evidence file sha256 | `7c13455633a7d56c7901bd56d03c510ed15abc57d8ccfde7bd1fee3e8e2fee58` |
| Font proof manifest | `artifacts/native/phase14-font-proof/build.json` |
| Font proof APK sha256 | `1b9bd38942721a1d83fda3485193b7dd16b24aceb90f880c994f1eb51118d046` |
| Font proof report | `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` |
| Font proof report sha256 | `6b407c2e0348fa02244e90961b45ada223bf80ae8ca6553152559aab1ed4669f` |
| Font proof screenshot sha256 scale 1.0 | `33f1f5d95cce97870e12fad4589e4f8afa921d80e3196c252105f66cd809444c` |
| Font proof screenshot sha256 scale 2.0 | `e468250ecfb3aeeffc3de4f404af7a73fb79c2e6c5c6809bc55d93c1710b9c4c` |
| Refresh test count | `13` stages / `17` matrix cells / `13` evidence rows / `14` canonical evidence JSONs |

## Final results

1. `npm run verify:cng` passed under the pinned environment using the silently derived public Google web client ID from `scripts/google-oauth-config.mjs`.
2. The fresh retained `phase14-font-proof` manifest matches the exact implementation head and confirms the required privacy shape: `device.serial` is omitted, `installed_apk.device_path` is omitted, `installed_apk.sha256` is present, `installed_apk.matches_retained_apk` is `true`, and `device.identity_sha256` is present.
3. The font capture passed visual review against the approved Revision 18 oracle at both scale `1.0` and scale `2.0`. `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` records `status: passed`, `overlay_review.status: passed`, and both case records as `passed`.
4. The retained font-proof APK was installed live with `adb install -r`, then `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` passed against the installed artifact.
5. The retained `phase14` APK was then reinstalled and used for the full native refresh. `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` passed all 13 stages and all 17 matrix cells.
6. `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` passed with `evidence_sha256=4d8853d118a8c7635db2afb4fa324bbbca78c3a6833de4e96b9de0dbbedf1b07`.
7. The refreshed evidence ledger records `13` passing stages, `17` passing matrix cells, and `13` passing canonical shell rows, while the evidence refresh itself is sealed by `14` canonical JSON files including the font proof report.
8. The source tree digest, retained APK hash, installed APK hash, and device identity all match across the Phase 14 manifest and the refreshed evidence ledger.
9. No new `APP CRASH(NATIVE)`, abort-message, signal, or fatal-exception signatures were found during the refreshed Phase 14 matrix run.
10. The requested live install ordering is preserved in this evidence cycle: font-proof install and live verification completed first, then the retained `phase14` APK was restored and used for the full exact-head matrix and strict verifier.

## Command results

| Command | Result |
|---|---|
| `npm run verify:cng` | PASS |
| `npm run android:devtest:fresh -- --suite phase14-font-proof` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --capture` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | PASS |
| `npm run android:devtest:fresh -- --suite phase14` | PASS |
| `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — 13 stages / 17 matrix cells |
| `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — `evidence_sha256=4d8853d118a8c7635db2afb4fa324bbbca78c3a6833de4e96b9de0dbbedf1b07` |

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
