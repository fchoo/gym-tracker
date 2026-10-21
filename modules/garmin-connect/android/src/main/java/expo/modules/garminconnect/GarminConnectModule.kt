package expo.modules.garminconnect

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope

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
  private object Running : State
  private object Completed : State
  private class Authorized(val authorization: GarminEvidenceAuthorization) : State
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
      state = Running
      value
    }
    return try {
      sessionRunner()
    } finally {
      synchronized(authorizationLock) {
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

internal class GarminAdversarialRotationGate {
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

internal class GarminRuntimeInfo(
  private val schemaVersion: Int,
  private val pythonVersion: String,
  private val clientVersion: String,
  private val clientCommit: String,
  private val abi: String,
  private val capabilities: List<String>,
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

internal class GarminBenchmarkRuntimeInfo(
  private val processId: Int,
  private val installedApkSizeBytes: Long,
  private val garminModuleSizeBytes: Long,
  private val memoryRssBytes: Long?,
  private val pythonStartupKind: String,
  private val pythonStartupDurationMs: Double,
  private val observedAtMonotonicMs: Double,
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

class GarminConnectModule() : Module() {
  private var bindingsFactory: (Module) -> GarminConnectPlatformBindings = GarminConnectPlatformBindings::production
  // The production provider preserves runOnQueue(appContext.backgroundCoroutineScope)
  // while tests inject a deterministic scope without constructing Android state.
  private var backgroundScopeProvider: (GarminConnectModule) -> CoroutineScope =
    GarminConnectPlatformBindings.Companion::backgroundScope
  private val bindings by lazy { bindingsFactory(this) }

  internal constructor(
    bindingsFactory: (Module) -> GarminConnectPlatformBindings,
    backgroundScopeProvider: (GarminConnectModule) -> CoroutineScope,
  ) : this() {
    this.bindingsFactory = bindingsFactory
    this.backgroundScopeProvider = backgroundScopeProvider
  }

  override fun definition() = ModuleDefinition {
    val scope = backgroundScopeProvider(this@GarminConnectModule)
    Name("GarminConnect")

    AsyncFunction(RUNTIME_INFO_OPERATION)
      .SuspendBody<Map<String, Any>> { runtimeInfo() }
      .runOnQueue(scope)

    (AsyncFunction("benchmarkDeterministicJson") Coroutine { input: GarminBenchmarkJsonInput ->
      bindings.benchmark(input.payloadJson)
    }).runOnQueue(scope)

    AsyncFunction("connectionState")
      .SuspendBody<Map<String, Any?>> { worker().connectionState() }
      .runOnQueue(scope)

    (AsyncFunction("login") Coroutine { input: GarminLoginInput ->
      worker().login(input.email, input.password)
    }).runOnQueue(scope)

    (AsyncFunction("resumeMfa") Coroutine { input: GarminMfaInput ->
      worker().resumeMfa(input.challengeHandle, input.code)
    }).runOnQueue(scope)

    AsyncFunction("restoreSession")
      .SuspendBody<Map<String, Any?>> { worker().restoreSession() }
      .runOnQueue(scope)

    AsyncFunction("forceRefreshForTest")
      .SuspendBody<Map<String, Any?>> {
        require(bindings.packageName() == "com.fchoo.gymtracker.devtest") {
          "garmin_operation_rejected"
        }
        worker().forceRefreshForTest()
      }
      .runOnQueue(scope)

    AsyncFunction("sessionRecordState")
      .SuspendBody<Map<String, Any?>> {
        require(bindings.packageName() == "com.fchoo.gymtracker.devtest") {
          "garmin_operation_rejected"
        }
        worker().sessionRecordState()
      }
      .runOnQueue(scope)

    (AsyncFunction("consumeV12EvidenceArm") Coroutine { input: GarminV12EvidenceArmInput ->
      consumeV12EvidenceArm(input.nonce, input.phase)
    }).runOnQueue(scope)

    AsyncFunction("runV12StoredSessionLifecycle")
      .SuspendBody<Map<String, Any?>> { bindings.runLifecycle() }
      .runOnQueue(scope)

    AsyncFunction("completeV12EvidenceArm")
      .SuspendBody<Map<String, Any?>> { bindings.completeArm() }
      .runOnQueue(scope)

    AsyncFunction("logout")
      .SuspendBody<Map<String, Any?>> { worker().logout() }
      .runOnQueue(scope)

    (AsyncFunction("getActivities") Coroutine { input: GarminActivitiesInput ->
      require(input.activityType == "running") { "garmin_arguments_rejected" }
      worker().getActivities(input.start, input.limit)
    }).runOnQueue(scope)

    (AsyncFunction("getActivity") Coroutine { input: GarminActivityInput ->
      worker().getActivity(input.externalActivityId)
    }).runOnQueue(scope)

    (AsyncFunction("getActivitySplits") Coroutine { input: GarminActivityInput ->
      worker().getActivitySplits(input.externalActivityId)
    }).runOnQueue(scope)

    (AsyncFunction("getActivityDetails") Coroutine { input: GarminActivityDetailsInput ->
      require(input.maxchart == 2_000 && input.maxpoly == 4_000) { "garmin_arguments_rejected" }
      worker().getActivityDetails(input.externalActivityId)
    }).runOnQueue(scope)

    (AsyncFunction("runAdversarialSuite") Coroutine { input: GarminAdversarialSuiteInput ->
      bindings.adversarial(input.confirmation, input.deviceIdentitySha256)
    }).runOnQueue(scope)
  }

  internal fun worker(): GarminClientWorker = bindings.worker()

  internal fun consumeV12EvidenceArm(nonce: String, phase: String): Map<String, Any?> =
    bindings.consumeArm(nonce, phase)

  internal fun runtimeInfo(): Map<String, Any> = bindings.runtimeInfo()
}
