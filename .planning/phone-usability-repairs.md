# Phone usability repairs

The owner reported clipped bottom-sheet actions, excess Library header space, clipped planned-workout title, an empty Calendar, missing quick month navigation, no deletion for unused plans, failed planned-workout start, unnecessary starter explanations, and persistent blue touch-focus outlines.

## Delivery contract

- Use one bounded bottom-sheet viewport. The complete content scrolls past the last action with actual safe-area clearance, keyboard avoidance and font scaling preserved.
- Remove the top Library Create plan banner and its extra content padding. Keep contextual creation and the action menu.
- Give the planned-workout title adequate line height for its font.
- Fill the Calendar's actual screen region so its grid has a nonzero scroll viewport. Preserve the existing horizontal month controller and add a direct month/year picker based on the Helper Payroll reference.
- Allow deletion of an unused owned plan, including an activated plan with no workout linkage. Check eligibility in the exclusive transaction. Retire an unused active schedule, mark the plan deleted durably, preserve immutable graph/receipts, and prevent stale reactivation. Historical, removed and active workout/source links block deletion. Remap plan-bearing marker keys in portable merge.
- Start scheduled workouts with the current saved day revision while continuing to reject stale selections at the transaction writer.
- Remove Source notes and Progression summary from Library starter screens.
- Remove outlines left by touch interaction while retaining keyboard and accessibility focus behavior.

## Source findings

AdaptiveScreen did not flex its primary region for a nested non-scrolling layout. Host Yoga reproduced a zero-height Calendar clipping region. The shared fix is committed in 276d9829.

BottomSheet applied percentage caps at multiple levels; some callers also capped the content container. The planned title used a 57-point font with a 49-point line height. Touch and keyboard focus shared one unconditional outline state.

The Schedule reader hardcoded day revision 1. A focused actual-SQLite regression reproduced a current saved day revision 3 being emitted as 1; the repaired reader fetches the current revision and retains stale-selection rejection.

## Verification

Run only new or source-affected cases for the changed components, Calendar transitions, deletion integrity and workout start. Do not rerun the previous passing timezone checks or broad Phase 20 acceptance. Integrate all source repairs, run one final compiler/boundary check, build one signed production APK, install with data preserved, and check the reported paths on the exact Samsung under exclusive device ownership. Use no credential or login checks.

## Ownership

Calendar: phone_calendar_repair, fchoo/phone-calendar-repair, isolated temporary worktree.

Library/deletion: phone_library_repair, fchoo/phone-library-repair, isolated temporary worktree.

Sheets/focus/font metrics: phone_layout_repair, fchoo/phone-layout-repair, isolated temporary worktree.

Root: shared AdaptiveScreen, schedule reader/start, runtime and route integration, final source build and all device work.
