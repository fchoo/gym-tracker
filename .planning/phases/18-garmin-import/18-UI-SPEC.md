# Phase 18 UI Specification — Garmin account import

**Reconciled:** 2026-10-07
**Oracle:** approved Revision 18 presentation, updated only where the final account-sync architecture changes unavailable actions

## Routes

| Route | Purpose |
|---|---|
| app/garmin/index.tsx | Connection, login/MFA, foreground sync, retained activity history |
| app/garmin/activity/[activityId].tsx | Read-only factual imported activity detail |
| app/garmin/match/[activityId].tsx | Stable Running occurrence selection and explicit confirmation |

Garmin is not a tab. Workout and Running plan open the Garmin root with a validated origin. Calendar opens the detail route with an opaque local activity ID. The four roots remain Workout, Calendar, Library, Progress.

## Header

Garmin root uses a stable three-column header: inert back-sized placeholder, one-line Garmin Sync title, Appearance flush right. Deep routes use functional Back, a centered one-line title, and Appearance flush right. At 200% text, preserve column alignment and expose the full title accessibly without turning the root placeholder into a control.

## Root states

### Disconnected

- Heading: Garmin not connected
- Primary action: Connect Garmin
- Supporting copy explains that sign-in happens in this installed app and internet is needed only to fetch new activities.
- Previously imported activities remain visible and openable.
- Offline and temporary-unavailable states preserve history and offer Retry when appropriate.

### Credentials

- Email and Password fields; Continue and Cancel.
- Password uses secure entry and is never restored after leaving the operation.
- Submit disables duplicate activation and shows a bounded busy state.
- Invalid credentials preserve email but clear password and focus the error summary.

### MFA

- One-time code field, Verify, Cancel.
- The opaque continuation handle is controller-owned; no account/token values appear in route params.
- Invalid/expired code preserves the dialog and provides a recoverable error.
- Back/Cancel ends the pending login without token or activity writes.

### Connected

- Connected status, last successful sync time, durable new/unchanged counts, Sync now, and Disconnect Garmin.
- Account display is privacy-minimal and never shows token/provider subject/external IDs.
- Imported activities use local IDs for navigation.

### Syncing and result

- One foreground Syncing Garmin activities state with progress by bounded page/activity counts, not fake percentages.
- New activities and No new activities are distinct committed outcomes.
- Partial failure reports how many activities committed and which classified recovery action is available; it never rolls back prior committed pages.
- Offline, sign-in-needed, data-access-denied, rate-limited, timeout, malformed-response, and temporary-service states have distinct copy and preserve prior history.
- Rate limited may show a validated Retry after time; no automatic countdown triggers network work.

### Disconnect

- Confirmation explains that local imported history remains.
- Confirm invalidates in-flight work, clears encrypted session state, and returns to disconnected only after local logout completes.
- Failure leaves the prior connection state and offers Retry; no claim of server-side revocation is made.

## Activity list

Rows expose factual activity title/type, confirmed local date, distance/time summary when present, match state, and source revision status. Missing values stay absent. A changed source revision shows Needs review without replacing accepted facts. Rows are full-width 48dp-or-larger targets with one semantic activation.

## Activity detail

The detail route is read-only. It renders only accepted payload facts in this order:

1. activity identity/type and confirmed date;
2. Distance;
3. Elapsed;
4. Moving when source-provided, otherwise Timer when source-provided;
5. Average pace with explicit time basis;
6. route section;
7. Average heart rate when present, with stable label/value spacing;
8. laps table;
9. source-fidelity disclosure and Match to scheduled workout.

Outdoor route draws only validated source positions and segment gaps. Outdoor without usable positions shows Route unavailable. Treadmill always shows No route for treadmill activity. No map/location permission is requested.

The accessible lap table uses exactly Lap, Time, Pace. Rows preserve source order and source-lap semantics. Missing time/distance/pace is announced as unavailable, not zero. At 200% text, each row may stack label/value pairs while retaining row/column semantics.

Sampled chart/polyline data carries Sampled data disclosure. Exact arbitrary-distance best efforts are absent unless eligible source summary/lap evidence exists; otherwise the dependent surface uses More data needed.

## Matching

- Heading: Match to scheduled workout
- Each candidate exposes plan, session type, local date/time, target summary, stable slot context, and current state.
- Initial ranking may select a candidate visually, but selection writes nothing.
- Actions: Confirm match and Leave unmatched.
- Back and Leave unmatched return to the same activity with zero match/event/receipt writes.
- Confirm shows busy, then Matched only after the shared command commits.
- Stale/consumed/conflicted candidate, save failure, already matched, no candidate, unmatch, and reassignment preserve the activity and provide explicit recovery.

## Error and recovery states

| State | Required behavior |
|---|---|
| loading | skeleton/status; no fabricated row/detail |
| missing local activity | bounded not-found screen; Back works |
| accepted payload unavailable | projection error and Retry; no fallback to raw response |
| source revision review | current/proposed factual differences; explicit use/keep decision owned by shared import command |
| interrupted sync | prior activities visible; Retry starts a new generation |
| lost post-commit acknowledgement | receipt replay opens existing activity and reports no duplicate |
| token restore failure | sign-in required; history remains |
| technical proof failure | no production UI state; evidence is TECHNICAL_REVIEW_REQUIRED |

## Appearance, input, and focus

- Reuse the persisted Light/Dark/System provider and Appearance sheet. Selection is synchronized with App Settings.
- Dismissing Appearance restores its invoker and preserves login/sync/detail/match state.
- Touch, Enter, Space, and D-pad activate exactly once; visible focus is required.
- Back priority: modal/sheet, then deep route, then contextual origin.
- Required actions are at least 48dp. All layouts reflow at 360x800, 390x844, 600x960, 840x1080-equivalent, landscape, and 200% font scale.
- Reduced motion changes animation only, never state or navigation order.

## Exact exclusions from product UI

Do not show manual-file import, developer-program approval, broker configuration, desktop helper, Drive inbox, runtime-agent, Python installation, terminal, server, or JavaScript-engine controls. Those are not owner actions in the selected milestone.
