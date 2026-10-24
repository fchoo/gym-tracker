# Safe Maestro SDK runner

Recovery uses the unchanged official Maestro 2.8 YAML parser, Env extension,
Orchestra, Android driver and JUnit reporter. `SafeFlow.kt` always constructs
Orchestra with `artifactsDir = null` and `captureFullArtifacts = false`. This
bypasses the SDK artifact listener that otherwise clears the shared log buffer.
The runner does not invoke the Maestro CLI test command or TestSuiteInteractor.

The production domain action prepares the source-owned runner once, retains its
tool receipt, and verifies the compiled JAR, live source, compiler, all 194 SDK
JARs, and JDK files before every flow. Source bytes are captured into immutable
build inputs before compilation. Compilation uses cached Kotlin 2.2 and the
pinned Temurin 17.0.20+8 JDK offline. No package installation or global patch is
required. Fixed local paths and SHA-256 values are in `toolchain-pins.json`.
This pin set describes the inspected macOS toolchain; another host requires an
independently verified toolchain pin set.

The Node request contract requires an explicit device serial, absolute unchanged
flow and fresh JUnit paths, a deadline from 1 to 180,000 ms, and explicit string
environment values. Production Recovery allocates 174,000 ms for flow execution,
5,000 ms for driver cleanup and 1,000 ms for reporting/process exit. Its existing
outer deadline, exclusive lease, source/APK identity, flow, nonce and marker
validators remain authoritative. Only actual `Orchestra.runFlow().success` can
produce a successful testcase. Parse, connection, execution, timeout and cleanup
failures produce bounded official failing JUnit and a nonzero exit. Unwritable
report destinations fail the process; they cannot produce success. Raw SDK
stdout/stderr and hierarchy content are never retained by this path.
After successful SDK execution and cleanup, main returns normally. Failed SDK
execution or cleanup throws only the fixed `maestro_sdk_flow_failed` exception
after writing official failing JUnit. This preserves the nonzero failure contract
without Kotlin `exitProcess` termination scaffolding. The existing process deadline
still bounds JVM termination; lingering non-daemon driver threads are a diagnostic
failure, not grounds to extend the budget or accept a JUnit-only success.

Every compilation gets a fresh private build directory. It retains source
snapshots, input identity, compiler diagnostics, and the completed source/JAR/
compiler/JDK/SDK receipt. Failed compilations remain separate and retain their
inputs and diagnostics. Recovery's temporary raw JUnit is consumed and removed
by its existing quarantine boundary. Its privacy-safe tool receipt is retained
with the native run.

## Host verification

Use the repository's required Node 24.19.0 runtime:

```sh
node --test scripts/v12-maestro-safe-sdk.test.mjs scripts/run-coverage-gate.test.mjs
node --test --test-concurrency=1 scripts/v12-production-native-domain-actions.test.mjs
node --input-type=module - <<'JS'
import { runPhase20SubprocessCoverage } from './scripts/phase20-subprocess-coverage.mjs';
await runPhase20SubprocessCoverage({
  projectRoot: process.cwd(),
  outputDirectory: process.cwd() + '/coverage/maestro-safe-sdk',
  maxParallel: 1,
  projects: [{ name: 'maestro-safe-sdk', concurrency: 1,
    modules: ['scripts/v12-maestro-safe-sdk.mjs'],
    tests: ['scripts/v12-maestro-safe-sdk.test.mjs'] }],
});
JS
```

The focused registry requires exact 100% statements, branches, functions and
lines for the Node wrapper. The same complete suite compiles `SafeFlowTest.kt`
against the real pinned SDK and runs JaCoCo 0.8.13. Its Driver test double rejects
artifact capture. Real YAML/Env/Orchestra/JUnit execution covers successful and
failing commands, nested flows, malformed/missing YAML, failed connection/open,
failed/slow cleanup, execution timeout, delayed connection after cancellation,
throwing host-port reads and official reporter write failures. JaCoCo's normal
Kotlin mapping is used; no generated instructions or branches are excluded.
The suite requires zero missed INSTRUCTION, BRANCH, METHOD and LINE counters for
`SafeFlow.kt`, including `FlowRequest` and coroutine classes. It prints the full
source report path.

`SafeMaestro.kt` remains in that report. Host tests do not execute its real
AndroidDeviceConnection/AndroidDriver binding. Its normal pass/fail termination
and null/non-null connection paths require parent-exclusive native diagnostic
coverage of every INSTRUCTION, BRANCH, METHOD and LINE counter.
This is an explicit remaining target, not host closure of the complete runner.
The production domain integration remains covered by the complete controlled
domain suite; its fixture explicitly rejects unsafe Recovery CLI invocations.

The previous retained runner's native pass/fail/missing-device diagnostic covered
all four branches, both methods and all eight source lines, but left six of 110
instructions missed at `exitProcess`. Exact bytecode offsets 243–255 comprise
the `System.exit` invocation followed by five compiler-generated defensive-throw
instructions. Normal JVM termination cannot execute the post-call coverage probe
or that defensive throw. No environment length, value or device path can close
this gap. Main now uses natural success return and a fixed failure exception;
the repair changes termination only and preserves actual SDK/JUnit/cleanup.
Keep the old diagnostic as failed exact-instruction coverage evidence and use a
fresh source/JAR receipt and execution merge for the repaired entrypoint.

## Parent-exclusive native coverage diagnostic

This procedure is diagnostic evidence, separate from acceptance and performance.
Only the orchestrator may execute it after coordinating the exclusive device
window and the normal source/APK/flow/nonce guards. Do not inspect credentials or
private provider state, clear buffers, or change global ADB state. Use a fresh
private diagnostic directory and preserve every failed attempt.

1. Run the complete host suite on the final source and retain the printed host
   build directory. It contains `runner.jar`, `tool-receipt.json`,
   `host-coverage.exec`, `jacocoagent.jar` and the compiled `CoverageReport` class.
   The suite validates cached JaCoCo/ASM JARs, extracted agent runtime and javac
   bytes against the additional coverage pins in `toolchain-pins.json`. Bind those
   pins and `CoverageReport.java` SHA-256 to the diagnostic record before execution.
2. Copy the host execution data to a fresh diagnostic `merged.exec`. Preserve the
   original. Bind the diagnostic to the exact retained runner JAR and tool receipt.
3. Reconstruct the binding using the verified fixed toolchain, then invoke the
   following Java command from the orchestrator. This snippet only builds arguments;
   it does not execute them or select a device:

```js
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { inspectSafeSdkToolchain, resolveSafeSdkToolchain,
  safeSdkArguments, verifySafeSdkBinding } from './scripts/v12-maestro-safe-sdk.mjs';
const tools = resolveSafeSdkToolchain();
const inspected = inspectSafeSdkToolchain(tools);
const receiptPath = path.join(hostBuildDirectory, 'tool-receipt.json');
const binding = { java: inspected.java, classpath: inspected.classpath,
  compiler: inspected.compiler, jdk: tools.jdk, lib: tools.lib,
  source: path.resolve('scripts/maestro-safe-sdk'),
  jar: path.join(hostBuildDirectory, 'runner.jar'), receiptPath,
  receipt: JSON.parse(readFileSync(receiptPath, 'utf8')) };
verifySafeSdkBinding(binding);
const args = [
  `-javaagent:${hostBuildDirectory}/jacocoagent.jar=destfile=${diagnosticDirectory}/merged.exec,append=true,includes=gymtracker.maestrosafe.*`,
  ...safeSdkArguments(binding, {
    serial: selectedSerial, flow: unchangedSourceFlow, junit: freshPrivateJUnit,
    deadlineMs: 174_000, env: explicitNonceBoundEnvironment,
  }),
];
// Parent: execute binding.java with args, timeout <= 180000, captured output;
// publish only sanitized diagnostic status and the official JUnit outcome.
```

4. Cover both a real passing unchanged flow and a real failing flow. A controlled
   nonexistent-device attempt using a configuration-only flow exercises the null
   connection/failing-exit path without target-app UI commands. Supply explicit
   environment values, including an `=` inside a value, to cover main argument
   decoding. Keep attempts and JUnit distinct while appending execution data only
   in the fresh diagnostic merge file.
5. Use the cached `org.jacoco.core` and `org.jacoco.report` 0.8.13 plus ASM 9.8
   JARs already used by the host test. Run the compiled reporter with:

```text
java -cp <host-build>:<cached-jacoco-and-asm-classpath>
  gymtracker.maestrosafe.CoverageReport
  <diagnostic>/merged.exec <host-build>/runner.jar
  scripts/maestro-safe-sdk <diagnostic>/merged-jacoco.xml
```

Inspect **every** class and both source files in the normal JaCoCo XML. Require
zero missed INSTRUCTION, BRANCH, METHOD and LINE counters for the complete runner.
If an SDK/provider/UI error prevents actual success, preserve the failure and
leave the missing native counters open. Do not reinterpret a host test double,
skipped case, or failing diagnostic as native success. A subsequent uninstrumented
fresh final-source build and exclusive-device acceptance run are still required.
