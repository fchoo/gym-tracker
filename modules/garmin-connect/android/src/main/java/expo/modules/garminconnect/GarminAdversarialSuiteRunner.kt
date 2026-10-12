package expo.modules.garminconnect

import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val ADVERSARIAL_CONFIRMATION = "VERIFY-PHASE18-GARMIN-ADVERSARIAL"
private val ADVERSARIAL_CASE_IDS = listOf(
  "PH18-ADV-RESTORE",
  "PH18-ADV-REFRESH",
  "PH18-ADV-READ",
  "PH18-ADV-LOGOUT",
  "PH18-ADV-RESTART",
  "PH18-ADV-LATE-GENERATION",
  "PH18-ADV-403",
  "PH18-ADV-429",
  "PH18-ADV-OFFLINE",
  "PH18-ADV-TIMEOUT",
  "PH18-ADV-5XX",
  "PH18-ADV-MALFORMED",
  "PH18-ADV-OVERSIZED",
  "PH18-ADV-MISSING-COMPONENT",
  "PH18-ADV-PARTIAL-PAGE",
  "PH18-ADV-ROTATION",
)
private val INJECTED_CASES = linkedMapOf(
  "PH18-ADV-403" to "data_access_denied",
  "PH18-ADV-429" to "rate_limited",
  "PH18-ADV-OFFLINE" to "offline",
  "PH18-ADV-TIMEOUT" to "timeout",
  "PH18-ADV-5XX" to "temporary_failure",
  "PH18-ADV-MALFORMED" to "malformed_response",
  "PH18-ADV-OVERSIZED" to "malformed_response",
  "PH18-ADV-MISSING-COMPONENT" to "malformed_response",
  "PH18-ADV-PARTIAL-PAGE" to "temporary_failure",
  "PH18-ADV-ROTATION" to "stale_generation",
)
private val INJECTED_EXPECTED_CALLS = mapOf(
  "PH18-ADV-MISSING-COMPONENT" to 3,
  "PH18-ADV-PARTIAL-PAGE" to 5,
  "PH18-ADV-ROTATION" to 3,
)
private val READ_OPERATIONS = arrayOf(
  "getActivities",
  "getActivity",
  "getActivitySplits",
  "getActivityDetails",
)

internal class GarminAdversarialSuiteRunner(
  private val dispatcher: GarminPythonDispatcher,
  private val sessionStore: GarminSessionStore,
  private val interruptRotation: () -> Unit,
  private val now: () -> Long = { System.nanoTime() / 1_000_000L },
) {
  fun run(confirmation: String): Map<String, Any?> {
    require(confirmation == ADVERSARIAL_CONFIRMATION) { "garmin_arguments_rejected" }
    val rows = mutableListOf<Map<String, Any?>>()
    var retainedFacts = fallbackFacts()
    try {
      val lifecycle = seedAndRestore()
      retainedFacts = lifecycle.observation.facts
      val restoreGeneration = lifecycle.worker.generationForTest()
      rows += row(
        id = "PH18-ADV-RESTORE",
        expectedCode = "completed",
        actualCode = "completed",
        expectedCalls = 1,
        countedOperations = arrayOf("restoreSession"),
        connectionState = "connected",
        syncState = "idle",
        sessionDigest = sessionDigest(),
        generationBefore = restoreGeneration,
        generationAfter = restoreGeneration,
        observation = lifecycle.observation,
        retainedFacts = retainedFacts,
        startedAt = lifecycle.startedAt,
      )

      configure("PH18-ADV-REFRESH")
      val refreshStarted = now()
      val refreshGeneration = lifecycle.worker.generationForTest()
      successData(lifecycle.worker.forceRefreshForTest())
      val refreshObservation = observation()
      rows += row(
        id = "PH18-ADV-REFRESH",
        expectedCode = "completed",
        actualCode = "completed",
        expectedCalls = 1,
        countedOperations = arrayOf("forceRefreshForTest"),
        connectionState = "connected",
        syncState = "success",
        sessionDigest = sessionDigest(),
        generationBefore = refreshGeneration,
        generationAfter = lifecycle.worker.generationForTest(),
        observation = refreshObservation,
        retainedFacts = retainedFacts,
        startedAt = refreshStarted,
      )

      configure("PH18-ADV-READ")
      val readStarted = now()
      val readGeneration = lifecycle.worker.generationForTest()
      val readOutcome = sync(lifecycle.worker, 1)
      val readObservation = observation()
      rows += row(
        id = "PH18-ADV-READ",
        expectedCode = "completed",
        actualCode = readOutcome.code,
        expectedCalls = 4,
        countedOperations = READ_OPERATIONS,
        connectionState = "connected",
        syncState = readOutcome.syncState,
        sessionDigest = sessionDigest(),
        generationBefore = readGeneration,
        generationAfter = lifecycle.worker.generationForTest(),
        observation = readObservation,
        retainedFacts = retainedFacts,
        startedAt = readStarted,
      )

      configure("PH18-ADV-LOGOUT")
      val logoutStarted = now()
      val generationBeforeLogout = lifecycle.worker.generationForTest()
      successData(lifecycle.worker.logout())
      val logoutObservation = observation()
      val absentDigest = sessionDigest()
      rows += row(
        id = "PH18-ADV-LOGOUT",
        expectedCode = "completed",
        actualCode = "completed",
        expectedCalls = 1,
        countedOperations = arrayOf("logout"),
        connectionState = "disconnected",
        syncState = "idle",
        sessionDigest = absentDigest,
        generationBefore = generationBeforeLogout,
        generationAfter = lifecycle.worker.generationForTest(),
        observation = logoutObservation,
        retainedFacts = retainedFacts,
        startedAt = logoutStarted,
      )

      configure("PH18-ADV-RESTART")
      val restartStarted = now()
      val restarted = GarminClientWorker(dispatcher, sessionStore)
      val restartState = successData(restarted.connectionState())
      val restartObservation = observation()
      val restartGeneration = restarted.generationForTest()
      rows += row(
        id = "PH18-ADV-RESTART",
        expectedCode = "sign_in_required",
        actualCode = if (restartState["kind"] == "disconnected") "sign_in_required" else "temporary_failure",
        expectedCalls = 1,
        countedOperations = arrayOf("connectionState"),
        connectionState = "sign-in-required",
        syncState = "idle",
        sessionDigest = sessionDigest(),
        generationBefore = restartGeneration,
        generationAfter = restartGeneration,
        observation = restartObservation,
        retainedFacts = retainedFacts,
        startedAt = restartStarted,
      )

      val late = seedAndRestore()
      configure("PH18-ADV-LATE-GENERATION")
      val lateStarted = now()
      val executor = Executors.newSingleThreadExecutor()
      val delayed = executor.submit<Map<String, Any?>> { late.worker.getActivities(0, 1) }
      try {
        val started = successData(control("awaitLateStart"))["started"] == true
        if (!started) throw GarminWorkerException("temporary_failure")
        val generationBeforeLateLogout = late.worker.generationForTest()
        successData(late.worker.logout())
        successData(control("releaseLate"))
        val delayedCode = errorCode(delayed.get(2, TimeUnit.SECONDS))
        val lateObservation = observation()
        rows += row(
          id = "PH18-ADV-LATE-GENERATION",
          expectedCode = "stale_generation",
          actualCode = delayedCode,
          expectedCalls = 1,
          countedOperations = arrayOf("getActivities"),
          connectionState = "disconnected",
          syncState = "failure-${delayedCode.replace('_', '-')}",
          sessionDigest = sessionDigest(),
          generationBefore = generationBeforeLateLogout,
          generationAfter = late.worker.generationForTest(),
          observation = lateObservation,
          retainedFacts = retainedFacts,
          startedAt = lateStarted,
        )
      } finally {
        runCatching { control("releaseLate") }
        executor.shutdownNow()
      }

      val injected = seedAndRestore()
      for ((caseId, expectedCode) in INJECTED_CASES) {
        configure(caseId)
        val startedAt = now()
        val generationBefore = injected.worker.generationForTest()
        if (caseId == "PH18-ADV-ROTATION") interruptRotation()
        val outcome = sync(injected.worker, if (caseId == "PH18-ADV-PARTIAL-PAGE") 2 else 1)
        val injectedObservation = observation()
        val expectedCalls = INJECTED_EXPECTED_CALLS[caseId] ?: 1
        rows += row(
          id = caseId,
          expectedCode = expectedCode,
          actualCode = outcome.code,
          expectedCalls = expectedCalls,
          countedOperations = READ_OPERATIONS,
          connectionState = "connected",
          syncState = outcome.syncState,
          sessionDigest = sessionDigest(),
          generationBefore = generationBefore,
          generationAfter = injected.worker.generationForTest(),
          observation = injectedObservation,
          retainedFacts = retainedFacts,
          startedAt = startedAt,
          retryAfterMs = outcome.retryAfterMs,
        )
      }
    } catch (_: Throwable) {
      while (rows.size < ADVERSARIAL_CASE_IDS.size) {
        rows += unexpectedRow(ADVERSARIAL_CASE_IDS[rows.size], retainedFacts)
      }
    } finally {
      runCatching { control("finish") }
      runCatching { sessionStore.clear() }
    }
    val relationshipsValid = digestAndGenerationRelationshipsValid(rows)
    val finalRows = if (relationshipsValid) rows else rows.map(::unexpectedCopy)
    return mapOf(
      "schema_version" to 1,
      "suite" to "phase18-garmin-adversarial",
      "status" to if (finalRows.all { it["status"] == "passed" }) "passed" else "TECHNICAL_REVIEW_REQUIRED",
      "cases" to finalRows,
    )
  }

  private fun seedAndRestore(): RestoredSession {
    sessionStore.clear()
    val startedAt = now()
    successData(control("start"))
    val tokenBytes = dispatcher.takePersistableTokens()
      ?: throw GarminWorkerException("temporary_failure")
    try {
      sessionStore.replace(tokenBytes)
    } finally {
      tokenBytes.fill(0)
    }
    successData(control("reset"))
    configure("PH18-ADV-RESTORE")
    val worker = GarminClientWorker(dispatcher, sessionStore)
    val restored = successData(worker.restoreSession())
    if (restored["kind"] != "connected") throw GarminWorkerException("temporary_failure")
    return RestoredSession(worker, observation(), startedAt)
  }

  private fun configure(caseId: String) {
    successData(control("configure", caseId))
  }

  private fun control(action: String, caseId: String? = null): Map<String, Any?> {
    val arguments = mutableMapOf<String, Any>(
      "confirmation" to ADVERSARIAL_CONFIRMATION,
      "action" to action,
    )
    if (caseId != null) arguments["caseId"] = caseId
    return dispatcher.dispatch("runAdversarialSuite", arguments)
  }

  private fun observation(): Observation {
    val data = successData(control("observe"))
    val rawCounts = data["operation_counts"] as? Map<*, *>
      ?: throw GarminWorkerException("malformed_response")
    val counts = rawCounts.entries.associate { (key, value) ->
      val name = key as? String ?: throw GarminWorkerException("malformed_response")
      val count = (value as? Number)?.toInt() ?: throw GarminWorkerException("malformed_response")
      name to count
    }
    return Observation(
      counts = counts,
      automaticRetryCount = (data["automatic_retry_count"] as? Number)?.toInt()
        ?: throw GarminWorkerException("malformed_response"),
      sourceWriteCount = (data["source_write_count"] as? Number)?.toInt()
        ?: throw GarminWorkerException("malformed_response"),
      facts = Facts(
        history = digest(data["history_digest"]),
        source = digest(data["source_digest"]),
        match = digest(data["match_digest"]),
      ),
    )
  }

  private fun sync(worker: GarminClientWorker, limit: Int): SyncOutcome {
    var completed = 0
    return try {
      val page = successData(worker.getActivities(0, limit))
      val items = page["items"] as? List<*> ?: throw SuiteFailure("malformed_response")
      for (item in items) {
        val summary = item as? Map<*, *> ?: throw SuiteFailure("malformed_response")
        val identifier = when (val value = summary["activityId"]) {
          is Number -> value.toLong().toString()
          is String -> value
          else -> throw SuiteFailure("malformed_response")
        }
        successValue(worker.getActivity(identifier))
        successValue(worker.getActivitySplits(identifier))
        successValue(worker.getActivityDetails(identifier))
        completed += 1
      }
      SyncOutcome("completed", "success", 0L)
    } catch (failure: SuiteFailure) {
      val kind = if (completed > 0) "partial" else "failure"
      SyncOutcome(failure.code, "$kind-${failure.code.replace('_', '-')}", failure.retryAfterMs)
    } catch (_: GarminTokenStoreException) {
      SyncOutcome("stale_generation", "failure-stale-generation", 0L)
    }
  }

  private fun successData(result: Map<String, Any?>): Map<*, *> {
    val value = successValue(result)
    return value as? Map<*, *> ?: throw SuiteFailure("malformed_response")
  }

  private fun successValue(result: Map<String, Any?>): Any {
    if (result["status"] == "error") {
      val detail = result["error"] as? Map<*, *> ?: throw SuiteFailure("malformed_response")
      val code = detail["code"] as? String ?: throw SuiteFailure("malformed_response")
      val retryAfterMs = (detail["retryAfterMs"] as? Number)?.toLong() ?: 0L
      throw SuiteFailure(code, retryAfterMs)
    }
    if (result["status"] != "ok") throw SuiteFailure("malformed_response")
    return result["data"] ?: throw SuiteFailure("malformed_response")
  }

  private fun errorCode(result: Map<String, Any?>): String {
    val detail = result["error"] as? Map<*, *> ?: return "temporary_failure"
    return detail["code"] as? String ?: "temporary_failure"
  }

  private fun sessionDigest(): String {
    val identity = sessionStore.recordIdentity()
    val present = identity["present"] == true
    return if (present) digest(identity["sha256"]) else sha256("garmin-session-record-absent-v1")
  }

  private fun digest(value: Any?): String {
    val text = value as? String ?: throw GarminWorkerException("malformed_response")
    if (!text.matches(Regex("^[a-f0-9]{64}$"))) throw GarminWorkerException("malformed_response")
    return text
  }

  private fun row(
    id: String,
    expectedCode: String,
    actualCode: String,
    expectedCalls: Int,
    countedOperations: Array<String>,
    connectionState: String,
    syncState: String,
    sessionDigest: String,
    generationBefore: Long,
    generationAfter: Long,
    observation: Observation,
    retainedFacts: Facts,
    startedAt: Long,
    retryAfterMs: Long = 0L,
  ): Map<String, Any?> {
    val callCount = countedOperations.sumOf { observation.counts[it] ?: 0 }
    val passed = actualCode == expectedCode
      && callCount == expectedCalls
      && observation.automaticRetryCount == 0
      && observation.sourceWriteCount == 0
      && observation.facts == retainedFacts
    return mapOf(
      "id" to id,
      "status" to if (passed) "passed" else "TECHNICAL_REVIEW_REQUIRED",
      "provenance" to if (passed) "native-exact-artifact" else "unexpected",
      "stage" to id.lowercase().removePrefix("ph18-adv-").replace('-', '_'),
      "code" to actualCode,
      "duration_ms" to (now() - startedAt).coerceAtLeast(0L),
      "call_count" to callCount,
      "automatic_retry_count" to observation.automaticRetryCount,
      "retry_after_ms" to retryAfterMs,
      "source_write_count" to observation.sourceWriteCount,
      "connection_state" to connectionState,
      "sync_state" to syncState,
      "session_digest" to sessionDigest,
      "history_digest" to observation.facts.history,
      "source_digest" to observation.facts.source,
      "match_digest" to observation.facts.match,
      "generation_before" to generationBefore,
      "generation_after" to generationAfter,
    )
  }

  private fun unexpectedRow(id: String, facts: Facts): Map<String, Any?> = mapOf(
    "id" to id,
    "status" to "TECHNICAL_REVIEW_REQUIRED",
    "provenance" to "unexpected",
    "stage" to id.lowercase().removePrefix("ph18-adv-").replace('-', '_'),
    "code" to "temporary_failure",
    "duration_ms" to 0L,
    "call_count" to 0,
    "automatic_retry_count" to 0,
    "retry_after_ms" to 0L,
    "source_write_count" to 0,
    "connection_state" to "disconnected",
    "sync_state" to "failure-temporary-failure",
    "session_digest" to sha256("garmin-session-record-unavailable-v1"),
    "history_digest" to facts.history,
    "source_digest" to facts.source,
    "match_digest" to facts.match,
    "generation_before" to 0L,
    "generation_after" to 0L,
  )

  private fun unexpectedCopy(row: Map<String, Any?>): Map<String, Any?> = row + mapOf(
    "status" to "TECHNICAL_REVIEW_REQUIRED",
    "provenance" to "unexpected",
  )

  private fun digestAndGenerationRelationshipsValid(rows: List<Map<String, Any?>>): Boolean {
    if (rows.size != ADVERSARIAL_CASE_IDS.size) return false
    val first = rows.first()
    if (rows.any {
      it["history_digest"] != first["history_digest"]
        || it["source_digest"] != first["source_digest"]
        || it["match_digest"] != first["match_digest"]
    }) return false
    return rows[0]["session_digest"] != rows[1]["session_digest"]
      && rows[1]["session_digest"] == rows[2]["session_digest"]
      && rows[3]["session_digest"] == rows[4]["session_digest"]
      && rows[4]["session_digest"] == rows[5]["session_digest"]
      && rows[2]["session_digest"] != rows[3]["session_digest"]
      && rows.drop(7).all { it["session_digest"] == rows[6]["session_digest"] }
      && (rows[3]["generation_after"] as Long) > (rows[3]["generation_before"] as Long)
      && (rows[5]["generation_after"] as Long) > (rows[5]["generation_before"] as Long)
      && rows.withIndex().all { (index, entry) ->
        index == 3 || index == 5 || entry["generation_after"] == entry["generation_before"]
      }
  }

  private fun fallbackFacts() = Facts(
    history = sha256("history-unavailable-v1"),
    source = sha256("source-unavailable-v1"),
    match = sha256("match-unavailable-v1"),
  )

  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

  private data class Facts(val history: String, val source: String, val match: String)
  private data class Observation(
    val counts: Map<String, Int>,
    val automaticRetryCount: Int,
    val sourceWriteCount: Int,
    val facts: Facts,
  )
  private data class RestoredSession(
    val worker: GarminClientWorker,
    val observation: Observation,
    val startedAt: Long,
  )
  private data class SyncOutcome(val code: String, val syncState: String, val retryAfterMs: Long)
  private class SuiteFailure(val code: String, val retryAfterMs: Long = 0L) : IllegalStateException(code)
}
