# SDK instrumentation ownership proposal

Scope: add process ownership and cleanup postconditions around the pinned real
AndroidDriver. Preserve the SDK/YAML/Env/JUnit path, existing lease/source/APK/
nonce checks and existing deadlines. This proposal is not an implementation or
device execution result. The parent authorized this boundary; its implementation
is now `SessionOwnedDriver.kt`, with complete host proof in the SDK suite. The
subsequent device verification remains parent-exclusive.

## Verified teardown behavior

The pinned `maestro-client.jar` AndroidDriver starts a background command:
`am instrument -w ... dev.mobile.maestro.test/androidx.test.runner.AndroidJUnitRunner &`.
With `reinstallDriver=false`, `AndroidDriver.close()` skips both uninstall paths,
closes its InstrumentationSession, closes the WebView hierarchy client, and
finally closes AndroidDeviceConnection.

`DadbInstrumentationSession.close()` only closes AdbShellStream and catches
Throwable. AdbShellStream delegates to AdbStream.close. There is no PID claim,
instrumentation finish RPC or explicit target-process stop in this chain.
AndroidDeviceConnection.close sets its transport state DEAD, requests gRPC
shutdown, waits up to five seconds, merely warns if termination fails, and closes
Dadb while swallowing transport exceptions. A successful close return therefore
does not attest that the device UiAutomation owner was released.

The packaged public manifests identify the instrumentation APK as
`dev.mobile.maestro.test`, with runner `androidx.test.runner.AndroidJUnitRunner`
and targetPackage **`dev.mobile.maestro`**. Its instrumented application process
is the ownership target. Stopping only the `.test` package does not establish
target-process cleanup.

The parent-exclusive natural-entry diagnostic already closed all counters for
the current runner: SafeMaestro 107/107 instructions, 4/4 branches, 2/2 methods,
9/9 lines; SafeFlow 469/469, 12/12, 16/16, 45/45. Preserve that proof. A subsequent
ownership repair requires new affected host/native evidence.

## Proposed source boundary

Add a small `SessionOwnedDriver` implementing `Driver by realAndroidDriver` with
only `open()` and `close()` overridden. Keep process parsing/ownership decisions
in a host-testable helper. The thin adapter in SafeMaestro uses the already
serial-bound AndroidDeviceConnection shell transport. The production caller
continues to invoke it only inside the validated exclusive device lease.

1. Before `real.open()`, read only the SDK target PID, command line and process
   birth tick. An existing target process is an overlap/unknown-ownership failure.
   Do not stop it. Close only this newly opened host transport.
2. With a proven absent baseline, start the real SDK driver. In finally, capture
   a single target PID and `/proc/<pid>/stat` field 22, with exact cmdline
   `dev.mobile.maestro`. Capture partial-open ownership when the SDK creates a
   target and then throws. Keep the baseline and claim immutable.
3. Before stopping, re-read the sole current PID, cmdline and birth tick. Require
   all three to equal the captured claim. PID reuse, multiple target processes,
   unreadable identity or missing ownership must fail cleanup without a stop.
4. Stop the claimed target with `am force-stop dev.mobile.maestro` while the
   selected connection is still live. Verify target absence. Always execute the
   real SDK close in finally to release its shell/gRPC/Dadb resources.
5. Any ownership, stop, absence or SDK-close failure propagates to SafeFlow's
   existing cleanup-failed JUnit path. Natural JVM termination must still finish
   within the unchanged outer process deadline. Do not accept JUnit-only success.

An open/close overlap needs explicit state: if close races an unfinished SDK
open, there is no proven completed claim yet. Reject cleanup success, close the
transport, and preserve a failed attempt for the parent's owned-session recovery.
Do not silently treat a temporarily absent PID as complete cleanup while start
is still pending. This is why a ten-line nominal finally block is insufficient;
the helper needs absent/starting/claimed/closed state and strict failure paths.

The implemented helper uses a typed exception factory with explicit throws.
This keeps every integrity guard executable under normal JaCoCo accounting,
without Kotlin Nothing-return defensive scaffolding. Transport error merging is
extracted into one helper called from finally, preserving combined failures
without unreachable null branches in compiler-duplicated finally bodies.

The complete close operation—including identity reads, owned stop, absence
check and real SDK close—remains inside the existing five-second cleanup future.
No global ADB operations, blanket PID matching or package uninstall is required.
The lease serial and the captured birth identity are both required; exclusive
lease ownership alone does not prove ownership of a preexisting SDK process.

## Parent-only recovery guard

Use this only with the parent's already established historical/current target
PID and birth identity. The parent must validate both values as positive decimal
integers and use its explicitly selected serial and exclusive device window.
Unknown prior state authorizes readback only. This shell body has not been run:

```sh
sdk_current_pids=$(pidof dev.mobile.maestro || :)
[ "$sdk_current_pids" = "$sdk_owned_pid" ] || exit 41
sdk_current_cmdline=$(tr -d '\000' < "/proc/$sdk_owned_pid/cmdline") || exit 42
[ "$sdk_current_cmdline" = dev.mobile.maestro ] || exit 42
sdk_current_stat=$(cat "/proc/$sdk_owned_pid/stat") || exit 43
sdk_current_fields=${sdk_current_stat##*) }
set -- $sdk_current_fields
shift 19 || exit 43
[ "$1" = "$sdk_owned_start_ticks" ] || exit 44
am force-stop dev.mobile.maestro || exit 45
[ -z "$(pidof dev.mobile.maestro || :)" ] || exit 46
```

Dispatch the body through the selected connection or `adb -s <exact-serial>`.
Preserve ownership readback, stop status and target absence as scoped diagnostic
evidence, then run the parent's fixed UI probe under its own exclusive window.
Do not attribute a historical PID to this session merely because its package
matches.

## Affected proof

Require exact 100% statements/instructions, branches, functions/methods and lines
for the new ownership helper and all changed source. Host cases must cover absent
baseline, preexisting overlap, successful claim/stop, partial-open failure with
claim, no target after failed open, unreadable/multiple/changed/reused PID, stop
failure, persistent target, SDK-close failure, and open/close overlap. Use a stateful
host process/shell test double; preserve actual SDK parser/reporting tests.

The parent then repeats only the affected actual SDK pass/fail/missing-device
diagnostics with the fresh exact runner and receipt, verifies bounded natural
termination, owned target absence, and a clean subsequent UI probe. Exercise the
preexisting-owner rejection path using a positively attributed parent-owned
session. Preserve old successful counter closure and failed UiAutomation probes
separately. Native diagnostic evidence remains separate from uninstrumented
acceptance and performance.
