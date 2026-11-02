package gymtracker.maestrosafe

import java.lang.reflect.Proxy
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import maestro.DeviceInfo
import maestro.Driver
import maestro.TreeNode
import maestro.device.Platform

private val OWNED = SdkOwner(123, 456, "dev.mobile.maestro")
private fun stat(owner: SdkOwner) = "${owner.pid} (dev.mobile maestro) S ${List(18) { "0" }.joinToString(" ")} ${owner.startTicks}"
private fun expectFailure(block: () -> Unit): Throwable {
    try { block() } catch (error: Throwable) { return error }
    error("expected failure")
}

private class HostSession {
    val current = AtomicReference<SdkOwner?>()
    var openCreatesTarget = true
    var openFails = false
    var closeFails = false
    var queryFails = false
    var stopCode = 0
    var persistent = false
    var opens = 0
    var closes = 0
    var stops = 0
    var openGate: CountDownLatch? = null
    var openEntered = CountDownLatch(1)
    var queryGate: CountDownLatch? = null
    var queryEntered = CountDownLatch(1)
    val real = Proxy.newProxyInstance(Driver::class.java.classLoader, arrayOf(Driver::class.java)) { _, method, _ ->
        when (method.name) {
            "open" -> { opens++; if (openCreatesTarget) current.set(OWNED); openEntered.countDown(); openGate?.await(); if (openFails) error("sdk open failed"); null }
            "close" -> { closes++; if (closeFails) error("sdk close failed"); null }
            "name" -> "owned-host-contract"
            "deviceInfo" -> DeviceInfo(Platform.ANDROID, 100, 200, 100, 200)
            "capabilities" -> emptyList<Any>()
            "contentDescriptor", "waitForAppToSettle-5RpGHs4" -> TreeNode()
            "setAndroidChromeDevToolsEnabled" -> null
            "isShutdown", "isKeyboardVisible", "isAirplaneModeEnabled" -> false
            "waitUntilScreenIsStatic" -> true
            else -> error("unexpected driver method ${method.name}")
        }
    } as Driver
    val shell: (String) -> ShellResult = { command ->
        queryEntered.countDown(); queryGate?.await()
        if (queryFails) error("transport query failed")
        val owner = current.get()
        when {
            command == "pidof dev.mobile.maestro" -> if (owner == null) ShellResult(1, "") else ShellResult(0, owner.pid.toString())
            command.startsWith("cat /proc/") -> if (owner == null) ShellResult(1, "") else ShellResult(0, stat(owner))
            command.startsWith("tr -d") -> if (owner == null) ShellResult(1, "") else ShellResult(0, owner.cmdline)
            command.contains("am force-stop dev.mobile.maestro") -> { stops++; if (stopCode == 0 && !persistent) current.set(null); ShellResult(stopCode, "") }
            else -> error("unexpected SDK command")
        }
    }
    val driver = SessionOwnedDriver(real, shell)
}

fun main(args: Array<String>) {
    val root = Path.of(args[0])
    fun parsed(pid: ShellResult = ShellResult(0, "123"), status: ShellResult = ShellResult(0, stat(OWNED)),
        cmd: ShellResult = ShellResult(0, OWNED.cmdline)): SdkOwner? = readSdkOwner { command ->
        when { command.startsWith("pidof") -> pid; command.startsWith("cat") -> status; else -> cmd }
    }
    check(parsed() == OWNED)
    check(parsed(pid = ShellResult(1, "")) == null)
    for (pid in listOf(ShellResult(2, ""), ShellResult(1, "123"), ShellResult(0, ""), ShellResult(0, "0"), ShellResult(0, "123 124"))) expectFailure { parsed(pid = pid) }
    for (status in listOf(ShellResult(1, ""), ShellResult(0, "123 invalid"), ShellResult(0, "124 (wrong) S 0"), ShellResult(0, "123 (short) S 0"), ShellResult(0, stat(OWNED).replace("456", "bad")))) expectFailure { parsed(status = status) }
    for (cmd in listOf(ShellResult(1, ""), ShellResult(0, "other.package"))) expectFailure { parsed(cmd = cmd) }
    // Owner equality is the identity contract: PID, birth and command line all matter.
    check(OWNED == OWNED && OWNED != OWNED.copy(pid = 124) && OWNED != OWNED.copy(startTicks = 457) && OWNED != OWNED.copy(cmdline = "other.package"))

    val clean = HostSession(); clean.driver.open(); clean.driver.close(); clean.driver.close()
    check(clean.current.get() == null && clean.stops == 1 && clean.closes == 1)
    val preexisting = HostSession(); preexisting.current.set(OWNED); expectFailure { preexisting.driver.open() }; preexisting.driver.close()
    check(preexisting.opens == 0 && preexisting.stops == 0 && preexisting.current.get() == OWNED)
    val neverOpened = HostSession(); neverOpened.driver.close(); expectFailure { neverOpened.driver.open() }; check(neverOpened.opens == 0)
    val unopenedCloseFailure = HostSession(); unopenedCloseFailure.closeFails = true
    expectFailure { unopenedCloseFailure.driver.close() }; check(unopenedCloseFailure.stops == 0 && unopenedCloseFailure.closes == 1)
    val partial = HostSession(); partial.openFails = true; expectFailure { partial.driver.open() }; partial.driver.close(); check(partial.stops == 1)
    val noTarget = HostSession(); noTarget.openCreatesTarget = false; noTarget.openFails = true; expectFailure { noTarget.driver.open() }; noTarget.driver.close(); check(noTarget.stops == 0)
    val vanished = HostSession(); vanished.driver.open(); vanished.current.set(null); vanished.driver.close(); check(vanished.stops == 0)
    val unclaimed = HostSession(); unclaimed.openCreatesTarget = false; unclaimed.openFails = true; expectFailure { unclaimed.driver.open() }; unclaimed.current.set(OWNED)
    expectFailure { unclaimed.driver.close() }; check(unclaimed.stops == 0 && unclaimed.closes == 1)
    for (changed in listOf(OWNED.copy(pid = 124), OWNED.copy(startTicks = 457))) {
        val f = HostSession(); f.driver.open(); f.current.set(changed); expectFailure { f.driver.close() }; check(f.stops == 0 && f.closes == 1)
    }
    val stopFailure = HostSession(); stopFailure.driver.open(); stopFailure.stopCode = 41
    val firstFailure = expectFailure { stopFailure.driver.close() }; check(expectFailure { stopFailure.driver.close() } === firstFailure); check(stopFailure.closes == 1)
    val persistent = HostSession(); persistent.driver.open(); persistent.persistent = true; expectFailure { persistent.driver.close() }; check(persistent.closes == 1)
    val closeFailure = HostSession(); closeFailure.driver.open(); closeFailure.closeFails = true; expectFailure { closeFailure.driver.close() }; check(closeFailure.current.get() == null)
    val combined = HostSession(); combined.driver.open(); combined.stopCode = 45; combined.closeFails = true
    check(expectFailure { combined.driver.close() }.suppressed.size == 1)
    val readFailure = HostSession(); readFailure.driver.open(); readFailure.queryFails = true; expectFailure { readFailure.driver.close() }; check(readFailure.closes == 1)
    val openReadFailure = HostSession(); openReadFailure.openFails = true
    val shellAfterFailure: (String) -> ShellResult = { command -> if (openReadFailure.opens > 0) error("claim read failed") else openReadFailure.shell(command) }
    val brokenClaim = SessionOwnedDriver(openReadFailure.real, shellAfterFailure)
    check(expectFailure { brokenClaim.open() }.suppressed.size == 1)
    expectFailure { brokenClaim.close() }; check(openReadFailure.closes == 1)
    val onlyReadFailure = HostSession()
    val failsAfterOpen = SessionOwnedDriver(onlyReadFailure.real) { command -> if (onlyReadFailure.opens > 0) error("claim failed") else onlyReadFailure.shell(command) }
    expectFailure { failsAfterOpen.open() }; expectFailure { failsAfterOpen.close() }

    // Close racing an incomplete open cannot claim cleanup success or stop unknown ownership.
    val racing = HostSession(); racing.openGate = CountDownLatch(1)
    val raceError = AtomicReference<Throwable?>()
    val thread = Thread { try { racing.driver.open() } catch (error: Throwable) { raceError.set(error) } }
    thread.start(); check(racing.openEntered.await(1, TimeUnit.SECONDS)); expectFailure { racing.driver.close() }
    check(racing.stops == 0 && racing.closes == 1); racing.openGate!!.countDown(); thread.join(1000); check(!thread.isAlive)
    val beforeStart = HostSession(); beforeStart.queryGate = CountDownLatch(1)
    val startThread = Thread { expectFailure { beforeStart.driver.open() } }; startThread.start()
    check(beforeStart.queryEntered.await(1, TimeUnit.SECONDS)); beforeStart.driver.close(); beforeStart.queryGate!!.countDown(); startThread.join(1000)
    check(!startThread.isAlive && beforeStart.opens == 0 && beforeStart.stops == 0)

    // Execute the unchanged remote guard in a real host shell against synthetic proc files.
    val shellRoot = Files.createDirectories(root.resolve("guard fixtures' quoted"))
    val bin = Files.createDirectories(shellRoot.resolve("bin"))
    val proc = Files.createDirectories(shellRoot.resolve("proc/123"))
    val pidFile = shellRoot.resolve("pids"); val amStatus = shellRoot.resolve("am-status"); val stopped = shellRoot.resolve("stopped")
    Files.writeString(bin.resolve("pidof"), "#!/bin/sh\ncat \"\$SDK_GUARD_FIXTURE/pids\"\n[ -s \"\$SDK_GUARD_FIXTURE/pids\" ]\n")
    Files.writeString(bin.resolve("am"), "#!/bin/sh\n[ \"\$1 \$2\" = 'force-stop dev.mobile.maestro' ] || exit 91\ncode=\$(cat \"\$SDK_GUARD_FIXTURE/am-status\")\n[ \"\$code\" = 0 ] || exit \"\$code\"\nprintf stopped > \"\$SDK_GUARD_FIXTURE/stopped\"\n")
    bin.resolve("pidof").toFile().setExecutable(true); bin.resolve("am").toFile().setExecutable(true)
    fun guard(pid: String = "123", cmd: String? = OWNED.cmdline, contents: String? = stat(OWNED), am: String = "0", expected: Int) {
        Files.writeString(pidFile, pid); Files.writeString(amStatus, am); Files.deleteIfExists(stopped)
        if (cmd == null) Files.deleteIfExists(proc.resolve("cmdline")) else Files.write(proc.resolve("cmdline"), (cmd + '\u0000').toByteArray())
        if (contents == null) Files.deleteIfExists(proc.resolve("stat")) else Files.writeString(proc.resolve("stat"), contents)
        val process = ProcessBuilder("/bin/sh", "-c", guardedSdkStopCommand(OWNED, proc.parent.toString()))
        process.environment()["PATH"] = "$bin:/usr/bin:/bin"; process.environment()["SDK_GUARD_FIXTURE"] = shellRoot.toString()
        process.redirectOutput(ProcessBuilder.Redirect.DISCARD); process.redirectError(ProcessBuilder.Redirect.DISCARD)
        val child = process.start(); check(child.waitFor(2, TimeUnit.SECONDS)); check(child.exitValue() == expected)
        check(Files.exists(stopped) == (expected == 0))
    }
    guard(expected = 0); guard(pid = "124", expected = 41); guard(pid = "", expected = 41)
    guard(cmd = null, expected = 42); guard(cmd = "other.package", expected = 42)
    guard(contents = null, expected = 43); guard(contents = "123 (short) S", expected = 43)
    guard(contents = stat(OWNED.copy(startTicks = 457)), expected = 44); guard(am = "1", expected = 45)

    // Real official Orchestra and JUnit still decide success/failure with the owned wrapper.
    for ((assertion, remains) in listOf("true" to false, "false" to false, "true" to true)) {
        val session = HostSession(); session.persistent = remains
        val flow = root.resolve("owned-$assertion-$remains.yaml"); val junit = root.resolve("owned-$assertion-$remains.xml")
        Files.writeString(flow, "appId: com.example.safe\n---\n- assertTrue: \${$assertion}\n")
        val passed = executeFlow(FlowRequest("host-selected", flow, junit, 10_000, emptyMap())) { _, _ -> session.driver }
        check(passed == (assertion == "true" && !remains)); check((session.current.get() != null) == remains && session.closes == 1 && session.stops == 1)
        check(("<failure" !in Files.readString(junit)) == passed)
        if (remains) check("maestro_sdk_cleanup_failed" in Files.readString(junit))
    }
    println("safe_sdk_owned_driver_cases=complete")
}
