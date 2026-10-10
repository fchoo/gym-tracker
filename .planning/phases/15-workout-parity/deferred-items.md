# Deferred Items

- 2026-10-10 — `gsd_run windows append` could not record the Plan 15-12 deviation because `.planning/WINDOWS.md` frontmatter reports `open/waived/fixed/total=1/0/83/84` while its entries yield `0/0/84/84`. This existing cross-phase ledger inconsistency is outside Plan 15-12's native matrix scope; reconcile the ledger before the next ship-gate run.
