package expo.modules.garminconnect

import android.content.Context
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.math.abs

private const val MAX_RETRY_AFTER_MS = 900_000L
private const val MAX_JSON_DEPTH = 16
private const val MAX_JSON_NODES = 25_000
private const val MAX_JSON_STRING_LENGTH = 16_384
private val SAFE_ERROR_CODES = setOf(
  "invalid_credentials",
  "mfa_expired",
  "sign_in_required",
  "data_access_denied",
  "rate_limited",
  "offline",
  "timeout",
  "temporary_failure",
  "malformed_response",
  "stale_generation",
  "operation_rejected",
  "arguments_rejected"
)
private val FORBIDDEN_RESULT_KEY = Regex(
  "authorization|ciphertext|cookie|credential|email|password|refresh|token|traceback|url",
  RegexOption.IGNORE_CASE
)
private val URL_RESULT_VALUE = Regex("^(?:https?|ftp)://", RegexOption.IGNORE_CASE)

internal interface GarminPythonDispatcher {
  fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?>
  fun takePersistableTokens(): ByteArray?
}

internal class ChaquopyGarminPythonDispatcher(
  private val context: Context
) : GarminPythonDispatcher {
  override fun dispatch(
    operation: String,
    arguments: MutableMap<String, Any>
  ): Map<String, Any?> {
    synchronized(Python::class.java) {
      if (!Python.isStarted()) {
        Python.start(AndroidPlatform(context.applicationContext))
      }
    }
    return try {
      @Suppress("UNCHECKED_CAST")
      module()
        .callAttr("dispatch", operation, arguments)
        .toJava(Map::class.java) as Map<String, Any?>
    } catch (_: Throwable) {
      throw GarminWorkerException("temporary_failure")
    }
  }

  override fun takePersistableTokens(): ByteArray? = try {
    module().callAttr("take_persistable_tokens").toJava(ByteArray::class.java)
  } catch (_: Throwable) {
    throw GarminWorkerException("temporary_failure")
  }

  private fun module() = Python.getInstance().getModule("garmin_bridge")
}

internal class GarminClientWorker(
  private val dispatcher: GarminPythonDispatcher,
  private val sessionStore: GarminSessionStore
) {
  private val lock = ReentrantLock()
  private var generation = 0L

  fun connectionState(): Map<String, Any?> = lock.withLock {
    val result = safeDispatch("connectionState", mutableMapOf())
    acceptGeneration(result)
    result
  }

  fun login(email: String, password: String): Map<String, Any?> {
    require(email.isNotEmpty() && email.length <= 254) { "garmin_arguments_rejected" }
    require(password.isNotEmpty() && password.length <= 1_024) { "garmin_arguments_rejected" }
    val arguments = mutableMapOf<String, Any>("email" to email, "password" to password)
    return lock.withLock {
      generation += 1
      try {
        val result = safeDispatch("login", arguments)
        requireGeneration(result, generation)
        persistPendingTokens(result)
        result
      } finally {
        arguments.clear()
      }
    }
  }

  fun resumeMfa(challengeHandle: String, code: String): Map<String, Any?> {
    require(challengeHandle.matches(Regex("^[A-Za-z0-9_-]{16,128}$"))) { "garmin_arguments_rejected" }
    require(code.matches(Regex("^[0-9]{4,10}$"))) { "garmin_arguments_rejected" }
    val arguments = mutableMapOf<String, Any>(
      "challengeHandle" to challengeHandle,
      "code" to code
    )
    return lock.withLock {
      val startedGeneration = generation
      try {
        val result = safeDispatch("resumeMfa", arguments)
        requireGeneration(result, startedGeneration)
        persistPendingTokens(result)
        result
      } finally {
        arguments.clear()
      }
    }
  }

  fun restoreSession(): Map<String, Any?> = lock.withLock {
    val tokenPayload = try {
      sessionStore.read()
    } catch (_: GarminTokenStoreException) {
      null
    } ?: return@withLock error("sign_in_required")
    generation += 1
    val arguments = mutableMapOf<String, Any>("tokenPayload" to tokenPayload)
    try {
      val result = safeDispatch("restoreSession", arguments)
      requireGeneration(result, generation)
      persistPendingTokens(result)
      result
    } finally {
      tokenPayload.fill(0)
      arguments.clear()
    }
  }

  fun logout(): Map<String, Any?> = lock.withLock {
    generation += 1
    var clearFailed = false
    try {
      sessionStore.clear()
    } catch (_: GarminTokenStoreException) {
      clearFailed = true
    }
    val result = safeDispatch("logout", mutableMapOf())
    requireGeneration(result, generation)
    if (clearFailed) throw GarminWorkerException("garmin_token_clear_failed")
    result
  }

  fun getActivities(start: Int, limit: Int): Map<String, Any?> {
    require(start in 0..10_000 && limit in 1..50) { "garmin_arguments_rejected" }
    return readCall(
      "getActivities",
      mutableMapOf("start" to start, "limit" to limit, "activityType" to "running")
    )
  }

  fun getActivity(externalActivityId: String): Map<String, Any?> =
    activityCall("getActivity", externalActivityId)

  fun getActivitySplits(externalActivityId: String): Map<String, Any?> =
    activityCall("getActivitySplits", externalActivityId)

  fun getActivityDetails(externalActivityId: String): Map<String, Any?> {
    validateActivityId(externalActivityId)
    return readCall(
      "getActivityDetails",
      mutableMapOf(
        "externalActivityId" to externalActivityId,
        "maxchart" to 2_000,
        "maxpoly" to 4_000
      )
    )
  }

  private fun activityCall(operation: String, externalActivityId: String): Map<String, Any?> {
    validateActivityId(externalActivityId)
    return readCall(operation, mutableMapOf("externalActivityId" to externalActivityId))
  }

  private fun validateActivityId(externalActivityId: String) {
    require(externalActivityId.matches(Regex("^[1-9][0-9]{0,18}$"))) {
      "garmin_arguments_rejected"
    }
  }

  private fun readCall(
    operation: String,
    arguments: MutableMap<String, Any> = mutableMapOf()
  ): Map<String, Any?> = lock.withLock {
    val startedGeneration = generation
    val result = safeDispatch(operation, arguments)
    if (result["status"] == "ok" && resultGeneration(result) != startedGeneration) {
      return@withLock error("stale_generation")
    }
    persistPendingTokens(result)
    result
  }

  private fun acceptGeneration(result: Map<String, Any?>) {
    if (result["status"] != "ok") return
    val nextGeneration = resultGeneration(result)
    if (nextGeneration < generation) throw GarminWorkerException("stale_generation")
    generation = nextGeneration
  }

  private fun requireGeneration(result: Map<String, Any?>, expected: Long) {
    if (result["status"] == "ok" && resultGeneration(result) != expected) {
      throw GarminWorkerException("stale_generation")
    }
  }

  private fun resultGeneration(result: Map<String, Any?>): Long {
    val value = result["generation"] as? Number ?: throw GarminWorkerException("malformed_response")
    val parsed = value.toLong()
    if (parsed < 0 || value.toDouble() != parsed.toDouble()) {
      throw GarminWorkerException("malformed_response")
    }
    return parsed
  }

  private fun persistPendingTokens(result: Map<String, Any?>) {
    if (result["status"] != "ok") return
    val tokenBytes = dispatcher.takePersistableTokens() ?: return
    try {
      sessionStore.replace(tokenBytes)
    } finally {
      tokenBytes.fill(0)
    }
  }

  private fun safeDispatch(
    operation: String,
    arguments: MutableMap<String, Any>
  ): Map<String, Any?> = try {
    sanitizeResult(dispatcher.dispatch(operation, arguments))
  } catch (_: GarminWorkerException) {
    error("temporary_failure")
  } catch (_: Throwable) {
    error("temporary_failure")
  }

  private fun sanitizeResult(result: Map<String, Any?>): Map<String, Any?> {
    return when (result["status"]) {
      "error" -> {
        val nativeError = result["error"] as? Map<*, *> ?: return error("malformed_response")
        val nativeCode = nativeError["code"] as? String
        val code = nativeCode?.takeIf(SAFE_ERROR_CODES::contains) ?: "temporary_failure"
        val retryAfter = (nativeError["retryAfterMs"] as? Number)?.toLong()
        val detail = mutableMapOf<String, Any>("code" to code)
        if (code == "rate_limited" && retryAfter != null && retryAfter >= 0) {
          detail["retryAfterMs"] = retryAfter.coerceIn(1_000L, MAX_RETRY_AFTER_MS)
        }
        mapOf("status" to "error", "error" to detail)
      }
      "ok" -> {
        val resultGeneration = try {
          resultGeneration(result)
        } catch (_: GarminWorkerException) {
          return error("malformed_response")
        }
        val data = try {
          sanitizeJson(result["data"], 0, intArrayOf(0))
        } catch (_: GarminWorkerException) {
          return error("malformed_response")
        }
        mapOf("status" to "ok", "generation" to resultGeneration, "data" to data)
      }
      else -> error("malformed_response")
    }
  }

  private fun sanitizeJson(value: Any?, depth: Int, nodes: IntArray): Any? {
    nodes[0] += 1
    if (depth > MAX_JSON_DEPTH || nodes[0] > MAX_JSON_NODES) {
      throw GarminWorkerException("malformed_response")
    }
    return when (value) {
      null, is Boolean, is Byte, is Short, is Int, is Long -> value
      is Float -> if (value.isFinite() && abs(value.toDouble()) <= 9_007_199_254_740_991.0) value else throw GarminWorkerException("malformed_response")
      is Double -> if (value.isFinite() && abs(value) <= 9_007_199_254_740_991.0) value else throw GarminWorkerException("malformed_response")
      is String -> if (value.length <= MAX_JSON_STRING_LENGTH && !URL_RESULT_VALUE.containsMatchIn(value)) value else throw GarminWorkerException("malformed_response")
      is List<*> -> value.map { child -> sanitizeJson(child, depth + 1, nodes) }
      is Map<*, *> -> value.entries.associate { (key, child) ->
        if (key !is String || key.isEmpty() || key.length > 128 || FORBIDDEN_RESULT_KEY.containsMatchIn(key)) {
          throw GarminWorkerException("malformed_response")
        }
        key to sanitizeJson(child, depth + 1, nodes)
      }
      else -> throw GarminWorkerException("malformed_response")
    }
  }

  private fun error(code: String): Map<String, Any?> = mapOf(
    "status" to "error",
    "error" to mapOf("code" to code)
  )

  internal fun generationForTest(): Long = generation
}

internal class GarminWorkerException(
  val code: String
) : IllegalStateException(code)
