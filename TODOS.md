# TODOs

## Post-Implementation Visual QA

- [ ] Run `/design-review` before the Android release is declared visually complete.
  - **What:** Audit the implemented app in light, dark, compact, medium/expanded, landscape, and 200% text configurations.
  - **Why:** Validate real font rendering, icon optical balance, native controls, safe areas, contrast, focus, chart readability, and gym-floor hierarchy against the approved design.
  - **Pros:** Catches visual and accessibility defects that structural mockups cannot reveal.
  - **Cons:** Requires a complete UI, screenshot fixtures, and physical-device or emulator coverage.
  - **Context:** Use these approved references:
    - `~/.gstack/projects/gym_tracker/designs/approved-20260815/core-workout-flow.png`
    - `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png`
  - **Depends on / blocked by:** Implemented root screens, active workout, themes, width-class layouts, accessibility semantics, and screenshot tests.
