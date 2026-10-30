---
exact_sha: d9d2e7543791d45969c903699633b2bb62a9e707
base: 05fc397a92cb8a77c330573b8634a5bf0915492d
status: clean
issues_found: 0
critical: 0
informational: 0
score: 100
score_scale: 100
scope: source-only targeted three-file tab-label delta
native_visual_status: pending
native_status: pending
branch: agent-p20-tabs-review-d9d2e754
source_code_current_root_path: /Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review
---

# Phase 20 — Root tab-label source review

Pre-Landing Review: No issues found.

**Verdict: clean, 100/100 for this source-only delta. Native after-fix pixels remain unverified. This is not native PASS or full-milestone acceptance.**

## Immutable scope and method

Verified the existing review worktree's HEAD and branch against the exact target above. The supplied base is the merge base/ancestor. Read the complete base-to-target diff: exactly **3 files, 47 insertions, 24 deletions**:

- `src/ui/components/index.ts` — AppTabs label rendering and its private styles only.
- `src/ui/__tests__/foundation.test.tsx` — existing component assertions updated for the wrapper, with native-Text style separation/bounds assertions added.
- `app/(tabs)/__tests__/_layout.test.tsx` — existing integrated selection assertions updated for the wrapper.

All three on-disk files match their exact target Git blobs; neither staged nor unstaged changes affect them. Read root `AGENTS.md`, repository rules, the gstack review checklist, current `v1.2-SOURCE-PRECEDENCE.md`, and the approved Phase 14 `14-UI-SPEC.md`. Read only directly related typography, navigation/focus integration, and regression context beyond the diff; no full milestone or security re-audit.

The existing review checkout contains older reports, modified planning metadata, and a shared `node_modules` link. `status: clean` means zero review findings, not a clean checkout. No new worktree, branch switch, install, test execution, build, native/ADB operation, source edit, commit, push, fetch, or synchronization occurred. The only project write is this report in the UX-revamp Phase 20 planning directory.

## Layout, intrinsic sizing, and 200% text

The provided native crop diagnosis is last-letter clipping (`Workou`, `Calenda`, `Librar`, `Progres`) on the padded/bordered React Native Text nodes. I did not independently inspect or reproduce the crop. The target removes that padded/bordered Text construction without changing the words or font.

At `src/ui/components/index.ts:1188-1208`, the wrapper is a `View` with only styles and a new container test ID. Selection border color belongs to that View; the child Text retains `typeScale.body`, text color, the original text test ID, and `destination.label`.

Verbatim target styles at `src/ui/components/index.ts:1496-1507`:

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

- **Intrinsic label size remains content-led:** the centered wrapper has no fixed width; its maximum is bounded by its tab cell. The stretched child Text uses the wrapper's content box, with the 4dp-per-side padding owned outside native text measurement (`space[1]` is 4 at `src/ui/theme/index.ts:33-35`). This is not a full-cell selection underline or a text-width transform.
- **Small-width and large-text reflow remains available:** AppTabs still renders one row of four equal `flex: 1` cells. Neither the wrapper, Text, tab, nor navigation introduces a fixed height, max-height, hidden overflow, line-count clamp, ellipsis, font-scaling disablement, or font-size reduction (`components/index.ts:1188-1226, 1480-1507`). Wrapped text can increase the label, cell, and row height. These are source constraints, not measured native glyph/bounds results.
- **Targets are unchanged:** the interactive parent still has `minHeight: 64`, `minWidth: sizes.minimumTarget`, and its original padding (`components/index.ts:1486-1494`); `minimumTarget` remains 48 (`theme/index.ts:49-50`). Padding relocation does not move activation onto the smaller label wrapper.
- **Underline preservation:** every wrapper reserves the same 3dp border and 2dp bottom padding; only its border color changes. Verbatim selection expression at `components/index.ts:1193`: `{ borderBottomColor: selected ? colors.orange : "transparent" },`. Switching selection therefore introduces no border-thickness/height change. Selected ink/icon, quiet unselected treatment, paper navigation background, and line border remain unchanged.
- **Typography and copy are unchanged:** the four full labels remain at `components/index.ts:1108-1117`. Text still uses the same ArchivoVariable body role, 16sp / 22sp / weight 400 (`components/index.ts:1201-1207`; `theme/index.ts:18-20, 98-103`). No abbreviation, font substitution, Material default, or extra UI refactor is present.

This matches the approved composition: `14-UI-SPEC.md:118-125, 135-146, 244-250, 388-393` requires four equal bottom cells, full labels with vertical growth at 200% text, Archivo body labels, and a 3dp orange selected underline. `v1.2-SOURCE-PRECEDENCE.md:15-16, 26` preserves these labels/fonts and prohibits an unapproved rail substitution. This review does not remeasure the rendered prototype or its stored hashes.

## Semantics, hierarchy, activation, and focus

The hierarchy is still tablist → interactive tab → decorative icon and visible label; the label now has one noninteractive layout View. No label wrapper role, accessible name, focusability, handler, or native focus ID is added.

Verbatim unchanged parent contract at `src/ui/components/index.ts:1167-1175`:

```ts
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

The original Text IDs remain `root-tab-label-${destination.name}` (`1205`); the new `root-tab-label-container-${destination.name}` IDs (`1195`) are distinct and do not replace `root-tab-*` native identities. `rootFocus.ts:20-22` still generates those native identities for the interactive parent. A scoped consumer search found label/container references only in the component and the two changed tests; no other source consumer retains an obsolete border-on-Text expectation.

Navigation emission, prevent-default, already-selected, disabled, and missing-route handling are byte-unchanged (`components/index.ts:1141-1162`). Enter/Space still use the same activation helper (`116-133`); the blue focus outline remains on FocusablePressable (`301-329`), not the selection wrapper. Decorative icon hiding remains unchanged (`333-355`). The direct installed composition remains custom AppTabs in the bottom Tabs navigator (`app/(tabs)/_layout.tsx:139, 167-187`), with no tab-bar height clamp added. Root/trigger focus still addresses the unchanged refs/native IDs (`AppRootShell.tsx:108-137`). No screen-state or data-mutation logic changes in this delta.

## Regression inspection and supplied gates

The two test-file edits move border/padding assertions to the View while retaining Text typography/color assertions; they do not relax label, native-ID, selected-state, target, or focus expectations.

- `foundation.test.tsx`, **“renders Workout, Calendar, Library, and Progress as visible tabs in locked order”** (`865-940`): all four exact labels/native identities, unchanged body typography and colors, wrapper padding/underline, and focus. Added `924-928` checks each original Text has no horizontal padding or bottom border and every wrapper has `maxWidth: "100%"`.
- **“keeps %s root selection on ink and orange while focus stays blue”** (`942-995`): Light/Dark selected/unselected icon/text colors, View underline, and persistent orange selection after blue focus.
- Existing **“keeps four complete root destinations in one bottom composition at 200% text”** (`997-1037`): four complete destinations, 64dp/48dp targets, unclamped Text, focus, and Enter activation. Its title is not a native measurement.
- `_layout.test.tsx`, **“integrates the authoritative %s paper-nav selection treatment”** (`464-513`): actual RootTabsLayout integration in Light/Dark, selected wrapper border, unchanged Text metrics/colors, and focus.
- Existing **“keeps one bottom row with full labels at 200% text”** (`515-543`) explicitly sets `setRenderedDimensions(360, 2)` and asserts one four-label bottom row and targets. Existing resize/D-pad test (`545-587`) retains selection/focus and full Text after expansion. Host render assertions do not prove native glyph pixels.

The supplied execution results are **67 complete component cases across 3 suites, 0 skipped**, including the root-shell, 200%-text, Light/Dark, and focus cases, plus passing typecheck and **471 boundary checks**. The target commit message also records the 67-case/type/boundary result. No skip/todo/only test declarations were found in the two affected suites or the unchanged `src/ui/shell/AppRootShell.test.tsx`. These execution counts were not rerun or independently remeasured in this read-only review.

## Preserved closure and native boundary

The saved `20-PROGRESS-SORT-REVIEW-05fc397a.md:2-14, 19-25` records the base source review as clean, 100/100, zero issues, native pending. It is preserved, not replaced or repeated. The existing corrective-gate ledger (`20-CORRECTIVE-GATES.md:21`) records the earlier 49/49 source-security closure, score 100, zero open threats/risks. That prior closure and its reports remain historical evidence; this narrow label review neither reruns nor reissues a milestone/security PASS.

All **15** pre-existing review reports in the pinned checkout retained the same aggregate filename/content manifest SHA-256 before and after source inspection: `c4c56940b0191d243c2c198663014947ee90433ff8324927e7cf795dd5cf275f`. The existing shared dependency link still points to `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/node_modules`; no dependency environment or old evidence hash was rewritten.

**Native visual status: pending.** Source UI changes invalidate the previously compiled APK as evidence for this target SHA. A fresh final-source build and serialized/exclusive native verification must separately establish complete glyphs, actual small-width/200%-text bounds, target reachability, underline, and focus. No native work was performed here, no old APK/crop is relabelled as post-fix evidence, and no native PASS is claimed.

## Findings

**Critical: 0. Informational: 0. Total: 0. Score: 100/100 (targeted source review only).** No concrete finding meets the verbatim-line/confidence gate; no speculative unquoted warning is emitted. No source change or runtime mutation was made.
