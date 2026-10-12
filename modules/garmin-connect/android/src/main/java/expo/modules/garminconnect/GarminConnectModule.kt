package expo.modules.garminconnect

import android.os.Process
import android.os.SystemClock
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.zip.ZipFile

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

private data class GarminAdversarialSuiteInput(
  @Field val confirmation: String = ""
) : Record

private data class GarminRuntimeInfo(
  val schemaVersion: Int,
  val pythonVersion: String,
  val clientVersion: String,
  val clientCommit: String,
  val abi: String,
  val capabilities: List<String>,
) {
  fun toDto(benchmark: GarminBenchmarkRuntimeInfo): Map<String, Any> = mapOf(
    "schemaVersion" to schemaVersion,
    "pythonVersion" to pythonVersion,
    "clientVersion" to clientVersion,
    "clientCommit" to clientCommit,
    "abi" to abi,
    "capabilities" to capabilities,
    "benchmark" to benchmark.toDto(),
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

private data class GarminBenchmarkRuntimeInfo(
  val processId: Int,
  val installedApkSizeBytes: Long,
  val garminModuleSizeBytes: Long,
  val memoryRssBytes: Long?,
  val pythonStartupKind: String,
  val pythonStartupDurationMs: Double,
  val observedAtMonotonicMs: Double,
) {
  fun toDto(): Map<String, Any> = buildMap {
    put("processId", processId)
    put("installedApkSizeBytes", installedApkSizeBytes)
    put("garminModuleSizeBytes", garminModuleSizeBytes)
    memoryRssBytes?.let { put("memoryRssBytes", it) }
    put("pythonStartupKind", pythonStartupKind)
    put("pythonStartupDurationMs", pythonStartupDurationMs)
    put("observedAtMonotonicMs", observedAtMonotonicMs)
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

    AsyncFunction("forceRefreshForTest")
      .SuspendBody<Map<String, Any?>> {
        require(appContext.reactContext?.packageName == "com.fchoo.gymtracker.devtest") {
          "garmin_operation_rejected"
        }
        worker().forceRefreshForTest()
      }
      .runOnQueue(appContext.backgroundCoroutineScope)

    AsyncFunction("sessionRecordState")
      .SuspendBody<Map<String, Any?>> {
        require(appContext.reactContext?.packageName == "com.fchoo.gymtracker.devtest") {
          "garmin_operation_rejected"
        }
        worker().sessionRecordState()
      }
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

    (AsyncFunction("runAdversarialSuite") Coroutine { input: GarminAdversarialSuiteInput ->
      require(appContext.reactContext?.packageName == "com.fchoo.gymtracker.devtest") {
        "garmin_operation_rejected"
      }
      worker().runAdversarialSuite(input.confirmation)
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
    val startedAtNanos = SystemClock.elapsedRealtimeNanos()
    val pythonStartupKind = synchronized(Python::class.java) {
      val kind = if (Python.isStarted()) "warm" else "cold"
      if (!Python.isStarted()) {
        Python.start(AndroidPlatform(context.applicationContext))
      }
      kind
    }

    val result = Python.getInstance()
      .getModule("garmin_bridge")
      .callAttr("dispatch", RUNTIME_INFO_OPERATION, emptyMap<String, Any>())
      .toJava(Map::class.java)

    val observedAtNanos = SystemClock.elapsedRealtimeNanos()
    val apk = File(context.applicationInfo.sourceDir)
    val installedApkSizeBytes = apk.length()
    val garminModuleSizeBytes = garminModuleSizeBytes(apk)
    if (installedApkSizeBytes <= 0L || garminModuleSizeBytes <= 0L) {
      throw IllegalStateException("garmin_runtime_schema_invalid")
    }
    return GarminRuntimeInfo.fromPython(result).toDto(
      GarminBenchmarkRuntimeInfo(
        processId = Process.myPid(),
        installedApkSizeBytes = installedApkSizeBytes,
        garminModuleSizeBytes = garminModuleSizeBytes,
        memoryRssBytes = memoryRssBytes(),
        pythonStartupKind = pythonStartupKind,
        pythonStartupDurationMs = (observedAtNanos - startedAtNanos) / 1_000_000.0,
        observedAtMonotonicMs = observedAtNanos / 1_000_000.0,
      )
    )
  }

  private fun garminModuleSizeBytes(apk: File): Long = ZipFile(apk).use { zip ->
    zip.entries().asSequence()
      .filter { entry ->
        !entry.isDirectory && (
          entry.name.startsWith("assets/chaquopy/")
          || (
            entry.name.startsWith("lib/arm64-v8a/")
            && (entry.name.contains("chaquopy") || entry.name.contains("python"))
          )
        )
      }
      .sumOf { entry ->
        if (entry.compressedSize >= 0L) entry.compressedSize else entry.size.coerceAtLeast(0L)
      }
  }

  private fun memoryRssBytes(): Long? = runCatching {
    File("/proc/self/status").useLines { lines ->
      lines.firstOrNull { it.startsWith("VmRSS:") }
        ?.trim()
        ?.split(Regex("\\s+"))
        ?.getOrNull(1)
        ?.toLongOrNull()
        ?.times(1_024L)
    }
  }.getOrNull()
}
