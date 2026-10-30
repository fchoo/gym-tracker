# Reproducible Android CFFI 2.1.1

## Defect and boundary

The retained acceptance APK SHA-256
`5b7a8e8c531f09aab98a4e7b0e0f6d49513b9c477045746221263fdd40c17ed0`
contains a Mach-O ARM64 `_cffi_backend.cpython-313-darwin.so` in
`assets/chaquopy/requirements-common.imy`. The old lock selected a CFFI source
archive, and the plugin explicitly installed it with `--no-deps`, allowing a
host extension build. The selected curl wheel is Android ELF, but requires
`cffi>=2.0.0`. Chaquopy's published CFFI 1.17.1 cannot satisfy that requirement.

This directory contains a real CPython 3.13 / Android API 24 / ARM64 CFFI 2.1.1
cross-build. It does not contain, select, or retag a host wheel. The Python client
remains 0.3.17 at `218e72ca5459e014435fc2d94fd18bd601fa0c14`; Chaquopy 17,
Python 3.13 and standalone curl-cffi 0.15.0 are unchanged. No upstream curl
requirement is edited. No fallback or provider/account operation is performed.

Packaging correctness is **not** proof that sign-in is fixed. The parent must
still verify selected-client/CFFI initialization on its exclusively leased
emulator, then run fresh final-source native acceptance. Authentication and
provider behavior are separate investigation boundaries.

## Locked inputs and output

`build-inputs.json` records exact public URLs, complete SHA-256 digests, compiler
and linker identities, and digests of the relevant NDK sysroot/runtime header
and library trees. Its SHA-256 is
`40c706297872d458021a090d3c84bbcbd401e6e2570d8af86080156ba682d9e0`.
The packaging validator binds that manifest and the local wheel independently.

| Input | Origin | SHA-256 |
| --- | --- | --- |
| CFFI 2.1.1 source | PyPI source, unchanged from the previous lock | `dd31f52ea1086513bb9df30f8fcee9b8918323ae067a3d5b78bc826a000712be` |
| Python headers and runtime | Official Chaquopy `com.chaquo.python:target:3.13.9-0`, Maven Central ARM64 ZIP | `c19f39fecada0b3932ab7a61b0f214c1212068cbbae0dc22c2afa38a4f354b8e` |
| Android libffi headers and library | Official `chaquopy_libffi-3.3-3-py3-none-android_24_arm64_v8a.whl` | `86873c2f8e5e43b07b72233bf35e06ad8dae41ba98e0556202d61d00d7ad952f` |
| Android wheel output | Local reproducible cross-build in this directory | `850ee4664381151d0e10407de861b47e0c9954a06e4b0e8307431472990bd767` |
| `_cffi_backend.so` | Compiled from the locked source | `914bbcc8d16ef427ac5675b81d0662028cc8d35141a3f38a5459ee4d85f3e3f1` |

The output is ELF64, little-endian, ET_DYN, AArch64, Android API 24. It exports
`PyInit__cffi_backend`, has 16 KB PT_LOAD alignment, and has exactly these
DT_NEEDED entries: `libffi.so`, `libpython3.13.so`, `libdl.so`, `libm.so`, `libc.so`.
Linking uses `--no-undefined`; there is no host library path or CFFI RPATH.

The new CFFI wheel preserves upstream Python files, public CFFI headers,
metadata, version and MIT-0 licence. It adds the Android shared-library provider
`Requires-Dist: chaquopy-libffi==3.3`, as the official Chaquopy wheel builder does
for external library providers. The lock explicitly installs that official
libffi wheel because `--no-deps` remains deliberate. All wheel RECORD entries
have validated SHA-256 digests and sizes. Two different work directories
produced byte-identical wheels; a third, manifest-validated CLI build matched.

## Rebuild, without an APK or device

Run from the repository root on macOS with the existing pinned NDK
`27.1.12297006`, Node, and Python 3 standard library. No pip installation,
Docker image, host Python headers, Android target execution, ADB, or credentials
are needed. Python only handles archive I/O; NDK clang compiles the extension.
This manifest pins the macOS toolchain binaries, not an unverified Linux rebuild.
The binary checker can use either macOS or Linux NDK readelf.

```sh
node scripts/build-android-cffi.mjs \
  /opt/homebrew/share/android-commandlinetools/ndk/27.1.12297006 \
  /private/tmp/p20-cffi-pinned-input-cache \
  /private/tmp/NEW-UNUSED-cffi-work \
  artifacts/review/NEW-UNUSED-cffi-output
```

The cache is reused only after hash validation. Missing or corrupt inputs are
fetched from their locked public origins and checked before use. Work and output
directories must be new: existing paths fail rather than overwrite evidence.
An output hash mismatch fails before publication and leaves the work directory
for diagnosis. The output directory receives the digest-matched wheel and a
receipt containing the input-manifest digest, output digest, native inspection
and full compiler arguments. The committed wheel is the normal packaging
input; rebuilding never silently substitutes a different digest.

The narrow compiler/linker setup follows:

- https://github.com/chaquo/chaquopy/blob/17.0.0/server/pypi/build-wheel.py
  (Android target headers, `-lpython3.13`, shared-library provider metadata).
- https://github.com/chaquo/chaquopy/blob/17.0.0/server/pypi/packages/cffi/meta.yaml
  (official Android libffi dependency).
- https://github.com/chaquo/chaquopy/blob/17.0.0/target/android-env.sh
  (`--no-undefined`, build ID, API 24, 16 KB alignment, Android system libraries).
  That upstream recipe uses NDK 27.3; this authorized build instead pins and
  validates the installed 27.1.12297006, including its compiler/linker and trees.

## Packaging and parent integration

```sh
node scripts/verify-garmin-python-lock.mjs --materialize \
  --artifacts-dir modules/garmin-connect/python/garmin-python-artifacts
node scripts/verify-garmin-android-binaries.mjs --artifacts-dir \
  modules/garmin-connect/python/garmin-python-artifacts "$NDK"
# Parent only, after its fresh APK build and before native readiness/publication:
node scripts/verify-garmin-android-binaries.mjs --apk "$FRESH_APK" "$NDK"
```

The Gradle plugin also rejects non-wheel installs except the reviewed pure-Python
client archive and uses `--only-binary cffi,curl-cffi,chaquopy-libffi`. Materializing
CFFI copies this committed wheel, verifies its digest and manifest, and never
runs a host build backend. The checker validates both APK requirements archives,
the actual ARM64 Python runtime, every packaged requirements `.so`, Android API,
ELF class/machine/alignment, native dependency closure, and the exact binary
hashes for CFFI, curl's wrapper, its hashed C++ library, and libffi. It allows only
the pinned curl wrapper's official `${ORIGIN}/../curl_cffi.libs` loader path;
absolute or unexpected loader paths and glibc SONAMEs fail.

Parent-owned integration must register the four production helper files below,
the lock/notices, this manifest, README, and wheel in source-integrity inputs.
Add the wheel checker to pre-build materialization verification and the fresh
APK post-build gate. Do not substitute an old installed APK diagnostic for that
post-build check. No parent builder, AGENTS, or aggregate coverage registration
was edited by this packaging assignment.

## Complete focused tests and critical coverage scope

```sh
node --test scripts/verify-garmin-python-lock.test.mjs \
  scripts/garmin-android-native.test.mjs scripts/build-android-cffi.test.mjs \
  scripts/verify-garmin-android-binaries.test.mjs
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath \
  plugins/withGarminConnectModule.test.ts --coverage \
  --collectCoverageFrom=plugins/withGarminConnectModule.ts
```

Critical Node helper scope: `scripts/verify-garmin-python-lock.mjs`,
`scripts/garmin-android-native.mjs`, `scripts/build-android-cffi.mjs`, and
`scripts/verify-garmin-android-binaries.mjs`. The test-only
`garmin-android-test-fixtures.mjs` is not a production helper. Register all four
test files together, not name-filtered subsets. The successful pinned CLI
cross-build is also exercised in the focused coverage receipt. Register the
plugin's complete Jest suite with an exact 100% threshold for each of statements,
branches, functions and lines. No integrity guard or threshold is relaxed.

The additional Phase 18 lock-consuming evidence regression batch must use
`node --test --test-concurrency=1`: those existing fixture suites temporarily
share paths under `artifacts/native` in the worktree. A concurrent invocation
collides on fixture identities; serial execution passed all 88 tests. This is
host fixture verification, not actual device/provider execution.
