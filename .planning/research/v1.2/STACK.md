# Technology Stack — v1.2 standalone Garmin import

**Reconciled:** 2026-10-07
**Scope:** Planning only
**Authority:** .planning/v1.2-OWNER-DECISIONS.md

## Selected stack

| Layer | Exact selection | Purpose |
|---|---|---|
| Application | Expo 57 / React Native 0.86 / existing framework-supported JS engine | Existing Android app, routes, UI, and CNG |
| Native bridge | Local Expo Kotlin module at modules/garmin-connect | Typed background bridge and lifecycle boundary |
| Python embedding | Chaquopy 17.0 with Python 3.13 | Bundle Python in the APK |
| Garmin client | python-garminconnect 0.3.17 at commit 218e72ca5459e014435fc2d94fd18bd601fa0c14 | Account login/MFA/session and allowlisted activity JSON reads |
| Native HTTP wheel | curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl | Android ARM64 transport required by the pinned client |
| Wheel SHA-256 | 4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92 | Build-time artifact verification |
| Credential storage | Android Keystore-backed AES-GCM app-private store | Encrypted dependency-injected DI token persistence |
| Source persistence | Existing Expo SQLite serialized writer and Phase 13 import/match commands | Atomic source facts, revisions, receipts, and matching |
| Validation | Existing Zod/domain validators plus Kotlin/Python typed DTO checks | Bound untrusted response shapes before persistence |
| Route/detail graphics | Existing react-native-svg | Offline factual route illustration and accessible data alternatives |

## Packaging rules

- Select only arm64-v8a and Android API 24 or higher for the embedded Python artifact.
- Lock every Python artifact and hash in modules/garmin-connect/python/garmin-python-lock.json.
- Verify the exact curl_cffi filename and SHA-256 before Gradle/Chaquopy consumes it.
- Pin python-garminconnect to both version 0.3.17 and the selected commit; fail if package metadata differs.
- Package MIT copyright/permission notices in modules/garmin-connect/python/THIRD_PARTY_NOTICES.md as ordinary build work.
- Do not add a JS engine switch, runtime agent, development server, subprocess, local HTTP service, on-device installer, or script downloader.

## Existing application dependencies retained

| Dependency | Use |
|---|---|
| expo-router | Contextual Garmin routes under the four-root shell |
| expo-sqlite | Authoritative import and match facts through Phase 13 repositories |
| expo-crypto or existing canonical SHA seam | Canonical normalized/component SHA-256 verification on the TypeScript side |
| react-native-svg | Static source-based route and charts |
| TanStack Query | Rebuildable read cache only |
| Jest / React Native Testing Library / node:sqlite suites | Pure, component, and real-SQLite contracts |

Existing Google authentication and Drive backup dependencies are not reused for Garmin authentication or transport. Garmin token state is not a logical backup input.

## Package legitimacy audit

| Package/artifact | Registry/source | Exact identity | Licence | Verdict | Disposition |
|---|---|---|---|---|---|
| python-garminconnect | cyberjunky/python-garminconnect | 0.3.17; commit 218e72ca5459e014435fc2d94fd18bd601fa0c14 | MIT | VERIFIED | Exact source/version assertion; package notices normally |
| Chaquopy | com.chaquo.python Gradle plugin | 17.0 | MIT | VERIFIED | Exact plugin version; CNG/Gradle compatibility proof in 18-01 |
| curl_cffi | PyPI wheel | 0.15.0 cp313 abi3 android_24 arm64_v8a; exact SHA above | MIT | VERIFIED | Filename/ABI/hash gate before packaging |
| requests and ua-generator transitives | PyPI through pinned client metadata | Exact versions and hashes written by 18-01 lock generation | compatible open-source licences | VERIFIED-BEFORE-PACKAGE | Automated registry/source/licence/hash audit must pass; failure blocks packaging without substituting packages |

No package is marked ASSUMED, SUS, or SLOP. There is no blocking licence ceremony. An automated provenance or hash failure is a technical packaging failure.

## Allowlisted provider surface

| Python method | Typed TypeScript operation | Limits |
|---|---|---|
| login / resume_login | login / resumeMfa | Foreground only; secrets never persisted |
| dumps / loads | injected token store only | Encrypted app-private bytes; no JS token access |
| get_activities | getActivities | Running only; bounded start/limit/pages |
| get_activity | getActivity | One validated external activity ID |
| get_activity_splits | getActivitySplits | One validated external activity ID |
| get_activity_details | getActivityDetails | maxchart=2000, maxpoly=4000 fixed by request type |

## Explicit non-additions

- No Garmin partner SDK, browser OAuth package, provider client secret, hosted service, callback receiver, desktop helper, or Drive import inbox.
- No FIT library, original-file picker, ZIP parser, or manual FIT screen.
- No generic Python bridge, eval, arbitrary URL/method forwarding, upload/delete operation, or token export to JavaScript.
- No interactive map dependency or live location permission.
- No background scheduler in this milestone; foreground Sync is the verified contract.

## Verification order

1. Package and unit-test the exact ARM64/Python/native harness and typed interface.
2. Implement login/MFA, encrypted DI store/rotation/restore, and one allowlisted read.
3. Run the earliest installed-APK real-account proof before broader normalization/UI work.
4. Implement canonical JSON, shared Phase 13 import, bounded sync, detail, matching, and portability.
5. Run deterministic and native adversarial proof for 403, 429, logout, stale generations, offline, malformed/partial responses, and process restart.

## Known limitations

- Upstream issue #444 shows that authenticated login can be followed by data-request 403. Login alone is never acceptance.
- get_activity_details is explicitly sampled/downsampled by maxchart/maxpoly. It cannot establish full-resolution history.
- No ARM x86_64 wheel is selected; x86 emulator success is not claimed.
- The unofficial service can change. Updates require a new locked APK, never a runtime script download.
