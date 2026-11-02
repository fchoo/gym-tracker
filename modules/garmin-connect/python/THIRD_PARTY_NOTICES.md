# Garmin Python runtime notices

The installed app bundles only the locked artifacts in `garmin-python-lock.json`.
Their source, immutable artifact filename, SHA-256, and licence identifier are
reviewed by `scripts/verify-garmin-python-lock.mjs` before packaging.

| Package | Version | Licence |
| --- | --- | --- |
| python-garminconnect | 0.3.17 (`218e72ca5459e014435fc2d94fd18bd601fa0c14`) | MIT |
| curl-cffi | 0.15.0 | MIT |
| requests | 2.34.2 | Apache-2.0 |
| ua-generator | 2.1.6 | MIT |
| certifi | 2026.7.22 | MPL-2.0 |
| cffi | 2.1.1 (local Android cross-build) | MIT-0 |
| chaquopy-libffi | 3.3 (official Android wheel, build 3) | MIT |
| pycparser | 3.11 | BSD-3-Clause |
| rich | 15.0.0 | MIT |
| markdown-it-py | 4.2.0 | MIT |
| mdurl | 0.1.2 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| charset-normalizer | 3.5.2 | MIT |
| idna | 3.20 | BSD-3-Clause |
| urllib3 | 2.8.0 | MIT |

The upstream copyright and permission texts distributed with each locked
artifact remain part of the corresponding Python package. No credential,
account, activity payload, route, health, bodyweight, or filesystem data is
included in this notice bundle.
