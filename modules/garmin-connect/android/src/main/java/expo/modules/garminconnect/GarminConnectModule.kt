package expo.modules.garminconnect

import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private const val RUNTIME_INFO_OPERATION = "runtimeInfo"

private data class GarminLoginInput(
  @Field val email: String = "",
  @Field val password: String = ""
) : Record

private data class GarminMfaInput(
  @Field val challengeHandle: String = "",
  @Field val code: String = ""
) : Record

private data class GarminActivitiesInput(
  @Field val start: Int = 0,
  @Field val limit: Int = 0,
  @Field val activityType: String = ""
) : Record

private data class GarminActivityInput(
  @Field val externalActivityId: String = ""
) : Record

private data class GarminActivityDetailsInput(
  @Field val externalActivityId: String = "",
  @Field val maxchart: Int = 0,
  @Field val maxpoly: Int = 0
) : Record

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
  private var clientWorker: GarminClientWorker? = null

  override fun definition() = ModuleDefinition {
    Name("GarminConnect")

    AsyncFunction(RUNTIME_INFO_OPERATION)
      .SuspendBody<Map<String, Any>> { runtimeInfo() }
      .runOnQueue(appContext.backgroundCoroutineScope)

    AsyncFunction("connectionState")
      .SuspendBody<Map<String, Any?>> { worker().connectionState() }
      .runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("login") Coroutine { input: GarminLoginInput ->
      worker().login(input.email, input.password)
    }).runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("resumeMfa") Coroutine { input: GarminMfaInput ->
      worker().resumeMfa(input.challengeHandle, input.code)
    }).runOnQueue(appContext.backgroundCoroutineScope)

    AsyncFunction("restoreSession")
      .SuspendBody<Map<String, Any?>> { worker().restoreSession() }
      .runOnQueue(appContext.backgroundCoroutineScope)

    AsyncFunction("logout")
      .SuspendBody<Map<String, Any?>> { worker().logout() }
      .runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("getActivities") Coroutine { input: GarminActivitiesInput ->
      require(input.activityType == "running") { "garmin_arguments_rejected" }
      worker().getActivities(input.start, input.limit)
    }).runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("getActivity") Coroutine { input: GarminActivityInput ->
      worker().getActivity(input.externalActivityId)
    }).runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("getActivitySplits") Coroutine { input: GarminActivityInput ->
      worker().getActivitySplits(input.externalActivityId)
    }).runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("getActivityDetails") Coroutine { input: GarminActivityDetailsInput ->
      require(input.maxchart == 2_000 && input.maxpoly == 4_000) { "garmin_arguments_rejected" }
      worker().getActivityDetails(input.externalActivityId)
    }).runOnQueue(appContext.backgroundCoroutineScope)
  }

  private fun worker(): GarminClientWorker {
    clientWorker?.let { return it }
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    return synchronized(this) {
      clientWorker ?: GarminClientWorker(
        dispatcher = ChaquopyGarminPythonDispatcher(context),
        sessionStore = GarminTokenStore(context.noBackupFilesDir.resolve("garmin-session"))
      ).also { clientWorker = it }
    }
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
