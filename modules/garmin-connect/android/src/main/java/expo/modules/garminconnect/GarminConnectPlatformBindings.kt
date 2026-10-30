package expo.modules.garminconnect

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.os.SystemClock
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.modules.Module
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.zip.ZipFile
import kotlinx.coroutines.CoroutineScope

internal class GarminConnectPlatformBindings(
  private val workerProvider: () -> GarminClientWorker,
  private val dispatcherProvider: () -> GarminPythonDispatcher,
  private val sessionStoreProvider: () -> GarminSessionStore,
  private val armStoreProvider: () -> GarminEvidenceArmStore,
  private val consumeArmProvider: (String, String) -> Map<String, Any?>,
  private val executionIdentityProvider: () -> GarminEvidenceExecutionIdentity,
  private val runLifecycleProvider: () -> Map<String, Any?>,
  private val completeArmProvider: () -> Map<String, Any?>,
  private val runtimeInfoProvider: () -> Map<String, Any>,
  private val benchmarkProvider: (String) -> Map<String, Any?>,
  private val packageNameProvider: () -> String?,
  private val adversarialProvider: (String, String) -> Map<String, Any?>,
  private val moduleSizeProvider: (File) -> Long,
  private val memoryRssProvider: () -> Long?,
  private val installedIdentityProvider: (Context?, String) -> Map<String, String>,
  private val streamDigestProvider: (InputStream) -> String,
  private val bytesDigestProvider: (ByteArray) -> String,
  private val transportReadinessProvider: (String) -> Map<String, String>,
) {
  fun worker(): GarminClientWorker = workerProvider()
  fun dispatcher(): GarminPythonDispatcher = dispatcherProvider()
  fun sessionStore(): GarminSessionStore = sessionStoreProvider()
  fun armStore(): GarminEvidenceArmStore = armStoreProvider()
  fun consumeArm(nonce: String, phase: String): Map<String, Any?> = consumeArmProvider(nonce, phase)
  fun executionIdentity(): GarminEvidenceExecutionIdentity = executionIdentityProvider()
  fun runLifecycle(): Map<String, Any?> = runLifecycleProvider()
  fun completeArm(): Map<String, Any?> = completeArmProvider()
  fun runtimeInfo(): Map<String, Any> = runtimeInfoProvider()
  fun benchmark(payloadJson: String): Map<String, Any?> = benchmarkProvider(payloadJson)
  fun packageName(): String? = packageNameProvider()
  fun adversarial(confirmation: String, deviceIdentitySha256: String): Map<String, Any?> =
    adversarialProvider(confirmation, deviceIdentitySha256)
  fun moduleSize(apk: File): Long = moduleSizeProvider(apk)
  fun memoryRss(): Long? = memoryRssProvider()
  fun installedIdentity(context: Context?, deviceIdentitySha256: String): Map<String, String> =
    installedIdentityProvider(context, deviceIdentitySha256)
  fun streamDigest(input: InputStream): String = streamDigestProvider(input)
  fun bytesDigest(bytes: ByteArray): String = bytesDigestProvider(bytes)
  fun transportReadiness(nonce: String): Map<String, String> = transportReadinessProvider(nonce)

  companion object {
    fun backgroundScope(module: Module): CoroutineScope = module.appContext.backgroundCoroutineScope

    fun production(module: Module): GarminConnectPlatformBindings {
      fun context(): Context = module.appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("garmin_runtime_unavailable")
      fun intent() = module.appContext.currentActivity?.intent
        ?: throw IllegalStateException("garmin_operation_rejected")

      var dispatcherValue: GarminPythonDispatcher? = null
      val dispatcher = {
        dispatcherValue ?: synchronized(module) {
          dispatcherValue ?: productionGarminPythonDispatcher(context()).also { dispatcherValue = it }
        }
      }
      var sessionStoreValue: GarminSessionStore? = null
      val sessionStore = {
        sessionStoreValue ?: synchronized(module) {
          sessionStoreValue ?: GarminTokenStore(
            context().noBackupFilesDir.resolve("garmin-session")
          ).also { sessionStoreValue = it }
        }
      }
      var workerValue: GarminClientWorker? = null
      val worker = {
        workerValue ?: synchronized(module) {
          workerValue ?: GarminClientWorker(dispatcher(), sessionStore()).also { workerValue = it }
        }
      }
      var armStoreValue: GarminEvidenceArmStore? = null
      val armStore = {
        armStoreValue ?: synchronized(module) {
          armStoreValue ?: GarminEvidenceArmStore(
            context().noBackupFilesDir.resolve("v12-evidence")
          ).also { armStoreValue = it }
        }
      }
      val executionIdentity = {
        val currentIntent = intent()
        GarminEvidenceExecutionIdentity(
          packageName = context().packageName,
          scheme = currentIntent.data?.scheme,
          host = currentIntent.data?.host,
          runIdSha256 = currentIntent.getStringExtra("v12RunIdSha256") ?: "",
          deviceIdentitySha256 = currentIntent.getStringExtra("v12DeviceIdentitySha256") ?: "",
          leaseIdSha256 = currentIntent.getStringExtra("v12LeaseIdSha256") ?: "",
        )
      }
      val authorization by lazy {
        GarminEvidenceAuthorizationController(
          armStore = armStore(),
          sessionRunner = {
            GarminStoredSessionEvidenceRunner(worker(), dispatcher(), sessionStore()).run()
          },
          executionIdentity = executionIdentity,
        )
      }
      var adversarialValue: GarminAdversarialSuiteRunner? = null
      val adversarialRunner = {
        adversarialValue ?: synchronized(module) {
          adversarialValue ?: run {
            val gate = GarminAdversarialRotationGate()
            val store = GarminTokenStore(
              root = context().noBackupFilesDir.resolve("garmin-adversarial-session"),
              beforeCommit = gate::beforeCommit,
            )
            GarminAdversarialSuiteRunner(
              dispatcher = productionGarminPythonDispatcher(context()),
              sessionStore = store,
              interruptRotation = gate::arm,
            )
          }.also { adversarialValue = it }
        }
      }

      fun digest(input: InputStream): String {
        val value = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          value.update(buffer, 0, count)
        }
        buffer.fill(0)
        return value.digest().joinToString("") { byte -> "%02x".format(byte) }
      }
      fun digest(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }
      fun moduleSize(apk: File): Long = ZipFile(apk).use { zip ->
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
      fun memoryRss(): Long? = runCatching {
        File("/proc/self/status").useLines { lines ->
          lines.firstOrNull { it.startsWith("VmRSS:") }
            ?.trim()
            ?.split(Regex("\\s+"))
            ?.getOrNull(1)
            ?.toLongOrNull()
            ?.times(1_024L)
        }
      }.getOrNull()
      fun installedIdentity(androidContext: Context, deviceIdentitySha256: String): Map<String, String> {
        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          androidContext.packageManager.getPackageInfo(
            androidContext.packageName,
            PackageManager.GET_SIGNING_CERTIFICATES,
          )
        } else {
          @Suppress("DEPRECATION")
          androidContext.packageManager.getPackageInfo(androidContext.packageName, PackageManager.GET_SIGNATURES)
        }
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          packageInfo.signingInfo?.apkContentsSigners
        } else {
          @Suppress("DEPRECATION")
          packageInfo.signatures
        } ?: throw IllegalStateException("garmin_runtime_identity_invalid")
        if (signatures.size != 1 || !deviceIdentitySha256.matches(Regex("^[a-f0-9]{64}$"))) {
          throw IllegalStateException("garmin_runtime_identity_invalid")
        }
        return mapOf(
          "retainedApkSha256" to FileInputStream(androidContext.applicationInfo.sourceDir).use(::digest),
          "retainedSignatureSha256" to digest(signatures.single().toByteArray()),
          "deviceIdentitySha256" to deviceIdentitySha256,
        )
      }

      return GarminConnectPlatformBindings(
        workerProvider = worker,
        dispatcherProvider = dispatcher,
        sessionStoreProvider = sessionStore,
        armStoreProvider = armStore,
        consumeArmProvider = { nonce, phase ->
          val currentIntent = intent()
          authorization.consume(
            packageName = context().packageName,
            scheme = currentIntent.data?.scheme,
            host = currentIntent.data?.host,
            expected = GarminEvidenceArmExpectation(
              phase = phase,
              nonce = nonce,
              runIdSha256 = currentIntent.getStringExtra("v12RunIdSha256") ?: "",
              deviceIdentitySha256 = currentIntent.getStringExtra("v12DeviceIdentitySha256") ?: "",
              leaseIdSha256 = currentIntent.getStringExtra("v12LeaseIdSha256") ?: "",
            ),
          )
        },
        executionIdentityProvider = executionIdentity,
        runLifecycleProvider = { authorization.runStoredSessionLifecycle() },
        completeArmProvider = { authorization.complete() },
        runtimeInfoProvider = {
          val reactContext = module.appContext.reactContext
            ?: throw IllegalStateException("garmin_runtime_unavailable")
          val startedAtNanos = SystemClock.elapsedRealtimeNanos()
          val pythonStartupKind = synchronized(Python::class.java) {
            val kind = if (Python.isStarted()) "warm" else "cold"
            if (!Python.isStarted()) Python.start(AndroidPlatform(reactContext.applicationContext))
            kind
          }
          val result = productionGarminPythonDispatch(
            Python.getInstance(), "runtimeInfo", emptyMap(),
          )
          val observedAtNanos = SystemClock.elapsedRealtimeNanos()
          val apk = File(reactContext.applicationInfo.sourceDir)
          val installedApkSizeBytes = apk.length()
          val garminModuleSizeBytes = moduleSize(apk)
          if (installedApkSizeBytes <= 0L || garminModuleSizeBytes <= 0L) {
            throw IllegalStateException("garmin_runtime_schema_invalid")
          }
          GarminRuntimeInfo.fromPython(result).toDto(
            GarminBenchmarkRuntimeInfo(
              processId = Process.myPid(),
              installedApkSizeBytes = installedApkSizeBytes,
              garminModuleSizeBytes = garminModuleSizeBytes,
              memoryRssBytes = memoryRss(),
              pythonStartupKind = pythonStartupKind,
              pythonStartupDurationMs = (observedAtNanos - startedAtNanos) / 1_000_000.0,
              observedAtMonotonicMs = observedAtNanos / 1_000_000.0,
            )
          )
        },
        benchmarkProvider = { payloadJson ->
          val androidContext = context()
          require(androidContext.packageName == "com.fchoo.gymtracker.devtest" && payloadJson.isNotEmpty() && payloadJson.length <= 1_000_000) {
            "garmin_arguments_rejected"
          }
          productionGarminPythonDispatcher(androidContext).dispatch(
            "benchmarkDeterministicJson",
            mutableMapOf("payloadJson" to payloadJson),
          )
        },
        packageNameProvider = { module.appContext.reactContext?.packageName },
        adversarialProvider = { confirmation, deviceIdentitySha256 ->
          val androidContext = context()
          require(androidContext.packageName == "com.fchoo.gymtracker.devtest") {
            "garmin_operation_rejected"
          }
          adversarialRunner().run(confirmation) + mapOf(
            "runtime_identity" to installedIdentity(androidContext, deviceIdentitySha256),
          )
        },
        moduleSizeProvider = ::moduleSize,
        memoryRssProvider = ::memoryRss,
        installedIdentityProvider = { androidContext, deviceIdentitySha256 ->
          installedIdentity(requireNotNull(androidContext), deviceIdentitySha256)
        },
        streamDigestProvider = ::digest,
        bytesDigestProvider = ::digest,
        transportReadinessProvider = GarminTransportReadinessPlatform(module)::run,
      )
    }
  }
}
