# Project Instructions

Read and follow `AGENTS.md` from the repository root.

## Source Documents

- Product, design, architecture, testing, and delivery contract:
  `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md`
- Engineering QA plan:
  `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md`
- Approved core workout reference:
  `~/.gstack/projects/gym_tracker/designs/approved-20260815/core-workout-flow.png`
- Approved app-system reference:
  `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png`

## Non-Negotiable Practices

- Keep SQLite source facts authoritative.
- Keep notifications, projections, and recommendations replayable or rebuildable.
- Do not acknowledge a set before its exclusive transaction commits.
- Preserve bundled versus user-owned data boundaries.
- Keep the workout critical path offline.
- Write tests with each behavior; integrity-critical modules require complete branch coverage.
- Use atomic commits. Every commit message must end with:

  `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`
