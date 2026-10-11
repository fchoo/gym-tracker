package expo.modules.garminconnect

import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine

private const val RUNTIME_INFO_OPERATION = "runtimeInfo"

private data class GarminRuntimeInfo(
  val schemaVersion: Int,
  val pythonVersion: String,
  val clientVersion: String,
  val clientCommit: String,
  val abi: String,
  val capabilities: List<String>,
) {
  fun toDto(): Map<String, Any> = mapOf(
    "schemaVersion" to schemaVersion,
    "pythonVersion" to pythonVersion,
    "clientVersion" to clientVersion,
    "clientCommit" to clientCommit,
    "abi" to abi,
    "capabilities" to capabilities,
  )

  companion object {
    fun fromPython(value: Any?): GarminRuntimeInfo {
      val dto = value as? Map<*, *> ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      val schemaVersion = dto["schemaVersion"] as? Int ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      val pythonVersion = dto["pythonVersion"] as? String ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      val clientVersion = dto["clientVersion"] as? String ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      val clientCommit = dto["clientCommit"] as? String ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      val abi = dto["abi"] as? String ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      val capabilities = (dto["capabilities"] as? List<*>)?.map { item ->
        item as? String ?: throw IllegalStateException("garmin_runtime_schema_invalid")
      } ?: throw IllegalStateException("garmin_runtime_schema_invalid")

      if (
        schemaVersion != 1
        || pythonVersion != "3.13"
        || clientVersion != "0.3.17"
        || clientCommit != "218e72ca5459e014435fc2d94fd18bd601fa0c14"
        || abi != "arm64-v8a"
        || capabilities != listOf(RUNTIME_INFO_OPERATION)
      ) {
        throw IllegalStateException("garmin_runtime_schema_invalid")
      }

      return GarminRuntimeInfo(
        schemaVersion = schemaVersion,
        pythonVersion = pythonVersion,
        clientVersion = clientVersion,
        clientCommit = clientCommit,
        abi = abi,
        capabilities = capabilities,
      )
    }
  }
}

class GarminConnectModule : Module() {
  override fun definition(): ModuleDefinition = ModuleDefinition {
    Name("GarminConnect")

    (AsyncFunction(RUNTIME_INFO_OPERATION) Coroutine {
      runtimeInfo()
    }).runOnQueue(appContext.backgroundCoroutineScope)
  }

  private fun runtimeInfo(): Map<String, Any> {
    val context = appContext.reactContext ?: throw IllegalStateException("garmin_runtime_unavailable")
    synchronized(Python::class.java) {
      if (!Python.isStarted()) {
        Python.start(AndroidPlatform(context.applicationContext))
      }
    }

    val result = Python.getInstance()
      .getModule("garmin_bridge")
      .callAttr("dispatch", RUNTIME_INFO_OPERATION, emptyMap<String, Any>())
      .toJava(Map::class.java)

    return GarminRuntimeInfo.fromPython(result).toDto()
  }
}
