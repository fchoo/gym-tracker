# Development commands

## Phase 18 Python coverage

Create or update the repository-local virtual environment from the checked-in exact dependency pin:

```sh
npm run bootstrap:coverage:phase18
```

Run the Python coverage evidence only after that explicit bootstrap step:

```sh
npm run test:coverage:phase18:python
```

The evidence command uses `.venv/bin/python` and never installs packages. A missing environment or any `coverage.py` version other than the version in `requirements-dev.lock` fails closed without writing a passed report.

## Dependency security and PR verification

`npm run audit:dependencies` rejects new advisory roots, new installed nodes,
changed advisory details, unexpected dependency relationships and inconsistent
severity counts. The checked-in `scripts/dependency-audit-policy.json` pins the
reviewed report and dependency versions. Exceptions expire on **2026-11-30**;
refresh their reachability review or remove the affected dependency before then.
Do not run `npm audit fix --force`: npm proposes incompatible Expo/Jest changes.

The application now resolves Zod 4.6.6 and decode-uri-component 0.5.1. Modern
build tooling resolves glob 14.0.3 and minimatch 11.0.3. Sources:

- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [URI decoder advisory](https://github.com/advisories/GHSA-qr28-fpjm-wq7f)
- [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
- [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

Three residual roots are reviewed rather than presented as fixed:

- Expo SDK 57 CLI's nested Zod 3.25.76 parses developer-owned configuration;
  application inputs resolve the patched top-level package.
- [deepmerge 4.3.1](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) has no patched
  npm release. Its exact node serves Expo/Jest configuration, not app input.
- Four Jest/test-exclude minimatch 3.1.5 copies retain their callable API. The
  advisory describes `firstPhasePreProcess`/`optimizationLevel >= 2` in v10.2.6;
  v3.1.5 contains neither preprocessing function nor that option.

npm reports propagated vulnerability entries, including known package cycles.
The validator binds the forward graph to the reviewed record; it does not approve
arbitrary recursive closure. npm sometimes omits indirect reverse `effects`
links, so each reported link is checked against that graph. Reverse links for
all three advisory roots must match exactly.

The four required PR checks retain their existing names and enforce install,
audit/configuration guards, types, boundaries, unit/component/SQLite/integration
and native-router tests, clean generated Android contracts, and production JS
bundling. Exhaustive historical native/Nyquist/all-module coverage producers
remain available for separately justified work; they are outside this personal
release's gate under the owner's 2026-10-30 reassessment. Their thresholds and
actual historical verdicts remain unchanged.

## Local artifact retention after personal acceptance

The owner authorized removal of ignored historical native runs on 2026-10-30.
The approximately 50 GiB local tree was reduced to about 121 MiB. Historical
paths in old reports are provenance references; those local bytes are no longer
available for full replay. No removed run may be relabelled as passing.

Retained locally:

- `artifacts/native/personal-release/20261025-230155-908098f388b1/`: accepted APK
  and build/signature records, SHA-256
  `259a607db376b3bf9eff28b92694e60ea0c28eac8c02285b618e6444cf945669`.
- `artifacts/native/interaction-responsiveness/`: phone acceptance/report.
- All Git-tracked `artifacts/host/` and `artifacts/review/` records.

Production Garmin/workout data and signing/Keychain material were untouched.
The emulator was left running; its deleted 10 KiB log inode will close when that
process exits. Future ordinary development does not require the deleted native
run directories. A separately requested historical evidence replay must prepare
new fixtures or obtain an external retained copy; it cannot assume those files
still exist locally.
