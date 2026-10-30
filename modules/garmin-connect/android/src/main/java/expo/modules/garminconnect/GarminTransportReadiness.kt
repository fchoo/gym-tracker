package expo.modules.garminconnect

import org.json.JSONObject
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.modules.Module

private val READINESS_STAGES = setOf("client_import", "cffi_backend", "curl_import", "curl_session", "requests_import",
  "ua_import", "certifi_import", "ssl_context", "client_factory", "session_close")
private val READINESS_CODES = setOf("ImportError", "ModuleNotFoundError", "OSError", "RuntimeError", "TypeError", "ValueError", "AttributeError", "Exception")

internal class GarminTransportReadinessPlatform(private val module: Module) {
  fun run(nonce: String): Map<String, String> {
    val androidContext = module.appContext.reactContext?.applicationContext
      ?: throw IllegalArgumentException("garmin_operation_rejected")
    val uri = module.appContext.currentActivity?.intent?.data?.toString()
    val config = try {
      val reader = java.io.InputStreamReader(androidContext.assets.open("app.config"), Charsets.UTF_8)
      try {
        embeddedGarminDiagnosticConfig(reader.readText())
      } finally {
        reader.close()
      }
    } catch (_: Throwable) {
      throw IllegalArgumentException("garmin_operation_rejected")
    }
    return GarminTransportReadinessRunner {
      synchronized(Python::class.java) {
        if (!Python.isStarted()) Python.start(AndroidPlatform(androidContext))
      }
      val python = Python.getInstance()
      productionGarminPythonContainers(python).resultMap(
        python.getModule("garmin_transport_readiness").callAttr("probe"),
      )
    }.run(androidContext.packageName, uri, config, nonce)
  }
}

/** Parse only the APK-embedded public config, never caller-supplied profile flags. */
internal fun embeddedGarminDiagnosticConfig(source: String): Map<String, Any?> {
  val config = JSONObject(source)
  val android = config.optJSONObject("android")
  val extra = config.optJSONObject("extra")
  return mapOf(
    "scheme" to config.opt("scheme"),
    "android" to mapOf("package" to android?.opt("package")),
    "extra" to mapOf(
      "buildProfile" to extra?.opt("buildProfile"),
      "nativeContractsEnabled" to extra?.opt("nativeContractsEnabled"),
      "nativeContractSuite" to extra?.opt("nativeContractSuite"),
    ),
  )
}

internal class GarminTransportReadinessRunner(private val probe: () -> Any?) {
  fun run(packageName: String?, uri: String?, config: Any?, nonce: String): Map<String, String> {
    val manifest = config as? Map<*, *>
    val android = manifest?.get("android") as? Map<*, *>
    val extra = manifest?.get("extra") as? Map<*, *>
    require(packageName == "com.fchoo.gymtracker.devtest"
      && Regex("^[a-f0-9]{32}$").matches(nonce)
      && uri == "gymtracker-devtest://__garmin-bridge-diagnostic?nonce=$nonce"
      && manifest?.get("scheme") == "gymtracker-devtest"
      && android?.get("package") == packageName
      && extra?.get("buildProfile") == "development-test"
      && extra["nativeContractsEnabled"] == true
      && extra["nativeContractSuite"] == "v1.2-acceptance") { "garmin_operation_rejected" }
    // Guard precedes Python initialization. No worker, token store or session restore.
    return try {
      val value = probe() as? Map<*, *> ?: throw IllegalArgumentException()
      require(value.keys == setOf("status", "stage", "code"))
      val status = value["status"]
      val stage = value["stage"]
      val code = value["code"]
      require((status == "passed" && stage == "complete" && code == "actual_transport_ready")
        || (status == "failed" && stage in READINESS_STAGES && code in READINESS_CODES))
      mapOf("status" to status as String, "stage" to stage as String, "code" to code as String)
    } catch (_: Throwable) {
      mapOf("status" to "failed", "stage" to "native", "code" to "native_bridge_rejected")
    }
  }

}
