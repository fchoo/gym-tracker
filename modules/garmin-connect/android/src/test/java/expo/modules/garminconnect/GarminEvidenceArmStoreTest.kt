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
    val store = GarminEvidenceArmStore(root, JvmArmWriter(), nowMs = { now })
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
    val store = GarminEvidenceArmStore(root, JvmArmWriter(), nowMs = { now })
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

  private fun arm(value: GarminEvidenceArmExpectation, expiresAtMs: Long) = listOf(
    "schema_version=1", "route_id=v12-production-garmin", "phase=${value.phase}",
    "nonce=${value.nonce}", "run_id_sha256=${value.runIdSha256}",
    "device_identity_sha256=${value.deviceIdentitySha256}", "lease_id_sha256=${value.leaseIdSha256}",
    "expires_at_ms=$expiresAtMs",
  ).joinToString("\n", postfix = "\n")
}

private class JvmArmWriter : GarminAtomicWriter {
  override fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit) {
    target.parentFile!!.mkdirs(); target.writeBytes(bytes); verify(target)
  }
  override fun remove(target: File) {
    if (target.exists() && !target.delete()) throw GarminTokenStoreException("garmin_token_clear_failed")
  }
}

private class MemoryEvidenceSessionStore(initial: ByteArray) : GarminSessionStore {
  private var bytes: ByteArray? = initial.copyOf()
  override fun read(): ByteArray? = bytes?.copyOf()
  override fun replace(tokenBytes: ByteArray) { bytes = tokenBytes.copyOf() }
  override fun clear() { bytes?.fill(0); bytes = null }
  override fun recordIdentity(): Map<String, Any?> {
    val value = bytes ?: return mapOf("present" to false, "version" to 1)
    return mapOf("present" to true, "version" to 1, "sha256" to sha(value))
  }
  private fun sha(value: ByteArray) = MessageDigest.getInstance("SHA-256").digest(value)
    .joinToString("") { byte -> "%02x".format(byte) }
}

private class EvidenceDispatcher : GarminPythonDispatcher {
  private var generation = 0L
  private var pending: ByteArray? = null
  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> = when (operation) {
    "restoreSession" -> {
      generation += 1; pending = (arguments["tokenPayload"] as ByteArray).copyOf()
      ok(mapOf("kind" to "connected", "account_namespace" to "garmin:${"a".repeat(32)}"))
    }
    "forceRefreshForTest" -> {
      pending = "session-two".toByteArray(); ok(mapOf("kind" to "connected"))
    }
    "logout" -> { generation += 1; ok(mapOf("kind" to "disconnected")) }
    else -> mapOf("status" to "error", "error" to mapOf("code" to "operation_rejected"))
  }
  override fun takePersistableTokens(): ByteArray? = pending.also { pending = null }
  private fun ok(data: Any) = mapOf("status" to "ok", "generation" to generation, "data" to data)
}
