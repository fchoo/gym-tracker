package gymtracker.maestrosafe

import java.lang.reflect.Proxy
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import maestro.DeviceInfo
import maestro.Driver
import maestro.TreeNode
import maestro.device.Platform
import java.net.ServerSocket
import java.io.IOException
import okio.Buffer
import okio.Sink
import okio.Timeout

fun main(args: Array<String>) {
    val root = Path.of(args[0])
    var cases = 0
    fun fixture(yaml: String = "- assertTrue: \${VALUE == 'literal'}", openFailure: Boolean = false,
        closeFailure: Boolean = false, openDelay: Long = 0, closeDelay: Long = 0,
        connectionFailure: Boolean = false, connectionDelay: Long = 0, timeout: Long = 10_000,
        missing: Boolean = false, invalid: Boolean = false): Pair<Boolean, String> {
        val flow = root.resolve("case-${cases++}.yaml")
        val junit = root.resolve("case-${cases}.xml")
        if (!missing) Files.writeString(flow, if (invalid) "invalid: [" else "appId: com.example.safe\n---\n$yaml\n")
        val closes = AtomicInteger()
        val closed = CountDownLatch(1)
        val driver = Proxy.newProxyInstance(Driver::class.java.classLoader, arrayOf(Driver::class.java)) { _, method, _ ->
            when (method.name) {
                "name" -> "host-contract"
                "deviceInfo" -> DeviceInfo(Platform.ANDROID, 100, 200, 100, 200)
                "capabilities" -> emptyList<Any>()
                "contentDescriptor", "waitForAppToSettle-5RpGHs4" -> TreeNode()
                "open" -> { if (openFailure) error("private error must not escape"); Thread.sleep(openDelay); null }
                "close" -> { closes.incrementAndGet(); closed.countDown(); Thread.sleep(closeDelay); if (closeFailure) error("private cleanup"); null }
                "startDeviceLogCapture", "startScreenRecording", "takeScreenshot", "stopAndCollectDeviceLogs" -> error("artifact capture forbidden")
                "isShutdown", "isKeyboardVisible", "isAirplaneModeEnabled" -> false
                "waitUntilScreenIsStatic" -> true
                "setAndroidChromeDevToolsEnabled" -> null
                else -> error("unexpected driver method: ${method.name}")
            }
        } as Driver
        val passed = executeFlow(FlowRequest("host-selected-serial", flow, junit, timeout, mapOf("VALUE" to "literal"))) { serial, port ->
            check(serial == "host-selected-serial" && port in 1..65535)
            if (connectionFailure) error("private connection")
            if (connectionDelay > 0) {
                val until = System.nanoTime() + connectionDelay * 1_000_000
                while (System.nanoTime() < until) { try { Thread.sleep(10) } catch (_: InterruptedException) { /* deliberately noncooperative factory */ } }
            }
            driver
        }
        if (!missing && !invalid && !connectionFailure) {
            check(closed.await(10, java.util.concurrent.TimeUnit.SECONDS))
            check(closes.get() == 1)
        } else check(closes.get() == 0)
        val xml = Files.readString(junit)
        check("<testcase" in xml && "private error" !in xml && "private cleanup" !in xml && "private connection" !in xml)
        check(("<failure" !in xml) == passed)
        return passed to xml
    }
    check(availableHostPort() in 1..65535)
    val badSocket = object : ServerSocket() { override fun getLocalPort(): Int = throw IOException("host port unavailable") }
    try { availableHostPort(badSocket); error("expected failed port read") } catch (_: IOException) { check(badSocket.isClosed) }
    check(fixture().first)
    check(!fixture(yaml = "- assertTrue: \${false}").first)
    check(!fixture(openFailure = true).first)
    check(!fixture(closeFailure = true).first)
    check(!fixture(connectionFailure = true).first)
    check(!fixture(missing = true).first)
    check(!fixture(invalid = true).first)
    check(!fixture(openDelay = 500, timeout = 100).first)
    check(!fixture(closeDelay = 10_000).first)
    check(!fixture(connectionDelay = 2000, timeout = 1000).first)
    // Actual nested runFlow parsing and explicit Env propagation use unchanged SDK code.
    Files.writeString(root.resolve("nested.yaml"), "appId: com.example.safe\n---\n- assertTrue: \${VALUE == 'literal'}\n")
    check(fixture(yaml = "- runFlow: nested.yaml").first)
    val reportingFlow = root.resolve("nested.yaml")
    var sinkClosed = false
    val brokenSink = object : Sink {
        override fun write(source: Buffer, byteCount: Long) { throw IOException("write failed") }
        override fun flush() {}
        override fun timeout(): Timeout = Timeout.NONE
        override fun close() { sinkClosed = true }
    }
    try {
        executeFlow(FlowRequest("selected", reportingFlow, root.resolve("write-failed.xml"), 1000, emptyMap()), openReport = { brokenSink }) { _, _ -> error("driver unavailable") }
        error("expected failed report write")
    } catch (_: IOException) { check(sinkClosed) }
    println("safe_sdk_host_cases=$cases")
}
