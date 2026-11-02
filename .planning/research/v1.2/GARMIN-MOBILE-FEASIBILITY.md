# Garmin access inside a standalone Android app

**Assessment date:** 2026-10-07
**Status:** Source-verified feasibility research; no account login, installation,
native build, or live Garmin data retrieval was performed.
**Owner amendment:** `.planning/v1.2-OWNER-DECISIONS.md`.

## Recommendation

A separate desktop app is not a technical requirement. For this Android-first,
single-owner app, the strongest self-contained candidate is a small Expo native
module which embeds Python using Chaquopy and calls a pinned
`python-garminconnect` client. Its code and runtime ship in the APK. The existing
React Native UI, SQLite authority, and backup behavior remain the application
boundaries.

Recommend proving that narrow on-phone adapter before choosing a desktop/Drive
bridge. Source evidence supports feasibility, but does not yet prove that the
exact Python/native dependency combination builds in this Expo app or that the
owner's account/network is accepted by Garmin. A desktop helper remains a useful
fallback for easier client updates, not a prerequisite imposed by the API.

## Verified current source

The inspected repository snapshot is `cyberjunky/python-garminconnect` commit
`218e72ca5459e014435fc2d94fd18bd601fa0c14`, package **0.3.17**. This matters because
older guidance describes `garth`; the current README says it was removed in
0.3.0. Do not design against the old token format or `garth` API. [S1–S3]

| Finding | Evidence | Consequence |
|---|---|---|
| Library is Python, not an npm package | `pyproject.toml`: Python >=3.12; `curl_cffi>=0.15.0`, `requests>=2.33.0`, `ua-generator>=1.0` | It cannot be imported directly into React Native JavaScript. Embed Python or deliberately port the protocol. |
| Current authentication is account login/MFA and stored tokens | `client.py`: `login`, `resume_login`, `_refresh_session`, `dumps`, `loads` | No developer-program key or official partner broker is needed by this client. It uses unofficial Garmin account endpoints, not granted partner API access. |
| Authentication source is more complex than README summary | `client.py` starts with five strategies: mobile iOS HTTP, widget HTML, portal HTML/HTTP, with native TLS-capable and plain-HTTP variants | A small JavaScript `fetch` translation is not equivalent to the maintained client. Header copying does not recreate its native transport behavior. |
| Native Android transport package exists | PyPI 0.15.0 publishes `curl_cffi-0.15.0-cp313-abi3-android_24_arm64_v8a.whl` | Bundled Python 3.13 on Android ARM64 is a concrete candidate, rather than assuming desktop-only wheels. |
| Chaquopy can be used with React Native | Official FAQ: requires Gradle customization and the ability to call Java methods | Use a local Expo/Kotlin module plus build configuration; no Python process, local HTTP server, or separate app is inherently required. |
| Current Chaquopy supports the relevant runtime | Chaquopy 17.0: Python 3.10–3.14, minSdk 24, Gradle plugin 7.3.x–9.2.x | Select Python 3.13 for the published ARM64 wheel and confirm actual app Gradle/plugin/native compatibility in a future bounded build. |
| Desktop and phone share the same upstream reliability risk | Open issue #444 reports data-request 403 after successful authentication; current `_api_session` remains `requests.Session()` | Verify an authenticated data read, cold restart and refresh, not merely login. Desktop hosting does not guarantee reliable access. |

The Android wheel is 7,190,427 compressed bytes, SHA-256
`4682dc38d4336e0eb0b185374db90a760efde63cbea994b4e63f3521d44c4c92`.
This is one dependency's download size, not total APK overhead. Python, CFFI,
native libraries and dependencies add further size. No Android x86_64 wheel was
listed for this pinned curl_cffi release; an ARM64 emulator or a separately
qualified build is needed. Wheel availability alone does not prove transitive
native-library, Python ABI, page-size, TLS or Chaquopy interoperability. [S4–S6]

## Data can arrive as JSON before FIT is considered

| Needed information | Existing library method | Verification still needed |
|---|---|---|
| New/recent activity IDs and summaries | `get_activities(start, limit, activitytype, activitysubtype)` | Pagination, Running/treadmill classification, modified older activity reconciliation |
| Distance, duration and source summary | `get_activity(activity_id)` | Field presence, units, elapsed versus timer versus moving basis |
| Lap data | `get_activity_splits(activity_id)` and typed/split-summary variants | Which entries are source laps versus generated splits; avoid inventing Lap/Time/Pace |
| Route and heart-rate samples | `get_activity_details(activity_id, maxchart=2000, maxpoly=4000)` | Available channels and actual sampling/decimation on outdoor/treadmill activities |
| Metric names for positional samples | `parse_activity_detail_metrics(details)` | Use `metricDescriptors[].metricsIndex/key`; never assume a fixed column order |
| Original export, if later needed | `download_activity(..., ORIGINAL)` | Current method returns ZIP bytes; not automatically a raw FIT file |

The library's own tests preserve distinct `sumDuration`, `sumElapsedDuration`
and `sumMovingDuration` values, and omit missing channels instead of inserting
zeros. Follow that behavior. A `fit.py` in this repository includes encoding
utilities for other operations; its presence is not proof of a general workout
FIT decoder. [S7–S9]

The JSON path may cover the requested summaries, laps, route illustration and
HR views without a separate FIT decoder. It is not yet demonstrated to provide
lossless full-resolution samples. The default detail request explicitly has
chart/polyline limits. Do not compute exact arbitrary-distance best efforts or
claim full historical sample preservation from a potentially downsampled series.
For the first proof, compare one outdoor and one treadmill activity against the
Garmin app, including laps and the 2.4 km evidence basis. Decide later whether
original FIT is necessary for data the JSON path cannot faithfully supply.

## Architecture comparison

| Option | Self-contained phone? | Main work | Assessment |
|---|---|---|---|
| Embedded Python + Chaquopy native module | Yes | Bundle pinned Python/client/native wheels, bridge login/MFA/read calls, secure session persistence | Recommended first candidate for Android-only personal use; reuses upstream logic but adds APK size and native packaging. |
| Port selected calls to TypeScript/Kotlin | Yes | Reimplement authentication, MFA, refresh, transport/cookies, session lifecycle and activity requests | Potentially smaller, but owns a protocol fork and may need native TLS behavior anyway. Not a simple `fetch` wrapper. |
| Desktop background helper → Google Drive → phone | No computer needed during cached use; fresh imports depend on helper | Scheduled Python job, Drive publication/access, bounded download/import protocol, monitoring/re-auth | Easier to update upstream Python. Adds host uptime, sync delay and two-stage failure recovery. A script/service is sufficient; no desktop GUI is required. |

The existing project already has local Android Expo modules under `modules/`
and CNG configuration plugins. A proposed on-phone module can follow those
structural patterns. This research does not install Chaquopy or add production
module files.

## Proposed phone data flow

```text
Garmin watch -> official Garmin Connect upload -> Garmin cloud
                                                   |
Gym Tracker Sync action -> native worker -> bundled Python client
                                                   |
                             summary / splits / detail JSON
                                                   |
                         typed validation + source provenance
                                                   |
                          exclusive SQLite import transaction
                                                   |
                     Workout / Calendar / Progress + normal backup
```

This requires internet to obtain new Garmin activities. Previously imported
activities and the Strength workout loop remain offline. It neither reads the
watch directly nor depends on another app's private token storage.

Implementation boundaries to plan if this option is chosen:

1. Expose only login/MFA completion, session restore/logout, paged activity read,
   detail and splits through a typed native bridge. Do not expose Python eval,
   arbitrary URLs, arbitrary method names, or the client's upload/delete APIs.
2. Start Python lazily on a background worker. One serialized client handles
   sync/token state; never run its blocking requests/delays on the UI thread.
3. Use normal native input for email/password and MFA. The library supports a
   `return_on_mfa`/`resume_login` flow, so the UI need not block on a terminal
   prompt. Discard password references after login rather than storing them for
   unattended re-login. A session expiry can require an explicit sign-in again.
4. Persist token data using Android Keystore-backed app-private encryption.
   `dumps/loads` provide a seam, but disk auto-save is the upstream default:
   adapt token refresh persistence deliberately and test process death before
   and after token replacement. Current serialization contains DI tokens only;
   successful JWT_WEB fallback does not by itself prove restart persistence.
   Exclude credentials from diagnostic output, logical backups and Drive.
5. Fetch recent summaries, then details/splits for new or changed activities.
   Retain account-scoped external IDs and a versioned content fingerprint of
   normalized JSON. Exact FIT-byte hashes remain a separate field if FIT is
   added later. Never pretend a JSON hash is the original FIT hash.
6. Python/network code supplies data; repositories own normalization validation,
   revision review, dedupe, commit receipts and scheduled matching. Matching
   remains a separate explicit owner action.
7. Start with foreground Sync. WorkManager can later offer best-effort periodic
   refresh, but Android/OEM scheduling and force-stop prevent promises of exact
   background timing. MFA must return to the foreground. Ordinary scheduled code
   is not an AI agent. [S10]
8. Bound attempts and request volume. Treat MFA, revoked sessions, 403/challenge,
   rate-limit and offline responses as visible recoverable states. Do not loop
   logins or accept a fabricated successful sync. Library updates may require a
   new APK; no runtime download of scripts or agents is needed.

## What the desktop/Drive alternative would require

```text
Scheduled desktop Python helper -> immutable activity JSON files
                                 -> publish completed manifest to Drive
Phone Sync -> authorized folder/file IDs -> validate manifest and hashes
           -> same local SQLite import command -> existing UI
```

The helper can run under launchd, Task Scheduler or cron. It needs to be awake
and online when it fetches; no GUI and no AI service are required. MFA/login is
interactive when credentials need renewing; a scheduler should report this
state instead of hanging. Export only data, never the Garmin token store.

Drive is not a drop-in extension of the current backup adapter:

- The app uses `drive.file` and a tightly filtered `gym_tracker_backup=v1`
  namespace. A file another OAuth application uploads is not automatically
  readable just because both signed in to the same Google account. Establish
  the intended shared Google project/app and per-file access, or explicit
  user-selected file access, and prove a read by file ID. [S11]
- Create a separate import-inbox namespace/manifest and a dedicated read port.
  A desktop helper must never replace `snapshot-*.json`, the backup manifest,
  or claim the single-active-device backup writer lease.
- Upload immutable payloads with external IDs, schema version, sizes and hashes;
  publish a complete manifest only after every referenced payload is uploaded.
  Reject incomplete generations and preserve the phone's last good data.
- Retrying or receiving the same generation must be idempotent. Source removal
  or changing files must not silently rewrite or remove local historical facts.
- The UI should distinguish last successful desktop fetch, last successful
  phone import, partial failure, and login-needed status. Drive adds latency and
  another failure boundary; it does not fix Garmin-side rejection.

## Software licensing and runtimes

`python-garminconnect`, `curl_cffi` and Chaquopy are MIT-licensed. There is no paid
runtime licence or Garmin developer-program licence needed to use those
open-source packages; retain their copyright/permission notices when bundling.
That is ordinary dependency packaging, not a separate owner approval task.
Use of the unofficial Garmin service remains distinct from official partner
access. The earlier proprietary FIT SDK discussion is deferred because a FIT
decoder has not been selected for this path. [S1, S4, S6]

Hermes runs the React Native JavaScript already shipped inside an APK. It is
not a cloud service, coding agent, or runtime dependency on GSD. Bundled Python
would similarly run locally. No switch of JS engine is proposed; neither this
approach nor the desktop helper requires dynamically invoking agents.

## Smallest useful later proof and limits of this research

If the owner selects the phone path, one bounded native proof should establish:
bundled Python/client/native imports on ARM64; login plus MFA; a real activity
read after login; encrypted session persistence and refresh after cold restart;
outdoor/treadmill JSON field fidelity; idempotent reimport and preserved matching;
no UI-thread stall during sync; and release APK operation without Metro/Python
installed on the device/AI tooling. No need to build the entire integration or
choose a FIT decoder before answering those points.

This is not live-account validation. No credentials were requested or used, no
authenticated endpoint was called, and no package/native binary was executed.
Issue #444 is an upstream report corroborated by the current plain-HTTP source
path, not proof that the owner's network will fail. Background delivery,
SDK/native packaging and full-resolution sample availability remain unproven.

## Sources

- **S1:** [Repository and MIT licence](https://github.com/cyberjunky/python-garminconnect/tree/218e72ca5459e014435fc2d94fd18bd601fa0c14).
- **S2:** [Pinned pyproject.toml](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/pyproject.toml), package 0.3.17, Python and dependency requirements.
- **S3:** [Pinned authentication client](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/client.py), lines 1–8, 305–377, 475–529, 1454–1599; [README](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/README.md), 0.3.x migration and auth notes.
- **S4:** [PyPI curl_cffi 0.15.0 metadata](https://pypi.org/pypi/curl_cffi/0.15.0/json) and [upstream project](https://github.com/lexiforest/curl_cffi), Android wheel, native transport and MIT licence.
- **S5:** [Chaquopy 17 Gradle/Python/ABI documentation](https://chaquo.com/chaquopy/doc/current/android.html) and [version matrix](https://chaquo.com/chaquopy/doc/current/versions.html).
- **S6:** [Chaquopy React Native FAQ](https://chaquo.com/chaquopy/doc/current/faq.html#can-chaquopy-be-used-with-react-native-or-flutter) and [licence](https://github.com/chaquo/chaquopy/blob/master/LICENSE.txt).
- **S7:** [Pinned Garmin activity methods](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py), lines 2596–2633, 3260–3287, 3294–3317, 3370–3389.
- **S8:** [Activity metric parser](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/activity_details.py) and [its synthetic tests](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/tests/test_activity_details.py).
- **S9:** [Issue #444 and maintainer response](https://github.com/cyberjunky/python-garminconnect/issues/444), open at inspection, environment-specific data-request failures after login.
- **S10:** [Android WorkManager periodic work](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work), periodic interval and system scheduling constraints.
- **S11:** [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth); local `src/domains/backup/googleAuthPort.ts` and `src/platform/google/driveBackupStoreAdapter.ts`.

## Engineering review disposition

Architecture: phone embedding is feasible to investigate; desktop remains
optional. Code maintenance: prefer a narrow pinned client bridge over a full
protocol rewrite; upstream failure behavior must remain visible. Verification:
real login/read/restart and packaging proof are still needed. Performance:
background worker, lazy Python startup, bounded incremental reads and sample
fidelity checks precede broad sync. No runtime-agent system is proposed.

The new transport is a recommendation for owner review. It has not been applied
to production code or represented as already passing native tests.
