package expo.modules.garminconnect

/** Exercises the real encrypted session without returning any session bytes. */
internal class GarminStoredSessionEvidenceRunner(
  private val worker: GarminClientWorker,
  private val dispatcher: GarminPythonDispatcher,
  private val sessionStore: GarminSessionStore,
) {
  fun run(): Map<String, Any?> {
    var recovery: ByteArray? = null
    try {
      recovery = sessionStore.read() ?: fail("sign_in_required")
      val before = identity()
      val restored = successData(worker.restoreSession())
      val accountNamespace = restored["account_namespace"] as? String ?: fail("sign_in_required")
      val refreshed = successData(worker.forceRefreshForTest())
      if (refreshed["kind"] != "connected") fail("temporary_failure")
      val refreshedIdentity = identity()
      if (refreshedIdentity == before) fail("temporary_failure")
      recovery.fill(0)
      recovery = sessionStore.read() ?: fail("sign_in_required")
      val rejections = dispatcher.evidenceRejections()
      if (rejections != mapOf(
          "operation_rejection" to "operation_rejected",
          "arguments_rejection" to "arguments_rejected",
        )) fail("temporary_failure")
      val recoveryExtensions = dispatcher.evidenceRecoveryExtensions()
      if (recoveryExtensions.size != 4) fail("temporary_failure")
      val logout = successData(worker.logout())
      if (logout["kind"] != "disconnected" || sessionStore.recordIdentity()["present"] != false) {
        fail("temporary_failure")
      }
      sessionStore.replace(recovery)
      val restoredIdentity = identity()
      val cold = successData(worker.restoreSession())
      if (cold["kind"] != "connected" || cold["account_namespace"] != accountNamespace) {
        fail("temporary_failure")
      }
      return mapOf(
        "schema_version" to 1,
        "evidence_source" to dispatcher.evidenceSource(),
        "bridge_operations" to listOf(
          "connectionState", "login", "resumeMfa", "restoreSession", "logout",
          "getActivities", "getActivity", "getActivitySplits", "getActivityDetails",
          "forceRefreshForTest", "runAdversarialSuite",
        ),
        "codes" to mapOf(
          "restore" to "connected",
          "refresh" to "connected",
          "cold_restore" to "connected",
          "logout" to "disconnected",
          "restored" to "connected",
          "rotation" to "rotated",
          "restart" to "same-account",
          "storage" to "no-backup-encrypted",
          "operation_rejection" to rejections["operation_rejection"],
          "arguments_rejection" to rejections["arguments_rejection"],
        ),
        "before_sha256" to before,
        "refreshed_sha256" to refreshedIdentity,
        "restored_sha256" to restoredIdentity,
        "recovery_extensions" to recoveryExtensions,
      )
    } finally {
      val bytes = recovery
      if (bytes != null) {
        try {
          if (sessionStore.recordIdentity()["present"] != true) sessionStore.replace(bytes)
        } finally {
          bytes.fill(0)
        }
      }
    }
  }

  private fun identity(): String {
    val value = sessionStore.recordIdentity()
    if (value["present"] != true || value["version"] != 1) fail("sign_in_required")
    return value["sha256"] as? String ?: fail("sign_in_required")
  }

  private fun successData(result: Map<String, Any?>): Map<*, *> {
    if (result["status"] != "ok") {
      val error = result["error"] as? Map<*, *>
      fail(error?.get("code") as? String ?: "temporary_failure")
    }
    return result["data"] as? Map<*, *> ?: fail("malformed_response")
  }

  private fun fail(code: String): Nothing = throw GarminWorkerException(code)
}
