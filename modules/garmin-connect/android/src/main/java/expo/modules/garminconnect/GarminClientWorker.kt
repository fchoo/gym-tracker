package expo.modules.garminconnect

import android.content.Context
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

internal interface GarminPythonDispatcher {
  fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?>
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
    @Suppress("UNCHECKED_CAST")
    return Python.getInstance()
      .getModule("garmin_bridge")
      .callAttr("dispatch", operation, arguments)
      .toJava(Map::class.java) as Map<String, Any?>
  }
}

internal class GarminClientWorker(
  private val dispatcher: GarminPythonDispatcher
) {
  private val lock = ReentrantLock()

  fun connectionState(): Map<String, Any?> = call("connectionState")

  fun login(email: String, password: String): Map<String, Any?> {
    require(email.isNotEmpty() && email.length <= 254) { "garmin_arguments_rejected" }
    require(password.isNotEmpty() && password.length <= 1_024) { "garmin_arguments_rejected" }
    val arguments = mutableMapOf<String, Any>("email" to email, "password" to password)
    return try {
      call("login", arguments)
    } finally {
      arguments.clear()
    }
  }

  fun resumeMfa(challengeHandle: String, code: String): Map<String, Any?> {
    require(challengeHandle.matches(Regex("^[A-Za-z0-9_-]{16,128}$"))) { "garmin_arguments_rejected" }
    require(code.matches(Regex("^[0-9]{4,10}$"))) { "garmin_arguments_rejected" }
    val arguments = mutableMapOf<String, Any>(
      "challengeHandle" to challengeHandle,
      "code" to code
    )
    return try {
      call("resumeMfa", arguments)
    } finally {
      arguments.clear()
    }
  }

  fun logout(): Map<String, Any?> = call("logout")

  fun getActivities(start: Int, limit: Int): Map<String, Any?> {
    require(start in 0..10_000 && limit in 1..50) { "garmin_arguments_rejected" }
    return call(
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
    return call(
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
    return call(operation, mutableMapOf("externalActivityId" to externalActivityId))
  }

  private fun validateActivityId(externalActivityId: String) {
    require(externalActivityId.matches(Regex("^[1-9][0-9]{0,18}$"))) {
      "garmin_arguments_rejected"
    }
  }

  private fun call(
    operation: String,
    arguments: MutableMap<String, Any> = mutableMapOf()
  ): Map<String, Any?> = lock.withLock {
    dispatcher.dispatch(operation, arguments)
  }
}
