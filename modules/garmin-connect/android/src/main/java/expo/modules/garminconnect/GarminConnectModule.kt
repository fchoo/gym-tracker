package expo.modules.garminconnect

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
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
import java.io.FileInputStream
import java.security.MessageDigest
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
  @Field val confirmation: String = "",
  @Field val deviceIdentitySha256: String = ""
) : Record

private data class GarminBenchmarkJsonInput(
  @Field val payloadJson: String = ""
) : Record

private data class GarminV12EvidenceArmInput(
  @Field val nonce: String = "",
  @Field val phase: String = "",
) : Record

internal fun phase18DeviceIdentitySha256(
  serial: String,
  abi: String,
  apiLevel: String,
  model: String,
): String {
  val safeFact = Regex("^[^\\u0000\\r\\n]{1,512}$")
  require(safeFact.matches(serial) && safeFact.matches(abi) && safeFact.matches(model)) {
    "phase18_device_identity_invalid"
  }
  require(Regex("^\\d{2,3}$").matches(apiLevel)) { "phase18_device_identity_invalid" }
  fun jsonString(value: String): String = buildString {
    append('"')
    value.forEach { character ->
      when (character) {
        '"' -> append("\\\"")
        '\\' -> append("\\\\")
        '\b' -> append("\\b")
        '\u000C' -> append("\\f")
        '\t' -> append("\\t")
        else -> if (character.code < 0x20) {
          append("\\u%04x".format(character.code))
        } else {
          append(character)
        }
      }
    }
    append('"')
  }
  val canonicalJson = "{" +
    "\"serial\":" + jsonString(serial) +
    ",\"abi\":" + jsonString(abi) +
    ",\"apiLevel\":" + jsonString(apiLevel) +
    ",\"model\":" + jsonString(model) +
    "}"
  return MessageDigest.getInstance("SHA-256")
    .digest(canonicalJson.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }
}

internal fun requireGarminEvidenceRoute(
  packageName: String?,
  scheme: String?,
  host: String?,
) {
  require(packageName == "com.fchoo.gymtracker.devtest") { "garmin_operation_rejected" }
  require(scheme == "gymtracker-devtest" && host == "__v12-production-garmin") {
    "garmin_operation_rejected"
  }
}

internal class GarminEvidenceExecutionIdentity(
  val packageName: String?,
  val scheme: String?,
  val host: String?,
  val runIdSha256: String,
  val deviceIdentitySha256: String,
  val leaseIdSha256: String,
)

internal class GarminEvidenceAuthorizationController(
  private val armStore: GarminEvidenceArmStore,
  private val sessionRunner: () -> Map<String, Any?>,
  private val executionIdentity: () -> GarminEvidenceExecutionIdentity,
  private val nowMs: () -> Long = System::currentTimeMillis,
) {
  private sealed interface State

  private object Empty : State
  private object Completed : State
  private class Authorized(val authorization: GarminEvidenceAuthorization) : State
  private class Running(val authorization: GarminEvidenceAuthorization) : State
  private class Consumed(val authorization: GarminEvidenceAuthorization) : State

  private val authorizationLock = Any()
  private var state: State = Empty

  fun consume(
    packageName: String?,
    scheme: String?,
    host: String?,
    expected: GarminEvidenceArmExpectation,
  ): Map<String, Any?> {
    requireGarminEvidenceRoute(packageName, scheme, host)
    val consumed = synchronized(authorizationLock) {
      require(state === Empty || state === Completed) { "garmin_operation_rejected" }
      armStore.consume(expected).also { state = Authorized(it) }
    }
    return mapOf(
      "schema_version" to 1,
      "code" to "arm-consumed",
      "receipt_sha256" to consumed.receiptSha256,
    )
  }

  fun runStoredSessionLifecycle(): Map<String, Any?> {
    val current = synchronized(authorizationLock) {
      val authorized = state as? Authorized ?: throw rejection()
      val value = authorized.authorization
      require(value.phase == "execute") { "garmin_operation_rejected" }
      val identity = try {
        executionIdentity()
      } catch (_: Throwable) {
        state = Consumed(value)
        throw rejection()
      }
      try {
        requireGarminEvidenceRoute(identity.packageName, identity.scheme, identity.host)
        require(
          identity.runIdSha256 == value.runIdSha256
            && identity.deviceIdentitySha256 == value.deviceIdentitySha256
            && identity.leaseIdSha256 == value.leaseIdSha256
            && nowMs() <= value.expiresAtMs
        ) { "garmin_operation_rejected" }
      } catch (_: Throwable) {
        state = Consumed(value)
        throw rejection()
      }
      state = Running(value)
      value
    }
    return try {
      sessionRunner()
    } finally {
      synchronized(authorizationLock) {
        val running = state as? Running ?: throw rejection()
        if (running.authorization !== current) throw rejection()
        state = Consumed(current)
      }
    }
  }

  fun complete(): Map<String, Any?> {
    val current = synchronized(authorizationLock) {
      val value = when (val currentState = state) {
        is Authorized -> {
          if (currentState.authorization.phase != "preflight") throw rejection()
          if (nowMs() > currentState.authorization.expiresAtMs) {
            armStore.clear()
            state = Completed
            throw rejection()
          }
          currentState.authorization
        }
        is Consumed -> currentState.authorization
        else -> throw rejection()
      }
      armStore.clear()
      state = Completed
      value
    }
    val receipt = MessageDigest.getInstance("SHA-256")
      .digest("${current.receiptSha256}:cleared".toByteArray(Charsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(byte) }
    return mapOf(
      "schema_version" to 1,
      "code" to "arm-cleared",
      "receipt_sha256" to receipt,
    )
  }

  private fun rejection(): IllegalStateException = IllegalStateException("garmin_operation_rejected")
}

private class GarminAdversarialRotationGate {
  @Volatile
  private var armed = false

  fun arm() {
    armed = true
  }

  fun beforeCommit() {
    if (!armed) return
    armed = false
    throw GarminTokenStoreException("garmin_token_write_failed")
  }
}

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
  private var clientDispatcher: GarminPythonDispatcher? = null
  private var clientSessionStore: GarminSessionStore? = null
  private var evidenceArmStore: GarminEvidenceArmStore? = null
  private var adversarialSuiteRunner: GarminAdversarialSuiteRunner? = null
  private val evidenceAuthorizationController by lazy {
    GarminEvidenceAuthorizationController(
      armStore = armStore(),
      sessionRunner = {
        GarminStoredSessionEvidenceRunner(worker(), dispatcher(), sessionStore()).run()
      },
      executionIdentity = ::currentEvidenceExecutionIdentity,
    )
  }

  override fun definition() = ModuleDefinition {
    Name("GarminConnect")

    AsyncFunction(RUNTIME_INFO_OPERATION)
      .SuspendBody<Map<String, Any>> { runtimeInfo() }
      .runOnQueue(appContext.backgroundCoroutineScope)

    (AsyncFunction("benchmarkDeterministicJson") Coroutine { input: GarminBenchmarkJsonInput ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("garmin_runtime_unavailable")
      require(context.packageName == "com.fchoo.gymtracker.devtest" && input.payloadJson.isNotEmpty() && input.payloadJson.length <= 1_000_000) {
        "garmin_arguments_rejected"
      }
      ChaquopyGarminPythonDispatcher(context).dispatch(
        "benchmarkDeterministicJson",
        mutableMapOf("payloadJson" to input.payloadJson),
      )
    }).runOnQueue(appContext.backgroundCoroutineScope)

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

    (AsyncFunction("consumeV12EvidenceArm") Coroutine { input: GarminV12EvidenceArmInput ->
      consumeV12EvidenceArm(input)
    }).runOnQueue(appContext.backgroundCoroutineScope)

    AsyncFunction("runV12StoredSessionLifecycle")
      .SuspendBody<Map<String, Any?>> { evidenceAuthorizationController.runStoredSessionLifecycle() }
      .runOnQueue(appContext.backgroundCoroutineScope)

    AsyncFunction("completeV12EvidenceArm")
      .SuspendBody<Map<String, Any?>> { evidenceAuthorizationController.complete() }
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
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("garmin_runtime_unavailable")
      require(context.packageName == "com.fchoo.gymtracker.devtest") {
        "garmin_operation_rejected"
      }
      adversarialRunner().run(input.confirmation) + mapOf(
        "runtime_identity" to installedRuntimeIdentity(context, input.deviceIdentitySha256),
      )
    }).runOnQueue(appContext.backgroundCoroutineScope)
  }

  private fun worker(): GarminClientWorker {
    clientWorker?.let { return it }
    return synchronized(this) {
      clientWorker ?: GarminClientWorker(dispatcher(), sessionStore()).also { clientWorker = it }
    }
  }

  private fun dispatcher(): GarminPythonDispatcher {
    clientDispatcher?.let { return it }
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    return synchronized(this) {
      clientDispatcher ?: ChaquopyGarminPythonDispatcher(context).also { clientDispatcher = it }
    }
  }

  private fun sessionStore(): GarminSessionStore {
    clientSessionStore?.let { return it }
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    return synchronized(this) {
      clientSessionStore ?: GarminTokenStore(
        context.noBackupFilesDir.resolve("garmin-session")
      ).also { clientSessionStore = it }
    }
  }

  private fun armStore(): GarminEvidenceArmStore {
    evidenceArmStore?.let { return it }
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    return synchronized(this) {
      evidenceArmStore ?: GarminEvidenceArmStore(
        context.noBackupFilesDir.resolve("v12-evidence")
      ).also { evidenceArmStore = it }
    }
  }

  private fun consumeV12EvidenceArm(input: GarminV12EvidenceArmInput): Map<String, Any?> {
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    val intent = appContext.currentActivity?.intent
      ?: throw IllegalStateException("garmin_operation_rejected")
    return evidenceAuthorizationController.consume(
      packageName = context.packageName,
      scheme = intent.data?.scheme,
      host = intent.data?.host,
      expected = GarminEvidenceArmExpectation(
        phase = input.phase,
        nonce = input.nonce,
        runIdSha256 = intent.getStringExtra("v12RunIdSha256") ?: "",
        deviceIdentitySha256 = intent.getStringExtra("v12DeviceIdentitySha256") ?: "",
        leaseIdSha256 = intent.getStringExtra("v12LeaseIdSha256") ?: "",
      ),
    )
  }

  private fun currentEvidenceExecutionIdentity(): GarminEvidenceExecutionIdentity {
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    val intent = appContext.currentActivity?.intent
      ?: throw IllegalStateException("garmin_operation_rejected")
    return GarminEvidenceExecutionIdentity(
      packageName = context.packageName,
      scheme = intent.data?.scheme,
      host = intent.data?.host,
      runIdSha256 = intent.getStringExtra("v12RunIdSha256") ?: "",
      deviceIdentitySha256 = intent.getStringExtra("v12DeviceIdentitySha256") ?: "",
      leaseIdSha256 = intent.getStringExtra("v12LeaseIdSha256") ?: "",
    )
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

  private fun adversarialRunner(): GarminAdversarialSuiteRunner {
    adversarialSuiteRunner?.let { return it }
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("garmin_runtime_unavailable")
    return synchronized(this) {
      adversarialSuiteRunner ?: run {
        val gate = GarminAdversarialRotationGate()
        val dispatcher = ChaquopyGarminPythonDispatcher(context)
        val store = GarminTokenStore(
          root = context.noBackupFilesDir.resolve("garmin-adversarial-session"),
          beforeCommit = gate::beforeCommit,
        )
        GarminAdversarialSuiteRunner(
          dispatcher = dispatcher,
          sessionStore = store,
          interruptRotation = gate::arm,
        )
      }.also { adversarialSuiteRunner = it }
    }
  }

  private fun installedRuntimeIdentity(
    context: Context,
    deviceIdentitySha256: String,
  ): Map<String, String> {
    val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      context.packageManager.getPackageInfo(
        context.packageName,
        PackageManager.GET_SIGNING_CERTIFICATES,
      )
    } else {
      @Suppress("DEPRECATION")
      context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
    }
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.signingInfo?.apkContentsSigners
    } else {
      @Suppress("DEPRECATION")
      packageInfo.signatures
    } ?: throw IllegalStateException("garmin_runtime_identity_invalid")
    if (signatures.size != 1) throw IllegalStateException("garmin_runtime_identity_invalid")
    if (!deviceIdentitySha256.matches(Regex("^[a-f0-9]{64}$"))) {
      throw IllegalStateException("garmin_runtime_identity_invalid")
    }
    return mapOf(
      "retainedApkSha256" to FileInputStream(context.applicationInfo.sourceDir).use(::sha256),
      "retainedSignatureSha256" to sha256(signatures.single().toByteArray()),
      "deviceIdentitySha256" to deviceIdentitySha256,
    )
  }

  private fun sha256(input: java.io.InputStream): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val count = input.read(buffer)
      if (count < 0) break
      digest.update(buffer, 0, count)
    }
    buffer.fill(0)
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { byte -> "%02x".format(byte) }
}
