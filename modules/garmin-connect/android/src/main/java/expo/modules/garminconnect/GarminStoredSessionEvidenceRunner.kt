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
      recovery = sessionStore.read()
      if (recovery == null) throw failure("sign_in_required")
      val before = identity()
      val restored = successData(worker.restoreSession())
      val accountNamespace = restored["account_namespace"]
      if (accountNamespace !is String) throw failure("sign_in_required")
      val refreshed = successData(worker.forceRefreshForTest())
      if (refreshed["kind"] != "connected") throw failure("temporary_failure")
      val refreshedIdentity = identity()
      if (refreshedIdentity == before) throw failure("temporary_failure")
      recovery.fill(0)
      recovery = sessionStore.read()
      if (recovery == null) throw failure("sign_in_required")
      val rejections = dispatcher.evidenceRejections()
      val expectedRejections = mapOf(
          "operation_rejection" to "operation_rejected",
          "arguments_rejection" to "arguments_rejected",
        )
      if (rejections != expectedRejections) throw failure("temporary_failure")
      val recoveryExtensions = dispatcher.evidenceRecoveryExtensions()
      if (recoveryExtensions.size != 4) throw failure("temporary_failure")
      successData(worker.logout())
      if (sessionStore.recordIdentity()["present"] != false) {
        throw failure("temporary_failure")
      }
      sessionStore.replace(recovery)
      val restoredIdentity = identity()
      val cold = successData(worker.restoreSession())
      if (cold["kind"] != "connected") throw failure("temporary_failure")
      if (cold["account_namespace"] != accountNamespace) throw failure("temporary_failure")
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
          val present = sessionStore.recordIdentity()["present"] as Boolean
          if (!present) sessionStore.replace(bytes)
        } finally {
          bytes.fill(0)
        }
      }
    }
  }

  private fun identity(): String {
    val value = sessionStore.recordIdentity()
    if (value["present"] != true) throw failure("sign_in_required")
    if (value["version"] != 1) throw failure("sign_in_required")
    val digest = value["sha256"]
    if (digest !is String) throw failure("sign_in_required")
    return digest
  }

  private fun successData(result: Map<String, Any?>): Map<*, *> {
    if (result["status"] != "ok") {
      val error = result["error"] as Map<*, *>
      throw failure(error["code"] as String)
    }
    val data = result["data"]
    if (data !is Map<*, *>) throw failure("malformed_response")
    return data
  }

  private fun failure(code: String): GarminWorkerException = GarminWorkerException(code)
}
