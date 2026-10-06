# Technology Stack — v1.2 Gym-Floor Usability Overhaul

**Researched:** 2026-10-06  
**Scope:** Planning only; approved revision 18 presentation, Garmin activity import, and the existing Android/Expo stack.  
**Overall confidence:** MEDIUM. Public documentation is verified to the extent listed below; partner access and native integration have not been tested.  
**Authority:** `.planning/v1.2-OWNER-BRIEF.md` supersedes the older UI draft. Architecture detail is in `../../architecture/v1.2-garmin-import.md`.

## Recommendation

Keep the installed Expo 57 / React Native 0.86 stack. Use the existing Gesture Handler, Reanimated, Worklets, SVG, file picker, SQLite, and encrypted portability boundaries. Add a FIT decoder behind a platform adapter. Build manual original FIT import as a complete local feature. Keep Garmin Connect Activity API connectivity behind a documented activation gate because Garmin publicly restricts the developer program to business use and its public PKCE specification requires a client secret at code exchange. PKCE does not make that secret safe to embed in an APK. [G1–G3, E1]

Use existing SVG for the prototype's static route illustration and charts. The prototype's Garmin detail is a 165px SVG route outline, not an interactive street map. A geographic map SDK would add keys, networking, native configuration, and a different interaction contract without a demonstrated requirement. An outdoor route should use actual imported coordinates; never copy the prototype's synthetic curve into a factual activity. [L5]

## Verified current dependency baseline

These versions were read from `package.json`, `package-lock.json`, and installed package metadata on 2026-10-06. “Installed” is a filesystem observation, not native runtime verification.

| Technology | Declared / resolved version | Keep for | Decision |
|---|---|---|---|
| Expo | `~57.0.25` / `57.0.25` | Android application and native package compatibility | Keep; no unrelated SDK upgrade in v1.2 |
| React Native / React | `0.86.3` / `19.2.3` | Native UI | Keep |
| Expo Router | `~57.0.23` | Four roots and deep detail routes | Keep; Garmin remains contextual, never a fifth root |
| `react-native-gesture-handler` | `~2.32.0` / `2.32.0` | Calendar pointer tracking and exercise reorder | Already installed; use native gestures |
| `react-native-reanimated` | `4.5.1` | Calendar panels, week transitions, collapse/expand | Already installed; shared values own visual motion |
| `react-native-worklets` | `0.10.1` | Reanimated runtime support | Already installed; do not treat UI worklets as a generic FIT parser worker |
| `react-native-svg` | `15.15.4` | Static route outline, goal lines, sparse trends | Already installed; no chart dependency required |
| `expo-sqlite` | `~57.0.3` | Source facts, immutable import receipts, matching ledger | Existing repository and transaction boundary |
| `expo-file-system` | `~57.0.7` | Owner-selected original FIT bytes | Reuse `File.pickFileAsync`, explicit `FileMode.ReadOnly`, bounded reads |
| `expo-crypto` | `~57.0.3` | SHA-256 content fingerprints and existing archive encryption | Reuse byte-based digest/AES facilities behind ports |
| Zod | `4.4.3` | Normalized import validation | Keep transport validation outside screen code |
| TanStack Query | `5.101.4` | Rebuildable query cache | Never authoritative for receipts, completion, or imported history |
| `react-native-nitro-google-signin` | `2.3.0` | Existing Drive backup authentication | Google-specific; do not extend it into a Garmin OAuth adapter |
| Jest / React Native Testing Library | `29.7.0` / `14.0.1` | Pure importer and component contracts | Keep; pair integrity cases with real SQLite and Android evidence |

**Not present in the lockfile or installed modules:** `@garmin/fitsdk`, `expo-document-picker`, `expo-auth-session`, `expo-web-browser`, `expo-secure-store`, `react-native-maps`.

## Additions and explicit non-additions

| Need | Recommendation | Version / activation | Reason and qualification |
|---|---|---|---|
| FIT decoding | `@garmin/fitsdk` behind `FitDecoderPort` | Candidate `21.217.0`; registry publication 2026-09-22 | Official Garmin implementation; supports `Stream.fromArrayBuffer`, integrity checks, typed message groups, scale/offset conversion, optional HR merge. Verify Hermes/Metro before adoption. [F1–F3] |
| FIT package license | Review `LICENSE.txt` before dependency adoption | Garmin license dated 2022-10-12, not MIT | Registry says `SEE LICENSE IN LICENSE.txt`; do not assert permissive distribution rights. This is a concrete dependency acceptance item, separate from Activity API approval. [F4] |
| Alternate FIT decoder | `fit-file-parser` only if official SDK acceptance fails | Candidate `6.1.2`, published 2026-09-22; MIT; depends on `buffer` | A fallback with additional compatibility/semantic verification, not the preferred decoder. Compare CRC, timestamps, invalid sentinels, HR, laps, and array behavior against fixtures. [F5] |
| File selection | Existing `expo-file-system` | No addition | Production backup port already uses an Android read-only picker and a capped byte read. Avoid a second picker and permission surface. [L2] |
| Native browser OAuth | `expo-auth-session` + `expo-web-browser` | Resolve SDK 57 compatible versions only when official adapter is authorized | Suitable for browser consent and PKCE; no secret in bundle. Public docs were checked, exact package versions have not been selected or installed. [E1] |
| Device session credential storage | `expo-secure-store` | Conditional on broker/client design | Store a small reconnect/session credential, not FIT files. Integrate with existing custom Android backup rules. Never place provider client secret in SecureStore. [E2, L3] |
| Route preview | Existing SVG | No addition | Matches static prototype behavior; local coordinates, segmented gaps, accessible summary; usable offline. [L5] |
| Interactive map | Defer `react-native-maps` | No selected version | SDK 57 docs require Android Maps configuration/key. Only add if an owner-approved contract actually requires tiles/pan/zoom; allowlist/restrict key by app signing identity and Android package. [E3] |
| Trend/HR chart | Existing SVG + accessible data rows | No addition | Current prototype needs a few factual visuals, not a dashboard/chart framework |
| ZIP extraction | No archive package for initial `.fit` contract | Reassess only with actual exported fixtures | If Export Original arrives as ZIP, explain how to extract the FIT; do not parse arbitrary ZIP paths. Adding in-app archive support requires expansion/entry/count/path limits and a separate acceptance decision. |
| Garmin account scraping | Do not add | Never an API fallback | Session cookies, password entry, reverse-engineered Connect endpoints, and unofficial login libraries do not satisfy the owner's consented Activity API design |

No installation, native generation, build, or code change was performed. Later implementation should pin the chosen decoder and use the project package manager; Expo-managed additions must be resolved against SDK 57 compatibility rather than installed at an arbitrary latest version.

## Garmin ecosystem facts and limits

| Finding | Evidence status | Planning consequence |
|---|---|---|
| Connect Developer Program is enterprise/business use only | Public FAQ read directly; MEDIUM per research confidence seam [G1] | Do not promise access for this personal project |
| Activity API provides activity files including FIT, GPX, TCX; offers ping/pull or push | Public Activity API page read directly; MEDIUM [G2] | Receiving original FIT is the shared import seam; transport is replaceable |
| Consent precedes data access; data becomes available after device sync to Connect | Public Activity API page; MEDIUM [G2] | “Sync” cannot imply direct watch transfer or guaranteed immediate availability |
| Evaluation access follows approval | Public Activity API page; MEDIUM [G2] | No claim that this project has credentials, partner documentation, evaluation access, or production approval |
| Program uses OAuth 2.0; public PKCE specification exists | FAQ plus public PDF indexed text; MEDIUM [G1, G3] | Use authorization code + PKCE, with current approved partner contract as implementation authority |
| Public PKCE PDF lists `client_secret` as required for code exchange | Official PDF search excerpt, not full PDF extraction; MEDIUM [G3] | Default official integration requires a confidential broker; a secretless native alternative requires explicit Garmin confirmation |
| Exact scopes, endpoints, webhook verification, retry contract, backfill limits, quotas, token lifetime/rotation, revocation/deletion handling | Not established by this research; LOW/unknown | Resolve from approved partner documentation before enabling network adapter; do not invent values |
| Original activity export exists on Garmin Connect website and is usually FIT | Official support search results; MEDIUM [G4] | Complete manual path remains available without API approval |
| FIT can contain multiple sessions and includes session/lap/record structures | Official activity/cookbook documentation; MEDIUM [F2] | Validate supported running sessions; reject unsupported multisport explicitly rather than silently flattening |
| A selected FIT is guaranteed to contain Garmin Connect cloud activity ID | Not established; LOW/unknown | `externalActivityId` is nullable for manual files; filename/device identity is not a trusted cloud ID |

## Existing security and portability boundary

Current logical backup format is v2 with a table allowlist. It caps encrypted archives at 32 MiB, plaintext at 24 MiB, total rows at 100,000, each table at 25,000 rows, and each string at 64 KiB. Archives use Argon2id-derived keys and AES-256-GCM. SQLite source data is not automatically included merely because a new table exists. Backup collection, validation, restore ordering, owner identity, merge planning, and reconciled projections all require explicit extensions. [L1]

At a hypothetical one sample per second, a one-hour activity contributes 3,600 sample rows; seven such activities already exceed a 25,000-row table cap. This is a sizing example, not a claim that Garmin always records at 1 Hz. Store supported source channels in validated, lossless chunks rather than one row per sample. Do not silently downsample source facts to fit backup limits. Keep presentation downsampling rebuildable. The detailed ADR recommends a versioned portability extension and explicit cumulative size preflight. [L1, F2]

Android backup is enabled with custom rules that exclude databases and existing backup/plaintext staging paths. Those rules do **not** automatically establish an exclusion for a new Garmin staging directory or SecureStore preferences. Any new credential/temporary-data path must be included in both cloud-backup and device-transfer rules. Retain the existing opaque handle, classified error, URI isolation, and cleanup conventions. [L2–L3, E2]

## Implementation ordering

1. **Domain foundation:** stable imported identity, payload revisions, source sample chunks, immutable match events, Running opportunity completion overlay, backup/merge schema and capacity policy. Coordinate with multi-active-plan migration.
2. **Native presentation:** use installed gesture/animation/SVG libraries; protect the 25% Calendar threshold and reduced-motion sequencing. Keep parser work away from Calendar gestures and the active workout critical path.
3. **Manual import vertical slice:** select bytes → validate → hash → parse → preview/commit → duplicate/revision outcome → read-only detail → explicit schedule match. This must work without any network provider.
4. **Optional official connectivity gate:** approved credentials and documentation; confidential-broker/security decision; contract tests; partner evaluation; disconnect/revocation verification. Activation may remain blocked while the complete manual-import milestone ships, subject to owner acceptance of the concrete availability presentation.
5. **Native verification:** Hermes decoding, bounded read behavior, SQLite rollback/races, import/backup round trips, accessibility, process death, offline detail, and actual gesture/chart performance.

## Evidence and open decisions

Resolve before implementation of the affected boundary:

- FIT SDK license acceptance and runtime compatibility; fallback package if acceptance fails.
- Raw FIT retention: recommended temporary only, retaining the content hash and all supported normalized source facts; optional persistent original retention changes privacy and backup capacity.
- Portable archive capacity policy: versioned source-chunk support, capacity preflight, and a reviewed response to full capacity. Merely raising limits without native memory testing is insufficient.
- Confidential broker hosting, app-to-broker authentication, credential custody, deletion/revocation behavior, and operations ownership if official API access becomes possible.
- Frozen connect/sync availability behavior when approval is absent. The prototype's simulated connected/success states are not evidence of actual access; record any necessary presentation deviation for owner review.
- Precise “Moving” metric provenance. `totalTimerTime` is timer-running time, not automatically verified moving time; retain separate elapsed/timer/moving fields and render an honest unavailable state when needed.

## Sources and confidence method

All URLs accessed or searched on **2026-10-06**. Public pages generally lack a visible last-updated date; access date is not a publication date. Research-plan selected web search and Context7; Context7/`ctx7` were unavailable, so FIT documentation used public web search and official source files. `query classify-confidence --provider websearch --verified` returned **MEDIUM**; that tier applies to cross-checked public findings above. `webfetch --verified` returned LOW, so direct-only or incomplete findings are identified rather than promoted to authoritative API contracts. Local source observations are marked local evidence, not third-party claims. Digests were persisted with `research-store put`.

| ID | Source | Date / evidence use |
|---|---|---|
| G1 | https://developer.garmin.com/gc-developer-program/program-faq/ | Undated public FAQ; direct text + search; business restriction, approval, OAuth2 |
| G2 | https://developer.garmin.com/gc-developer-program/activity-api/ | Undated public product docs; direct text + search; files, transport choices, consent, evaluation |
| G3 | https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf | Public PDF indexed excerpts; publication date not visible; PKCE and required secret. Full local extraction unavailable; confirm full current document before implementation |
| G4 | https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8 | Undated official support indexed content; original export workflow |
| F1 | https://developer.garmin.com/fit/get-the-sdk/ and https://github.com/garmin/fit-javascript-sdk | Official SDK listing and repository; direct README plus search |
| F2 | https://developer.garmin.com/fit/file-types/activity/ and https://developer.garmin.com/fit/cookbook/decoding-activity-files/ | Undated; indexed official details. Direct activity page returned a navigation shell, so detailed semantics use indexed content |
| F3 | https://registry.npmjs.org/@garmin%2Ffitsdk and https://www.npmjs.com/package/@garmin/fitsdk | Registry metadata: 21.217.0, published 2026-09-22; independent official SDK link validates package identity |
| F4 | https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt | License text last updated 2022-10-12; observed directly; acceptance not inferred |
| F5 | https://registry.npmjs.org/fit-file-parser and https://github.com/jimmykane/fit-parser | Registry metadata: 6.1.2, published 2026-09-22, MIT; fallback functionality remains unverified |
| E1 | https://docs.expo.dev/guides/authentication/ and https://docs.expo.dev/versions/latest/sdk/auth-session/ | Indexed official docs; code+PKCE and client-secret limitation. SDK57 direct page returned HTTP 403 |
| E2 | https://docs.expo.dev/versions/unversioned/sdk/securestore/ | Indexed official docs; secure token storage and Android backup configuration; exact SDK57 package version not selected |
| E3 | https://docs.expo.dev/versions/v57.0.0/sdk/map-view/ | SDK57 indexed official docs; Maps API key/plugin. Direct fetch returned HTTP 403 |
| E4 | https://datatracker.ietf.org/doc/html/rfc8252 | Native-app OAuth BCP, October 2017; external browser and native clients cannot keep shared secrets |
| L1 | `src/domains/portability/backupContracts.ts`, `backupFormat.ts`; `src/platform/sqlite/repositories/logicalBackupRepository.ts`, `logicalRestoreRepository.ts`, `logicalMergeRepository.ts` | Local current source, 2026-10-06; allowlist, size bounds, encrypted portability, merge extension points |
| L2 | `src/platform/files/expoBackupFilePort.ts`; installed `expo-file-system/build/File.d.ts` | Local current source/definitions; bounded read-only native file picker, cancellation and URI isolation |
| L3 | `plugins/withAndroidBackupRules.ts`, `src/platform/google/googleAuthAdapter.ts`, `src/platform/google/driveBackupStoreAdapter.ts` | Local current source; backup exclusions, account generation fencing, adapter isolation |
| L4 | `package.json`, `package-lock.json`, installed package metadata | Local current source; versions and absence checks |
| L5 | `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved-hybrid.html:3704` | Approved prototype source: static SVG, elapsed/moving/pace, optional HR, Lap/Time/Pace, explicit match action |
