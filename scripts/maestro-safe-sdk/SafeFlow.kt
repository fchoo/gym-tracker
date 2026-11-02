package gymtracker.maestrosafe

import java.net.ServerSocket
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.runBlocking
import maestro.Driver
import maestro.Maestro
import maestro.orchestra.Orchestra
import maestro.orchestra.util.Env
import maestro.orchestra.yaml.YamlCommandReader
import maestro.cli.model.FlowStatus
import maestro.cli.model.TestExecutionSummary
import maestro.cli.report.ReportFormat
import maestro.cli.report.ReporterFactory
import okio.sink
import okio.Sink

data class FlowRequest(val serial: String, val flow: Path, val junit: Path,
    val deadlineMs: Long, val env: Map<String, String>)

fun availableHostPort(socket: ServerSocket = ServerSocket(0)): Int = socket.use { it.localPort }

/** Only actual Orchestra success can produce a successful testcase. */
fun executeFlow(request: FlowRequest, openReport: (Path) -> Sink = { it.toFile().sink() }, connect: (String, Int) -> Driver): Boolean {
    val startedAt = System.currentTimeMillis()
    val startedNanos = System.nanoTime()
    val driver = AtomicReference<Driver>()
    val cancelled = AtomicBoolean(false)
    val executor = Executors.newCachedThreadPool { task -> Thread(task, "safe-maestro-sdk").apply { isDaemon = true } }
    var code = "maestro_ui_flow_failed"
    var passed = false
    var flowDigest = "unreadable"
    try {
        val work = executor.submit<Boolean> {
            flowDigest = MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(request.flow))
                .joinToString("") { "%02x".format(it.toInt() and 0xff) }
            val commands = with(Env) { YamlCommandReader.readCommands(request.flow).withEnv(request.env) }
            val selected = connect(request.serial, availableHostPort())
            val rejected = synchronized(driver) {
                if (cancelled.get()) true else { driver.set(selected); false }
            }
            if (rejected) {
                selected.close()
                throw InterruptedException()
            }
            val maestro = Maestro.android(selected, true)
            runBlocking { Orchestra(maestro = maestro, artifactsDir = null, captureFullArtifacts = false).runFlow(commands) }.success
        }
        try { passed = work.get(request.deadlineMs, TimeUnit.MILLISECONDS) }
        catch (_: Exception) { code = "maestro_sdk_execution_failed"; cancelled.set(true); work.cancel(true) }
    } finally {
        val selected = synchronized(driver) { driver.getAndSet(null) }
        if (selected != null) {
            try { executor.submit { selected.close() }.get(5_000, TimeUnit.MILLISECONDS) }
            catch (_: Exception) { passed = false; code = "maestro_sdk_cleanup_failed" }
        }
        executor.shutdownNow()
    }
    val duration = ((System.nanoTime() - startedNanos) / 1_000_000).milliseconds
    val result = TestExecutionSummary.FlowResult(
        name = request.flow.fileName.toString(), fileName = request.flow.fileName.toString(),
        status = if (passed) FlowStatus.SUCCESS else FlowStatus.ERROR,
        failure = if (passed) null else TestExecutionSummary.Failure(code),
        duration = duration, startTime = startedAt, properties = mapOf("flow_sha256" to flowDigest),
        tags = emptyList(), steps = emptyList(), filePath = request.flow.fileName.toString(), cloudRunId = null, cloudRunUrl = null)
    val suite = TestExecutionSummary.SuiteResult(passed = passed, flows = listOf(result), duration = duration,
        startTime = startedAt, deviceName = "selected-android-device", cloudUploadId = null,
        cloudUploadUrl = null, appBinaryId = null)
    val summary = TestExecutionSummary(passed, listOf(suite), if (passed) 1 else 0, 1)
    openReport(request.junit).use { ReporterFactory.buildReporter(ReportFormat.JUNIT, "v12-recovery-ui").report(summary, it) }
    return passed
}
