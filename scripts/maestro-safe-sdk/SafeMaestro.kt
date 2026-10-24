package gymtracker.maestrosafe

import java.nio.file.Path
import maestro.android.AndroidDeviceConnection
import maestro.drivers.AndroidDriver

/** Invoked only by the validated source-owned Node contract. */
fun main(args: Array<String>) {
    val env = args.drop(4).associate { value ->
        val index = value.indexOf('=')
        value.substring(0, index) to value.substring(index + 1)
    }
    val request = FlowRequest(args[0], Path.of(args[1]), Path.of(args[2]), args[3].toLong(), env)
    val passed = executeFlow(request) { serial, port ->
        val connection = requireNotNull(AndroidDeviceConnection.byId(serial, "localhost", port))
        AndroidDriver(connection, serial, false)
    }
    if (!passed) throw IllegalStateException("maestro_sdk_flow_failed")
}
