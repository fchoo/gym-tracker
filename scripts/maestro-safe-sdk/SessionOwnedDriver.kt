package gymtracker.maestrosafe

import maestro.Driver

data class ShellResult(val exitCode: Int, val output: String)
data class SdkOwner(val pid: Long, val startTicks: Long, val cmdline: String)

private const val TARGET = "dev.mobile.maestro"
private fun ownershipFailure() = IllegalStateException("maestro_sdk_ownership_failed")

/** Reads only the SDK target process. An unreadable identity is never absence. */
fun readSdkOwner(shell: (String) -> ShellResult): SdkOwner? {
    val pids = shell("pidof $TARGET")
    val pidText = pids.output.trim()
    if (pids.exitCode == 1 && pidText.isEmpty()) return null
    if (pids.exitCode != 0 || !Regex("[1-9][0-9]{0,17}").matches(pidText)) throw ownershipFailure()
    val pid = pidText.toLong()
    val stat = shell("cat /proc/$pid/stat")
    if (stat.exitCode != 0) throw ownershipFailure()
    val end = stat.output.lastIndexOf(')')
    if (end < 0 || stat.output.substringBefore(' ') != pidText) throw ownershipFailure()
    val fields = stat.output.substring(end + 1).trim().split(Regex("\\s+"))
    if (fields.size < 20 || !Regex("[1-9][0-9]{0,17}").matches(fields[19])) throw ownershipFailure()
    val cmdline = shell("tr -d '\\000' < /proc/$pid/cmdline")
    if (cmdline.exitCode != 0 || cmdline.output.trim() != TARGET) throw ownershipFailure()
    return SdkOwner(pid, fields[19].toLong(), TARGET)
}

/** The remote guard rechecks PID, birth and cmdline before a package-scoped stop. */
private fun shellQuote(value: String): String = "'" + value.replace("'", "'\\''") + "'"
fun guardedSdkStopCommand(owner: SdkOwner, procRoot: String = "/proc"): String = """
sdk_current_pids=${'$'}(pidof $TARGET)
sdk_pid_status=${'$'}?
[ "${'$'}sdk_pid_status" -eq 0 ] && [ "${'$'}sdk_current_pids" = "${owner.pid}" ] || exit 41
sdk_current_cmdline=${'$'}(tr -d '\000' < ${shellQuote("$procRoot/${owner.pid}/cmdline")}) || exit 42
[ "${'$'}sdk_current_cmdline" = "$TARGET" ] || exit 42
sdk_current_stat=${'$'}(cat ${shellQuote("$procRoot/${owner.pid}/stat")}) || exit 43
sdk_current_fields=${'$'}{sdk_current_stat##*) }
set -- ${'$'}sdk_current_fields
shift 19 || exit 43
[ "${'$'}1" = "${owner.startTicks}" ] || exit 44
am force-stop $TARGET || exit 45
""".trimIndent()

/** Delegates genuine SDK behavior; owns only a target absent before its own open. */
class SessionOwnedDriver(private val real: Driver, private val shell: (String) -> ShellResult) : Driver by real {
    private val state = Any()
    private var started = false
    private var openFinished = false
    private var ownershipRead = false
    private var owner: SdkOwner? = null
    private var closed = false
    private var closeFailure: Throwable? = null

    private fun closeTransport(previous: Throwable?): Throwable? {
        var failure = previous
        try { real.close() }
        catch (error: Throwable) {
            val existing = failure
            if (existing == null) failure = error else existing.addSuppressed(error)
        }
        return failure
    }

    override fun open() {
        synchronized(state) { if (closed) throw ownershipFailure() }
        if (readSdkOwner(shell) != null) throw ownershipFailure()
        synchronized(state) { if (closed) throw ownershipFailure(); started = true }
        var failure: Throwable? = null
        try { real.open() } catch (error: Throwable) { failure = error }
        try {
            try {
                val claim = readSdkOwner(shell)
                synchronized(state) { owner = claim; ownershipRead = true }
            } finally { synchronized(state) { openFinished = true } }
        } catch (error: Throwable) {
            val existing = failure
            if (existing == null) failure = error else existing.addSuppressed(error)
        }
        val result = failure
        if (result != null) throw result
    }

    @Synchronized override fun close() {
        synchronized(state) {
            if (closed) { val previous = closeFailure; if (previous != null) throw previous; return }
            closed = true
        }
        var failure: Throwable? = null
        try {
            val snapshot = synchronized(state) { Triple(started, openFinished && ownershipRead, owner) }
            if (snapshot.first) {
                if (!snapshot.second) throw ownershipFailure()
                val current = readSdkOwner(shell)
                if (current != null) {
                    if (snapshot.third == null || current != snapshot.third) throw ownershipFailure()
                    if (shell(guardedSdkStopCommand(current)).exitCode != 0) throw ownershipFailure()
                    if (readSdkOwner(shell) != null) throw ownershipFailure()
                }
            }
        } catch (error: Throwable) { failure = error }
        finally { failure = closeTransport(failure) }
        synchronized(state) { closeFailure = failure }
        val result = failure
        if (result != null) throw result
    }
}
