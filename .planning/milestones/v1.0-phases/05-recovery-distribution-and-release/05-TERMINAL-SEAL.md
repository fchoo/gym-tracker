# Phase 5 Terminal Seal — RETIRED (personal-use v1)

> **Status: retired and unexecuted.** This runbook governed the public-release ceremony
> (exact-candidate attended matrix, owner-approval token, no-rebuild GitHub Release
> promotion, and a final release-chain validator). Under the personal-use v1 delivery
> model that ceremony is out of scope: the workflows it validated
> (`release-candidate.yml`, `release-attended-evidence.yml`,
> `release-human-evidence-upload.yml`, `release-promotion.yml`, `nightly.yml`) were
> removed in PR #29, and delivery is now the signed APK/AAB built once by
> `personal-apk.yml`.
>
> Do not execute the command below. It is retained only as the historical record of the
> retired public-promotion gate and is tracked for any future public distribution as
> **V2-05** in `.planning/REQUIREMENTS.md`.

## Historical command (do NOT run — its workflows and inputs no longer exist)

```bash
# RETIRED — release-promotion / verify:release:phase5 chain removed in PR #29.
# npm run verify:release:phase5 -- --bundle-dir <retained-candidate-directory> ...
```

The original runbook required a canonical attended record binding the exact production
candidate's automated evidence, Phase 6 N4 Samsung evidence, attended emulator/phone
evidence, assistive-technology/design evidence, the literal lowercase owner token, and a
completed no-rebuild `promotion-proof.json`. None of those gates apply to the personal-use
signed-APK milestone.
