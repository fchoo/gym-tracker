package expo.modules.garminconnect

import java.io.File
import java.security.MessageDigest

private const val ARM_ROUTE = "v12-production-garmin"
private const val ARM_MAX_BYTES = 2_048
private val ARM_HASH = Regex("^[a-f0-9]{64}$")
private val ARM_NONCE = Regex("^[a-f0-9]{32}$")

internal data class GarminEvidenceArmExpectation(
  val phase: String,
  val nonce: String,
  val runIdSha256: String,
  val deviceIdentitySha256: String,
  val leaseIdSha256: String,
)

internal data class GarminEvidenceAuthorization(
  val phase: String,
  val nonce: String,
  val runIdSha256: String,
  val deviceIdentitySha256: String,
  val leaseIdSha256: String,
  val receiptSha256: String,
)

/**
 * Consumes a host-written, app-private no-backup arm exactly once. The record
 * contains only hashes, a nonce and a deadline. It can never carry account or
 * session material.
 */
internal class GarminEvidenceArmStore(
  root: File,
  private val atomicWriter: GarminAtomicWriter = AndroidGarminAtomicWriter(),
  private val nowMs: () -> Long = System::currentTimeMillis,
) {
  private val recordFile = File(root, "garmin-arm.properties")

  @Synchronized
  fun consume(expected: GarminEvidenceArmExpectation): GarminEvidenceAuthorization {
    val bytes = try {
      if (!recordFile.isFile || recordFile.length() !in 1..ARM_MAX_BYTES.toLong()) fail()
      recordFile.readBytes()
    } catch (_: Throwable) {
      runCatching { atomicWriter.remove(recordFile) }
      fail()
    }
    try {
      // Consumption happens before validation so a malformed or replayed route
      // cannot probe the record more than once.
      atomicWriter.remove(recordFile)
      val text = bytes.toString(Charsets.UTF_8)
      val values = parse(text)
      val expiresAtMs = values["expires_at_ms"]?.toLongOrNull() ?: fail()
      if (values.keys != setOf(
          "schema_version", "route_id", "phase", "nonce", "run_id_sha256",
          "device_identity_sha256", "lease_id_sha256", "expires_at_ms",
        )
        || values["schema_version"] != "1"
        || values["route_id"] != ARM_ROUTE
        || values["phase"] != expected.phase
        || values["nonce"] != expected.nonce
        || values["run_id_sha256"] != expected.runIdSha256
        || values["device_identity_sha256"] != expected.deviceIdentitySha256
        || values["lease_id_sha256"] != expected.leaseIdSha256
        || expected.phase !in setOf("preflight", "execute")
        || !ARM_NONCE.matches(expected.nonce)
        || !listOf(expected.runIdSha256, expected.deviceIdentitySha256, expected.leaseIdSha256).all(ARM_HASH::matches)
        || expiresAtMs < nowMs()
        || expiresAtMs > nowMs() + 10 * 60_000L
      ) fail()
      return GarminEvidenceAuthorization(
        phase = expected.phase,
        nonce = expected.nonce,
        runIdSha256 = expected.runIdSha256,
        deviceIdentitySha256 = expected.deviceIdentitySha256,
        leaseIdSha256 = expected.leaseIdSha256,
        receiptSha256 = sha256(text),
      )
    } catch (error: GarminWorkerException) {
      throw error
    } catch (_: Throwable) {
      fail()
    } finally {
      bytes.fill(0)
    }
  }

  fun clear() {
    atomicWriter.remove(recordFile)
  }

  internal fun recordFileForTest(): File = recordFile

  private fun parse(value: String): Map<String, String> {
    val result = linkedMapOf<String, String>()
    val lines = value.split('\n').filter(String::isNotEmpty)
    if (lines.size != 8) fail()
    for (line in lines) {
      if (line.length > 256 || line.any { it == '\r' || it == '\u0000' }) fail()
      val separator = line.indexOf('=')
      if (separator <= 0 || separator == line.lastIndex || line.indexOf('=', separator + 1) >= 0) fail()
      val key = line.substring(0, separator)
      val child = line.substring(separator + 1)
      if (result.put(key, child) != null) fail()
    }
    return result
  }

  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

  private fun fail(): Nothing = throw GarminWorkerException("operation_rejected")
}
