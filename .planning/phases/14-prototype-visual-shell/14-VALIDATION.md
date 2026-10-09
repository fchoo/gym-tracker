---
phase: 14-prototype-visual-shell
status: validated
nyquist: true
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
plans: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11, 14-12]
---

# Phase 14 Validation Contract

Phase 14 is validated on the exact implementation head `d7282f29062796eccad20c6ecf960fdefa30a036` (`fix(14): focus destination root after deep route`) with the final synchronized canonical native evidence committed separately at `e0038e00020540b6143438a2100fba38d28cd4c4`. This validation reflects the final source refresh that redacts native review device locators while preserving manifest-bound APK and device identity verification. The retained manifests use `base_head` as capture provenance and source-tree/APK/device hashes as acceptance identity, so the evidence remains valid across the later evidence/docs commit in this refresh.

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
| Exact implementation head for native proof | `d7282f29062796eccad20c6ecf960fdefa30a036` |
| Canonical evidence commit | `e0038e00020540b6143438a2100fba38d28cd4c4` |
| Phase 14 source tree sha256 | `490a02edff3edeb7a441380b1dffe7913f8d7fa108a4ce431f7c9cc99de94ce4` |
| Phase 14 build manifest | `artifacts/native/phase14/build.json` |
| Phase 14 APK sha256 | `6133c26be9385799aa93039e338c152c654b9fec5e0fb2f27dda6422bddeb485` |
| Phase 14 device identity sha256 | `96dcf303d772667590457dc76c2cd5ee828515c31e2af1b9fee5b3f440b204f9` |
| Strict Phase 14 evidence sha256 | `26e313fc3fd5b76c169cef61ef3646578f02f9487a3c1c00d183d62db65ca882` |
| Phase 14 evidence ledger sha256 | `a341c15abf1f20c9ef1236b4329a7b0091e1442116611fc7d0ea4912ec64b4d2` |
| Verified evidence file sha256 | `c1340958b6c9d37e13c6ce40671a7cd0ad51d7ccdbacd0c099972007703e180a` |
| Font proof manifest | `artifacts/native/phase14-font-proof/build.json` |
| Font proof APK sha256 | `439742f54062e2e8fbee0b311fffd0c6e00f32cf25b3031a330929d1dc72f37a` |
| Font proof report | `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` |
| Font proof report sha256 | `8b39c2f1b51876ffa1af5e69c72864003077ef87f8b8aeb2db4bd391f5d0bfe5` |
| Font proof screenshot sha256 scale 1.0 | `7001e2223abc582a17e65f463f86f6259eb0ba0612a9c84370221bd0679db2d9` |
| Font proof screenshot sha256 scale 2.0 | `16e4ce7b67c5ca15fb581f98479b12d721890316177ed9b5097a8c7a85d192cd` |
| Refresh evidence count | `13` stages / `17` matrix cells / `13` evidence rows / `14` canonical evidence JSONs |
| Evidence test count | `18` |

## Final results

1. The current source delta already has a recorded full `npm run test:all` pass at implementation head `d7282f29062796eccad20c6ecf960fdefa30a036`: `218` suites passed and `3601` tests passed. Per the refresh instructions, that full suite was recorded but not rerun because the implementation source did not change during this evidence refresh.
2. This exact implementation head includes the final focus regression fix `fix(14): focus destination root after deep route` (`d7282f29062796eccad20c6ecf960fdefa30a036`), which is the source line validated by the refreshed native evidence set.
3. `npm run verify:cng` passed under the pinned environment using the silently derived public Google web client ID from `scripts/google-oauth-config.mjs`.
4. The fresh retained `phase14-font-proof` and `phase14` manifests both match the exact implementation head and confirm the required privacy shape: `device.serial` is omitted, `installed_apk.device_path` is omitted, `installed_apk.sha256` is present, `installed_apk.matches_retained_apk` is `true`, and `device.identity_sha256` is present.
5. The font capture passed visual review against the approved Revision 18 oracle at both scale `1.0` and scale `2.0`. `.planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json` records `status: passed`, `overlay_review.status: passed`, and both case records as `passed`.
6. The retained font-proof APK was installed live with `adb install -r`, then `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` passed against the installed artifact.
7. The retained `phase14` APK was then reinstalled and used for the full native refresh. `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` passed all 13 stages and all 17 matrix cells.
8. `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` passed with `evidence_sha256=26e313fc3fd5b76c169cef61ef3646578f02f9487a3c1c00d183d62db65ca882`.
9. The refreshed evidence ledger records `13` passing stages, `17` passing matrix cells, and `13` passing canonical shell rows, while the evidence refresh itself is sealed by `14` canonical JSON files including the font proof report.
10. The source tree digest, retained APK hash, installed APK hash, and device identity all match across both retained manifests and the refreshed evidence ledger.
11. The post-rerun scoped crash audit returned `MATCH_COUNT=0`. No new `APP CRASH(NATIVE)`, `abort message`, `FATAL EXCEPTION`, or `Fatal signal` signatures were found during the refreshed Phase 14 matrix window on this implementation head.
12. The requested live install ordering is preserved in this evidence cycle: font-proof install and live verification completed first, then the retained `phase14` APK was restored and used for the full exact-head matrix and strict verifier.

## Command results

| Command | Result |
|---|---|
| Recorded current `npm run test:all` result | PASS — `218` suites / `3601` tests / source unchanged, not rerun in this refresh |
| `npm run verify:cng` | PASS |
| `npm run android:devtest:fresh -- --suite phase14-font-proof` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --capture` | PASS |
| `node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | PASS |
| `npm run android:devtest:fresh -- --suite phase14` | PASS |
| `node scripts/run-phase14-maestro.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — 13 stages / 17 matrix cells |
| `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` | PASS — `evidence_sha256=26e313fc3fd5b76c169cef61ef3646578f02f9487a3c1c00d183d62db65ca882` |

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
