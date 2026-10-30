---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-three-file-tab-label-source-security-continuation
exact_sha: d9d2e7543791d45969c903699633b2bb62a9e707
independent_source_sha: d9d2e7543791d45969c903699633b2bb62a9e707
base_sha: 05fc397a92cb8a77c330573b8634a5bf0915492d
branch: agent-p20-tabs-security-d9d2e754
baseline_report: .planning/phases/20-native-acceptance/20-PROGRESS-SORT-SECURITY-05fc397a.md
baseline_report_sha256: fd0086367ec0b230e9fc1e0aaa98af021eb7e8bf74fb106de2a8883df925a9e7
changed_files: 3
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
high_threats: 48
medium_threats: 1
mitigated_threats: 49
findings_total: 0
critical_findings: 0
high_findings: 0
medium_findings: 0
low_findings: 0
unregistered_flags: 0
warnings: 0
open_risks: 0
accepted_risks: 0
transfer_risks: 0
asvs_level: 1
block_on: high
score: 100
score_scale: 100
source_tracing_confidence: 9
host_proof: not_run
native_proof: not_run
native_proof_not_run: true
native_visual_confirmation_pending: true
native_acceptance_pending: true
release_authorized: false
created: 2026-10-23
---

# Phase 20 — Tab-Label Source-Security Continuation at d9d2e754

## Conclusion

**VERIFIED — independent, bounded source-security continuation only.** The complete three-file delta moves root-label padding and the selection underline from native `Text` into a non-actionable `View` wrapper. The retained parent `FocusablePressable` still owns activation, focus, role, selected/disabled state and native identity. No new navigation authority, inadvertent action handler, launch-trust bypass, source-integrity mutation, disclosure sink, credential/transport boundary, production permission, or evidence-acceptance authority change was established.

**49/49 authored source mitigations remain CLOSED by delta non-invalidation:** 48 High and one Medium; all disposition `mitigate`. There are zero open/blocking threats, findings at any severity, unregistered flags, warnings, open risks, accepted risks or transferred risks. **Scoped source-security score: 100/100; ASVS Level 1; block on High.** This retains the exact-base authored source-control closure; it is not full ASVS certification, a whole-milestone audit, or native acceptance.

**Native proof: NOT_RUN; fresh native visual confirmation and acceptance: PENDING; release authority: NOT_GRANTED.** The owner reports the earlier fresh `05fc397a` APK showed the last letter clipped on all four root labels and had not yet supplied its acceptance shards. That APK cannot establish the changed `d9d2e754` layout: its source binding is now superseded for this target. Neither a host style assertion nor this source review establishes that final-source native pixels, focus or accessibility grouping pass. Preserve earlier APKs/reports/failed immutable runs without relabelling them.

## Exact target and review boundary

- Reused checkout: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Independently verified branch: `agent-p20-tabs-security-d9d2e754`.
- Independently verified HEAD: `d9d2e7543791d45969c903699633b2bb62a9e707`.
- Independently verified base and direct parent: `05fc397a92cb8a77c330573b8634a5bf0915492d`.
- Complete exact delta: **3 files, 47 insertions, 24 deletions**. The full diff and pertinent changed/shared boundaries were read; all three checkout files match the exact pinned Git blobs byte-for-byte.

| Changed file | Delta | Change examined |
|---|---:|---|
| `src/ui/components/index.ts` | +24 / -11 | One label `View` wraps the retained `Text`; padding/underline belong to wrapper; centered child text has no padding/border. |
| `src/ui/__tests__/foundation.test.tsx` | +18 / -10 | Selection/padding assertions target the wrapper; child-padding/border absence and wrapper width constraint are asserted. |
| `app/(tabs)/__tests__/_layout.test.tsx` | +5 / -3 | Theme selection assertions distinguish wrapper underline from retained text color/typography. |

Root `AGENTS.md:1-38`, project rules, the complete preserved exact-base report, policy in `.planning/config.json:47-49`, and necessary unchanged focus/route/typography edges were read. No full milestone review or global quality checks were performed. All 49 authored threat rows and their trust boundaries were read from the twelve Phase 20 plans. All twelve complete plan files were independently compared byte-for-byte across base, target and checkout and are unchanged. The inherited register is specifically `20-PROGRESS-SORT-SECURITY-05fc397a.md:269-325`.

Static text comparisons independently confirmed these production sections are byte-identical across base/target: keyboard activation; the entire `FocusablePressable`; root destination definitions and navigation/parent-tab props; the outer tab-target layout; and the shared exercise/plan row callback section. The directly inspected files `app/(tabs)/_layout.tsx`, `src/ui/shell/rootFocus.ts`, `src/ui/theme/index.ts` and `.planning/config.json` also match base, target and checkout. These were static reads/comparisons, not application imports, tests or runtime execution.

**Only this new report is authored.** No new worktree, branch switch, dependency install, tests/coverage, build/prebuild, native/ADB/device operation, source edit, commit, push, fetch/sync, network action, private database-row read or credential operation was performed. Old reports and metadata are not rewritten, normalized or rebound to this SHA. No extra audit worker was dispatched or restarted; provider queue time is separate from actual review execution.

## Findings and confidence

| Classification | Count |
|---|---:|
| Critical | 0 |
| High / open High-or-higher blockers | 0 / 0 |
| Medium | 0 |
| Low | 0 |
| Unregistered security flags | 0 |
| Warnings / open / accepted / transferred risks | 0 / 0 / 0 / 0 |

**Source-tracing confidence: 9/10.** A real new finding must include severity, exact pinned source location, verbatim motivating code, confidence and a concrete consequence. None met that threshold. Native layout/accessibility observations not made by this auditor remain unverified, rather than being invented as either a vulnerability or a successful check. The pending native gate is not an accepted security risk.

## E1 — Presentation wrapper adds no action or authority

Verbatim changed label composition, `src/ui/components/index.ts:1188-1209`:

```ts
      h(
        View,
        {
          style: [
            styles.appTabLabelContainer,
            { borderBottomColor: selected ? colors.orange : "transparent" },
          ],
          testID: `root-tab-label-container-${destination.name}`,
        },
        h(
          Text,
          {
            style: [
              typeScale.body as TextStyle,
              styles.appTabLabel,
              { color: selected ? colors.ink : colors.quiet },
            ],
            testID: `root-tab-label-${destination.name}`,
          },
          destination.label,
        ),
      ),
```

The wrapper has only `style` and a fixed-format test identifier derived from the unchanged four-entry destination list (`1108-1117`). It has no handler, responder override, `focusable`, accessibility role/action, native ID, ref registration or prop spread. The child `Text` likewise has no activation handler or new semantic/authority prop. These nodes do not introduce a second source-level action target or route-selection owner. This is a source conclusion, not a measured native accessibility-tree conclusion.

Verbatim styles, `src/ui/components/index.ts:1496-1507`:

```ts
  appTabLabelContainer: {
    alignItems: "center",
    alignSelf: "center",
    borderBottomWidth: 3,
    maxWidth: "100%",
    paddingBottom: 2,
    paddingHorizontal: space[1],
  },
  appTabLabel: {
    alignSelf: "stretch",
    textAlign: "center",
  },
```

`space[1]` remains **4 dp** (`src/ui/theme/index.ts:33-41`). Underline width remains **3 dp** with selected orange/otherwise transparent; bottom padding remains **2 dp**. The wrapper centers and bounds its layout with `maxWidth: "100%"`; the retained text stretches within that centered wrapper and aligns centrally. The changed label styles add no text padding, border, fixed text width/height, clipping/overflow setting, `numberOfLines`, font-scaling disablement, absolute overlay or hit-target replacement. Native visual success still requires observation.

Text continues using unchanged `typeScale.body`: `ArchivoVariable`, size **16**, line height **22**, weight **400** (`src/ui/theme/index.ts:18-22,98-103`), selected ink/unselected quiet (`components/index.ts:1201-1203`). Literal labels and old `root-tab-label-*` text test IDs are retained. Only distinct wrapper test IDs are added; they are not native routing/focus IDs.

## E2 — Sole tab activation, route matching and launch-trust guards remain unchanged

Verbatim retained activation, `src/ui/components/index.ts:1150-1162`:

```ts
    function navigate() {
      if (disabled || route === undefined) {
        return;
      }
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!selected && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    }
```

Route lookup remains exact matching against the fixed destination name, and selection remains derived from navigator state (`1141-1148`). The existing guard returns before emission for disabled or missing routes. Otherwise the selected tab can emit its existing preventable `tabPress`, but navigation is suppressed for the selected route or a prevented event. No label/wrapper/test ID becomes a route input; no new `router.push`, URI/deep-link input, data writer or callback authority appears.

Verbatim unchanged semantic/activation owner, `src/ui/components/index.ts:1164-1175`:

```ts
    return h(
      FocusablePressable,
      {
        accessibilityLabel: destination.label,
        accessibilityRole: "tab",
        accessibilityState: { disabled, selected },
        disabled,
        focusable: !disabled,
        key: destination.name,
        nativeID: rootTabNativeID(destination.name),
        ...keyboardActivationProps(disabled, navigate),
        onPress: navigate,
```

The parent tab retains all four accessible labels, selected/disabled state, focusability and sole activation callback. Native IDs remain `root-tab-${root}` from the unchanged `rootTabNativeID` (`src/ui/shell/rootFocus.ts:20-22`). `RootTabsLayout` still passes `disabled={launchState !== "trusted"}` and the original navigator state/navigation (`app/(tabs)/_layout.tsx:175-180`), declares exactly Workout/Calendar/Library/Progress in the same order (`183-186`), and stays on the bottom row (`139,167-174`). The wrapper does not bypass launch readiness.

Shared row routing is also unchanged. In `ExerciseRow`, an absent callback still yields a non-actionable `View`; a supplied callback still belongs to the existing button `FocusablePressable` and its guarded keyboard activation (`components/index.ts:1306-1325`). The whole exercise/plan row source section is byte-identical across the exact delta; no caller-owned row callback is rebound to the new label wrapper.

## E3 — Focus and minimum targets remain on the parent, not the wrapper

The entire unchanged `FocusablePressable` (`src/ui/components/index.ts:232-331`) maintains its existing internal native ref and guarded focus registration (`250-288`). Its imperative focus path targets that parent ref (`263-281`), not the newly introduced label `View`. Source focus/blur only updates focus state/registration and invokes an existing supplied focus callback; it does not invoke tab activation:

```ts
// src/ui/components/index.ts:310-318
      onFocus: (event: Parameters<NonNullable<PressableProps["onFocus"]>>[0]) => {
        setFocused(true);
        setPreferredFocus(false);
        if (focusRegistration !== null && participatesInFocusTrap) {
          focusRegistration.onFocus(registrationRef);
        }
        onFocus?.(event);
      },
      onPress,
```

`AppTabs` supplies no additional focus callback. Existing keyboard activation calls the same guarded `navigate` only for Enter or Space when not disabled (`components/index.ts:116-134,1174`). Focus itself therefore does not acquire navigation authority through the new wrapper. The unchanged focus ring remains on the parent (`320-327`); selection underline remains on the wrapper (`1193`) and cannot replace the focus owner.

The outer parent target remains `minHeight: 64`, `minWidth: sizes.minimumTarget`, `flex: 1`, centered contents and original padding/gap (`components/index.ts:1486-1495`); `sizes.minimumTarget` remains **48 dp** (`theme/index.ts:49-50`). The bottom tab row remains a row (`1483-1484`) with no newly introduced row wrapping or alternate rail. The label's new `maxWidth` constraint does not modify the parent's declared **48 × 64 dp minimum target**. These are retained declared constraints, not device-measured hit areas.

## E4 — Tests are retained host assertions; native proof is not inherited

Both changed test files retain their case-declaration lines byte-for-byte and add no `skip`, `only` or `todo`. Assertions were read, not executed:

- `src/ui/__tests__/foundation.test.tsx:865-940`: locked label order, four old native IDs and visible labels remain asserted; wrapper owns padding/underline; all four child texts lack horizontal padding and border; all four wrappers assert `maxWidth: "100%"`; parent focus remains blue.
- `foundation.test.tsx:942-995`: both themes retain ink/quiet label/icon colors, orange selection and independent parent focus styling.
- `foundation.test.tsx:997-1037`: one bottom composition, four accessible labels, minimum 48 × 64 targets, no `numberOfLines`, parent focus and Enter-to-Progress activation remain asserted.
- `foundation.test.tsx:1147-1167`: disabled root destinations are announced unavailable and do not navigate when pressed.
- `foundation.test.tsx:1402-1471`: exercise/plan callbacks and existing selected/nonselected tab branches remain exercised. `1473-1499` retains prevented-event and missing-route non-navigation assertions.
- `app/(tabs)/__tests__/_layout.test.tsx:422-462`: six width cases retain the bottom navigator and four root tabs. `464-513` keeps both theme selection/text/focus assertions with wrapper-targeted underline checks. `515-543` retains 200% text declared target sizing; `545-604` retains live-resize/D-pad route state and parent focus assertions.

**Owner-provided host execution, not independently reproduced:** 67 complete component cases across three suites passed with zero skips; typecheck passed; 471 boundary checks passed. This auditor ran none of these commands, did not inspect a fresh final-source APK and did not read current device pixels/semantics. No coverage threshold, boundary registration, fixture, permission, production activation or timing budget is changed in the exact three-file delta.

The reported earlier native all-four final-letter clipping motivates separating text shaping from padding/border. That observation does not demonstrate the changed wrapper's final native behavior. A fresh `d9d2e754`-bound build and exclusive-device visual/semantic acceptance remain pending in the responsible native stream. Host PASS is not native PASS; old `05fc397a` binary provenance, cached captures and source-security closure cannot be rebound by changing a report header.

## All 49 authored mitigations — non-invalidation register

**CLOSED** below means the exact three-file delta does not invalidate the authored source mitigation, retaining exact-base source closure. It never means a native case ran. **U** denotes unchanged registered source controls inherited from `20-PROGRESS-SORT-SECURITY-05fc397a.md:269-325`; **E1–E4** denote directly reviewed shared boundaries above. All twelve authored plan files are byte-identical across base, target and checkout; every row retains disposition `mitigate`.

| Threat ID | Severity | Authored row | d9d2e754 assessment |
|---|---|---|---|
| T-20-01-01 | high | `20-01-PLAN.md:112` | CLOSED — U/E1/E2: source registries/order/identity unchanged; wrapper IDs add no authority. |
| T-20-01-02 | high | `20-01-PLAN.md:113` | CLOSED — U/E4: exact run/build/nonce binding unchanged; old APK not rebound. |
| T-20-01-03 | high | `20-01-PLAN.md:114` | CLOSED — U/E4: sole validator-derived acceptance unchanged. |
| T-20-01-04 | high | `20-01-PLAN.md:115` | CLOSED — U/E1: no private identity/output sink added. |
| T-20-02-01 | high | `20-02-PLAN.md:140` | CLOSED — U: migration/restore/merge/FK/graph writers untouched. |
| T-20-02-02 | high | `20-02-PLAN.md:141` | CLOSED — U: transaction receipts/source digests/replay untouched. |
| T-20-02-03 | high | `20-02-PLAN.md:142` | CLOSED — U/E4: ordered native case set/zero-skip policy unchanged. |
| T-20-02-04 | high | `20-02-PLAN.md:143` | CLOSED — U/E1: no native/private result payload added. |
| T-20-03-01 | high | `20-03-PLAN.md:125` | CLOSED — U: Garmin hash/schema/bounds/transaction controls untouched. |
| T-20-03-02 | high | `20-03-PLAN.md:126` | CLOSED — U: provider/match independence/revision fencing unchanged. |
| T-20-03-03 | high | `20-03-PLAN.md:127` | CLOSED — U/E2: Calendar generation/callback/trace authority unchanged. |
| T-20-03-04 | high | `20-03-PLAN.md:128` | CLOSED — U/E1: no Garmin/account/credential output added. |
| T-20-04-01 | high | `20-04-PLAN.md:145` | CLOSED — U/E2/E4: exact source-flow mapping and snapshots unchanged. |
| T-20-04-02 | high | `20-04-PLAN.md:146` | CLOSED — U/E4: measured native configuration/restoration remains required. |
| T-20-04-03 | high | `20-04-PLAN.md:147` | CLOSED — U/E4: accepted-exception authority/separate non-PASS count unchanged. |
| T-20-04-04 | high | `20-04-PLAN.md:148` | CLOSED — U/E1: screenshot/semantic privacy policy unchanged. |
| T-20-05-01 | high | `20-05-PLAN.md:110` | CLOSED — U/E4: exact marker/build/device binding unchanged. |
| T-20-05-02 | high | `20-05-PLAN.md:111` | CLOSED — U: raw sample arrays/limits/counts/recomputation unchanged. |
| T-20-05-03 | high | `20-05-PLAN.md:112` | CLOSED — U/E4: failure/cold/max/overhead retention unchanged. |
| T-20-05-04 | medium | `20-05-PLAN.md:113` | CLOSED — U/E1: no fixture growth or yielding/cancellation/budget change. |
| T-20-06-01 | high | `20-06-PLAN.md:111` | CLOSED — U/E4: exact source/byte/signature/package/device/config binding unchanged. |
| T-20-06-02 | high | `20-06-PLAN.md:112` | CLOSED — U/E4: sole validator/immutable inputs/seal-time rehash unchanged. |
| T-20-06-03 | high | `20-06-PLAN.md:113` | CLOSED — U: complete exception metadata/separate counts unchanged. |
| T-20-06-04 | high | `20-06-PLAN.md:114` | CLOSED — U/E1: no new private content sink; recursive privacy controls unchanged. |
| T-20-07-01 | high | `20-07-PLAN.md:105` | CLOSED — U/E4: attended record remains observation-only. |
| T-20-07-02 | high | `20-07-PLAN.md:106` | CLOSED — U/E4: final-source/APK/device/PNG proof still required. |
| T-20-07-03 | high | `20-07-PLAN.md:107` | CLOSED — U/E4: no release/readiness/exception authority granted by this review. |
| T-20-07-04 | high | `20-07-PLAN.md:108` | CLOSED — U: archive/rollback/schema/forward-fix boundary unchanged. |
| T-20-08-01 | high | `20-08-PLAN.md:99` | CLOSED — U/E4: host/source assertions cannot substitute native terminal evidence. |
| T-20-08-02 | high | `20-08-PLAN.md:100` | CLOSED — U/E4: fresh frozen final-source single-build ownership remains required. |
| T-20-08-03 | high | `20-08-PLAN.md:101` | CLOSED — U/E4: compiled package/byte/signature verification not weakened. |
| T-20-08-04 | high | `20-08-PLAN.md:102` | CLOSED — U/E1: no serial/private path/config disclosure added. |
| T-20-09-01 | high | `20-09-PLAN.md:89` | CLOSED — U: SQLite/FK/integrity/graph/canonical digest controls untouched. |
| T-20-09-02 | high | `20-09-PLAN.md:90` | CLOSED — U: receipt/pointer/rest/effect/kill/retry authority unchanged. |
| T-20-09-03 | high | `20-09-PLAN.md:91` | CLOSED — U/E4: exact source/device/build/fixture/case binding unchanged. |
| T-20-09-04 | high | `20-09-PLAN.md:92` | CLOSED — U/E1: bounded synthetic/hash/code/count reporting unchanged. |
| T-20-10-01 | high | `20-10-PLAN.md:96` | CLOSED — U: Garmin normalized digest/schema/transaction controls untouched. |
| T-20-10-02 | high | `20-10-PLAN.md:97` | CLOSED — U: provider/match/revision-fenced selection unchanged. |
| T-20-10-03 | high | `20-10-PLAN.md:98` | CLOSED — U/E2: Calendar measured trace/generation/callback identity unchanged. |
| T-20-10-04 | high | `20-10-PLAN.md:99` | CLOSED — U/E1: no payload/location/account/token/device output added. |
| T-20-11-01 | high | `20-11-PLAN.md:119` | CLOSED — U/E2/E4: exact case/source snapshots and immutable references retained. |
| T-20-11-02 | high | `20-11-PLAN.md:120` | CLOSED — U/E3/E4: semantic-first measured native gates still required. |
| T-20-11-03 | high | `20-11-PLAN.md:121` | CLOSED — U: fixed performance limits/counts/cold/max/p95/overhead unchanged. |
| T-20-11-04 | high | `20-11-PLAN.md:122` | CLOSED — U/E1: synthetic screenshot/trace/privacy controls unchanged. |
| T-20-12-01 | high | `20-12-PLAN.md:114` | CLOSED — U/E4: sole post-checkpoint final verdict derivation unchanged. |
| T-20-12-02 | high | `20-12-PLAN.md:115` | CLOSED — U/E4: owner/source observation cannot change technical/release authority. |
| T-20-12-03 | high | `20-12-PLAN.md:116` | CLOSED — U/E1: synthetic/hash/safe-path/uniqueness/privacy boundaries unchanged. |
| T-20-12-04 | high | `20-12-PLAN.md:117` | CLOSED — U/E4: complete rationale/scope/hash/policy metadata and counts retained. |
| T-20-12-05 | high | `20-12-PLAN.md:118` | CLOSED — U: prior APK/archive/schema and old-APK/new-schema prohibition retained. |

**Reconciliation: 49 total = 49 CLOSED + 0 OPEN; 48 High + 1 Medium; 49 mitigate + 0 accept + 0 transfer.** No authored mitigation is invalidated and no new concrete unregistered security flag is established. Data/credential/log/DB/transport/source-integrity/production-build-permission controls are unchanged by the exact delta; unchanged controls are inherited, not globally re-audited.

## Preservation and pinned fingerprints

Before report creation, a read-only snapshot covered **69 existing Phase 20 security/review/plan artifacts across the reused checkout and primary workspace**, recording SHA-256, size, mode, inode and nanosecond mtime. Its canonical metadata/content fingerprint was:

```text
55050f8270e7080e9509f3e1883c37ff8aa3e80d86daf60d8ee3cf4178a89e2c
```

This new report was absent and is excluded from the old-artifact set. The preserved exact-base report's SHA-256 is `fd0086367ec0b230e9fc1e0aaa98af021eb7e8bf74fb106de2a8883df925a9e7`. No old report header/hash is edited or rebound. The snapshot is local read-only preservation evidence, not native acceptance evidence.

| Exact pinned changed file | SHA-256 |
|---|---|
| `src/ui/components/index.ts` | `1beb2c5930a42b21c510b9e316283c0c8363a321c0f990e9c6dd76279f02001f` |
| `src/ui/__tests__/foundation.test.tsx` | `220f1b32f16365a8ceb7e1dbb7ab7e136fc7693c64317527f02c0e4d9c6712c3` |
| `app/(tabs)/__tests__/_layout.test.tsx` | `c9f48b527cfd2248e3d5eea749548ee6f20e33098a460143c52ae848eeb633f4` |

## Final sign-off

- [x] Exact existing branch/HEAD/direct-parent and complete three-file delta verified.
- [x] New label wrapper is presentation-only; no additional source-level action, semantic role or authority.
- [x] Fixed label/native IDs, navigator ownership, launch-trust and selected/prevented/missing-route guards retained.
- [x] Parent focus registration/ref/ring, disabled semantics and declared minimum 48 × 64 dp targets retained.
- [x] Shared row callbacks, body typography/colors, bottom-row routing and policy unchanged.
- [x] Changed host assertions inspected; no new skip/only/todo or case-declaration change.
- [x] All 49 authored threat mitigations reconciled without source invalidation; zero new findings/flags/risks.
- [x] Source-security score 100/100, ASVS L1, block on High; only this requested report authored.
- [ ] Independent host test/typecheck/boundary execution — **NOT_RUN**, owner-provided results only.
- [ ] Fresh final-source native visual/semantic/compiled acceptance — **NOT_RUN / PENDING**.
- [ ] Release approval — **NOT_GRANTED**.

**AI-assisted review limitation:** This focused source-only continuation can miss subtle vulnerabilities. It is not a penetration test, full ASVS certification, security guarantee, whole-branch audit or replacement for required fresh native evidence and professional review where appropriate.
