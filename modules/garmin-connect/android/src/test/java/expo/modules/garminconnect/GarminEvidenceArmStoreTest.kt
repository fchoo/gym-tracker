package expo.modules.garminconnect

import java.io.File
import java.security.MessageDigest
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class GarminEvidenceArmStoreTest {
  @Test
  fun `app private arm is exact one time bounded and contains no credential material`() {
    val root = Files.createTempDirectory("garmin-arm-").toFile()
    val now = 2_000_000L
    val store = GarminEvidenceArmStore(root, TestArmWriter(), nowMs = { now })
    val expected = GarminEvidenceArmExpectation(
      phase = "execute",
      nonce = "a".repeat(32),
      runIdSha256 = "b".repeat(64),
      deviceIdentitySha256 = "c".repeat(64),
      leaseIdSha256 = "d".repeat(64),
    )
    val body = arm(expected, now + 60_000)
    assertFalse(Regex("credential|password|token|secret", RegexOption.IGNORE_CASE).containsMatchIn(body))
    store.recordFileForTest().parentFile!!.mkdirs()
    store.recordFileForTest().writeText(body)

    val authorization = store.consume(expected)
    assertEquals(expected.nonce, authorization.nonce)
    assertTrue(authorization.receiptSha256.matches(Regex("^[a-f0-9]{64}$")))
    assertFalse(store.recordFileForTest().exists())
    assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
      store.consume(expected)
    }.code)
    root.deleteRecursively()
  }

  @Test
  fun `invalid or expired arm is consumed without authorizing a retry`() {
    val root = Files.createTempDirectory("garmin-arm-invalid-").toFile()
    val now = 2_000_000L
    val store = GarminEvidenceArmStore(root, TestArmWriter(), nowMs = { now })
    val expected = GarminEvidenceArmExpectation("preflight", "a".repeat(32), "b".repeat(64), "c".repeat(64), "d".repeat(64))
    store.recordFileForTest().parentFile!!.mkdirs()
    store.recordFileForTest().writeText(arm(expected, now - 1))
    assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
      store.consume(expected)
    }.code)
    assertFalse(store.recordFileForTest().exists())
    root.deleteRecursively()
  }

  @Test
  fun `stored session lifecycle rotates logs out restores and returns hashes only`() {
    val store = MemoryEvidenceSessionStore("session-one".toByteArray())
    val dispatcher = EvidenceDispatcher()
    val report = GarminStoredSessionEvidenceRunner(
      GarminClientWorker(dispatcher, store), dispatcher, store,
    ).run()
    val codes = report["codes"] as Map<*, *>
    assertEquals("test-only", report["evidence_source"])
    assertEquals("rotated", codes["rotation"])
    assertEquals("disconnected", codes["logout"])
    assertEquals("no-backup-encrypted", codes["storage"])
    assertNotEquals(report["before_sha256"], report["refreshed_sha256"])
    assertTrue(store.recordIdentity()["present"] == true)
    assertFalse(report.toString().contains("session-one"))
    assertFalse(report.toString().contains("session-two"))
  }

  @Test
  fun `arm rejects every malformed schema boundary and deletion failure`() {
    val now = 2_000_000L
    val expected = GarminEvidenceArmExpectation("execute", "a".repeat(32), "b".repeat(64), "c".repeat(64), "d".repeat(64))
    val valid = arm(expected, now + 60_000)
    val invalidBodies = listOf(
      "",
      "x".repeat(2_049),
      valid.replace("expires_at_ms=${now + 60_000}", "expires_at_ms=not-a-number"),
      valid.replace("schema_version=1", "schema_version=2"),
      valid.replace("route_id=v12-production-garmin", "route_id=wrong"),
      valid.replace("phase=execute", "phase=preflight"),
      valid.replace("nonce=${expected.nonce}", "nonce=${"e".repeat(32)}"),
      valid.replace("run_id_sha256=${expected.runIdSha256}", "run_id_sha256=${"e".repeat(64)}"),
      valid.replace("device_identity_sha256=${expected.deviceIdentitySha256}", "device_identity_sha256=${"e".repeat(64)}"),
      valid.replace("lease_id_sha256=${expected.leaseIdSha256}", "lease_id_sha256=${"e".repeat(64)}"),
      valid.replace("phase=execute", "phase=invalid"),
      valid.replace("nonce=${expected.nonce}", "nonce=short"),
      valid.replace("run_id_sha256=${expected.runIdSha256}", "run_id_sha256=short"),
      valid.replace("device_identity_sha256=${expected.deviceIdentitySha256}", "device_identity_sha256=short"),
      valid.replace("lease_id_sha256=${expected.leaseIdSha256}", "lease_id_sha256=short"),
      arm(expected, now - 1),
      arm(expected, now + 10 * 60_000L + 1),
      valid.replace("schema_version=1\n", ""),
      valid + "extra=1\n",
      valid.replace("expires_at_ms=${now + 60_000}\n", ""),
      valid.replace("schema_version=1", "${"x".repeat(257)}=1"),
      valid.replace("schema_version=1", "schema_version=1\r"),
      valid.replace("schema_version=1", "schema_version=1\u0000"),
      valid.replace("schema_version=1", "missing-separator"),
      valid.replace("schema_version=1", "schema_version="),
      valid.replace("schema_version=1", "schema_version=1=extra"),
      valid.replace("route_id=v12-production-garmin", "schema_version=1"),
      valid.replace("schema_version=1", "unknown=1"),
    )
    for ((index, body) in invalidBodies.withIndex()) {
      val root = Files.createTempDirectory("garmin-arm-invalid-$index-").toFile()
      val store = GarminEvidenceArmStore(root, TestArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeBytes(body.toByteArray())
      assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
        store.consume(expected)
      }.code)
      assertFalse(store.recordFileForTest().exists())
      root.deleteRecursively()
    }
    val malformedExpectations = listOf(
      expected.copy(phase = "invalid"),
      expected.copy(nonce = "short"),
      expected.copy(runIdSha256 = "short"),
      expected.copy(deviceIdentitySha256 = "short"),
      expected.copy(leaseIdSha256 = "short"),
    )
    for ((index, malformed) in malformedExpectations.withIndex()) {
      val root = Files.createTempDirectory("garmin-arm-expectation-$index-").toFile()
      val store = GarminEvidenceArmStore(root, TestArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(arm(malformed, now + 60_000))
      assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
        store.consume(malformed)
      }.code)
      root.deleteRecursively()
    }

    val removalRoot = Files.createTempDirectory("garmin-arm-remove-").toFile()
    val removalStore = GarminEvidenceArmStore(removalRoot, TestArmWriter(failRemove = true), nowMs = { now })
    removalStore.recordFileForTest().parentFile!!.mkdirs()
    removalStore.recordFileForTest().writeText(valid)
    assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
      removalStore.consume(expected)
    }.code)
    removalRoot.deleteRecursively()

    val readRoot = Files.createTempDirectory("garmin-arm-read-").toFile()
    val readStore = GarminEvidenceArmStore(readRoot, TestArmWriter(), nowMs = { now }, readRecord = { throw java.io.IOException("controlled") })
    readStore.recordFileForTest().parentFile!!.mkdirs()
    readStore.recordFileForTest().writeText(valid)
    assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
      readStore.consume(expected)
    }.code)
    val discardRoot = Files.createTempDirectory("garmin-arm-discard-").toFile()
    val discardStore = GarminEvidenceArmStore(discardRoot, TestArmWriter(failRemove = true), nowMs = { now })
    discardStore.recordFileForTest().parentFile!!.mkdirs()
    discardStore.recordFileForTest().writeBytes(byteArrayOf())
    assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
      discardStore.consume(expected)
    }.code)
    readRoot.deleteRecursively()
    discardRoot.deleteRecursively()
  }

  @Test
  fun `arm clear and default construction leave no authorization state`() {
    val root = Files.createTempDirectory("garmin-arm-clear-").toFile()
    val store = GarminEvidenceArmStore(root, TestArmWriter())
    store.recordFileForTest().parentFile!!.mkdirs()
    store.recordFileForTest().writeText("discard")
    store.clear()
    assertFalse(store.recordFileForTest().exists())
    GarminEvidenceArmStore(Files.createTempDirectory("garmin-arm-default-").toFile()).clear()
    root.deleteRecursively()
  }

  @Test
  fun `stored session lifecycle rejects malformed bridge outcomes and restores bytes`() {
    fun failure(
      store: MemoryEvidenceSessionStore = MemoryEvidenceSessionStore("session-one".toByteArray()),
      dispatcher: EvidenceDispatcher = EvidenceDispatcher(),
    ): GarminWorkerException = assertThrows(GarminWorkerException::class.java) {
      GarminStoredSessionEvidenceRunner(GarminClientWorker(dispatcher, store), dispatcher, store).run()
    }

    assertEquals("sign_in_required", failure(MemoryEvidenceSessionStore(null)).code)
    assertEquals("sign_in_required", failure(MemoryEvidenceSessionStore("session-one".toByteArray(), identityOverride = mapOf("present" to false, "version" to 1))).code)
    assertEquals("sign_in_required", failure(MemoryEvidenceSessionStore("session-one".toByteArray(), identityOverride = mapOf("present" to true, "version" to 2, "sha256" to "a".repeat(64)))).code)
    assertEquals("sign_in_required", failure(MemoryEvidenceSessionStore("session-one".toByteArray(), identityOverride = mapOf("present" to true, "version" to 1))).code)
    assertEquals("sign_in_required", failure(dispatcher = EvidenceDispatcher(transform = { operation, result ->
      if (operation == "restoreSession") result.withData(mapOf("kind" to "connected")) else result
    })).code)
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(transform = { operation, result ->
      if (operation == "forceRefreshForTest") result.withData(mapOf("kind" to "disconnected")) else result
    })).code)
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(refreshTokens = "session-one".toByteArray())).code)
    assertEquals("sign_in_required", failure(MemoryEvidenceSessionStore("session-one".toByteArray(), nullOnReadCall = 3)).code)
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(rejections = mapOf("operation_rejection" to "wrong"))).code)
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(extensions = emptyList())).code)
    assertEquals("temporary_failure", failure(MemoryEvidenceSessionStore("session-one".toByteArray(), keepOnClear = true)).code)
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(secondNamespace = "garmin:${"b".repeat(32)}")).code)
    var restoreCalls = 0
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(transform = { operation, result ->
      if (operation == "restoreSession" && ++restoreCalls == 2) result.withData(mapOf("kind" to "disconnected")) else result
    })).code)
    assertEquals("temporary_failure", failure(dispatcher = EvidenceDispatcher(transform = { operation, result ->
      if (operation == "restoreSession") mapOf("status" to "error", "error" to mapOf("code" to "temporary_failure")) else result
    })).code)
    assertEquals("malformed_response", failure(dispatcher = EvidenceDispatcher(transform = { operation, result ->
      if (operation == "restoreSession") result + ("data" to "invalid") else result
    })).code)
    val recoveringStore = MemoryEvidenceSessionStore("session-one".toByteArray(), failReplaceAt = mutableSetOf(3))
    val recoveringDispatcher = EvidenceDispatcher()
    assertThrows(GarminTokenStoreException::class.java) {
      GarminStoredSessionEvidenceRunner(
        GarminClientWorker(recoveringDispatcher, recoveringStore), recoveringDispatcher, recoveringStore,
      ).run()
    }
    assertTrue(recoveringStore.recordIdentity()["present"] == true)

    val finalRestoreStore = MemoryEvidenceSessionStore(
      "session-one".toByteArray(),
      absentOnIdentityCall = 5,
    )
    val finalRestoreDispatcher = EvidenceDispatcher()
    GarminStoredSessionEvidenceRunner(
      GarminClientWorker(finalRestoreDispatcher, finalRestoreStore),
      finalRestoreDispatcher,
      finalRestoreStore,
    ).run()
    assertTrue(finalRestoreStore.recordIdentity()["present"] == true)
  }

  private fun arm(value: GarminEvidenceArmExpectation, expiresAtMs: Long) = listOf(
    "schema_version=1", "route_id=v12-production-garmin", "phase=${value.phase}",
    "nonce=${value.nonce}", "run_id_sha256=${value.runIdSha256}",
    "device_identity_sha256=${value.deviceIdentitySha256}", "lease_id_sha256=${value.leaseIdSha256}",
    "expires_at_ms=$expiresAtMs",
  ).joinToString("\n", postfix = "\n")
}

private class TestArmWriter(
  private val failRemove: Boolean = false,
) : GarminAtomicWriter {
  override fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit) {
    target.parentFile!!.mkdirs(); target.writeBytes(bytes); verify(target)
  }
  override fun remove(target: File) {
    if (failRemove) throw GarminTokenStoreException("garmin_token_clear_failed")
    if (target.exists() && !target.delete()) throw GarminTokenStoreException("garmin_token_clear_failed")
  }
}

private class MemoryEvidenceSessionStore(
  initial: ByteArray?,
  private val keepOnClear: Boolean = false,
  private val nullOnReadCall: Int? = null,
  private val identityOverride: Map<String, Any?>? = null,
  private val failReplaceAt: MutableSet<Int> = mutableSetOf(),
  private val absentOnIdentityCall: Int? = null,
) : GarminSessionStore {
  private var bytes: ByteArray? = initial?.copyOf()
  private var readCalls = 0
  private var replaceCalls = 0
  private var identityCalls = 0
  override fun read(): ByteArray? {
    readCalls += 1
    if (readCalls == nullOnReadCall) return null
    return bytes?.copyOf()
  }
  override fun replace(tokenBytes: ByteArray) {
    replaceCalls += 1
    if (failReplaceAt.remove(replaceCalls)) {
      bytes?.fill(0); bytes = null
      throw GarminTokenStoreException("garmin_token_write_failed")
    }
    bytes = tokenBytes.copyOf()
  }
  override fun clear() { if (!keepOnClear) { bytes?.fill(0); bytes = null } }
  override fun recordIdentity(): Map<String, Any?> {
    identityCalls += 1
    if (identityCalls == absentOnIdentityCall) return mapOf("present" to false, "version" to 1)
    identityOverride?.let { return it }
    val value = bytes ?: return mapOf("present" to false, "version" to 1)
    return mapOf("present" to true, "version" to 1, "sha256" to sha(value))
  }
  private fun sha(value: ByteArray) = MessageDigest.getInstance("SHA-256").digest(value)
    .joinToString("") { byte -> "%02x".format(byte) }
}

private fun Map<String, Any?>.withData(data: Any): Map<String, Any?> = this + ("data" to data)

private class EvidenceDispatcher(
  private val refreshTokens: ByteArray = "session-two".toByteArray(),
  private val rejections: Map<String, String> = mapOf(
    "operation_rejection" to "operation_rejected",
    "arguments_rejection" to "arguments_rejected",
  ),
  private val extensions: List<Map<String, Any?>> = List(4) { mapOf("id" to "case-$it") },
  private val secondNamespace: String? = null,
  private val transform: (String, Map<String, Any?>) -> Map<String, Any?> = { _, result -> result },
) : GarminPythonDispatcher {
  private var generation = 0L
  private var pending: ByteArray? = null
  private var restoreCalls = 0
  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> = transform(operation, when (operation) {
    "restoreSession" -> {
      restoreCalls += 1
      generation += 1; pending = (arguments["tokenPayload"] as ByteArray).copyOf()
      ok(mapOf("kind" to "connected", "account_namespace" to if (restoreCalls > 1 && secondNamespace != null) secondNamespace else "garmin:${"a".repeat(32)}"))
    }
    "forceRefreshForTest" -> {
      pending = refreshTokens.copyOf(); ok(mapOf("kind" to "connected"))
    }
    "logout" -> { generation += 1; ok(mapOf("kind" to "disconnected")) }
    else -> mapOf("status" to "error", "error" to mapOf("code" to "operation_rejected"))
  })
  override fun takePersistableTokens(): ByteArray? = pending.also { pending = null }
  override fun evidenceRejections(): Map<String, String> = rejections
  override fun evidenceRecoveryExtensions(): List<Map<String, Any?>> = extensions
  private fun ok(data: Any) = mapOf("status" to "ok", "generation" to generation, "data" to data)
}
