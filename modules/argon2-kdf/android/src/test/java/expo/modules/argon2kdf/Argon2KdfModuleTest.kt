package expo.modules.argon2kdf

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class Argon2KdfModuleTest {
  @Test
  fun `RFC 9106 Argon2id version 19 vector matches`() {
    val output = deriveForTest(
      password = ByteArray(32) { 0x01 },
      salt = ByteArray(16) { 0x02 },
      memoryKiB = 32,
      iterations = 3,
      parallelism = 4,
      secret = ByteArray(8) { 0x03 },
      associatedData = ByteArray(12) { 0x04 }
    )

    assertArrayEquals(
      "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659".hexBytes(),
      output.bytes
    )
    assertEquals("argon2id", output.algorithm)
    assertEquals("Bouncy Castle", output.provider)
    assertEquals("1.85.2", output.providerVersion)
  }

  @Test
  fun `OWASP floor vector matches`() {
    val output = deriveForTest(
      password = ByteArray(32) { 0x01 },
      salt = ByteArray(16) { 0x02 },
      memoryKiB = 19_456,
      iterations = 2,
      parallelism = 1
    )

    assertArrayEquals(
      "551d2b516a3d92963b2cd1e8fdc1725129e15824dfb6c8d9bb8a599ffcabfc1c".hexBytes(),
      output.bytes
    )
  }

  @Test
  fun `allows only the bounded calibration matrix`() {
    val calibrated = deriveForTest(
      password = ByteArray(32) { 0x01 },
      salt = ByteArray(16) { 0x02 },
      memoryKiB = 65_536,
      iterations = 4,
      parallelism = 1
    )

    assertEquals(32, calibrated.bytes.size)
    assertEquals(
      "argon2_parameters_out_of_bounds",
      assertThrows(Argon2KdfException::class.java) {
        deriveForTest(
          password = ByteArray(32) { 0x01 },
          salt = ByteArray(16) { 0x02 },
          memoryKiB = 20_000,
          iterations = 2,
          parallelism = 1
        )
      }.code
    )
  }

  @Test
  fun `rejects invalid requests before derivation`() {
    assertEquals(
      "argon2_invalid_version",
      assertThrows(Argon2KdfException::class.java) {
        deriveForTest(
          password = byteArrayOf(1),
          salt = ByteArray(16) { 2 },
          memoryKiB = 19_456,
          iterations = 2,
          parallelism = 1,
          version = 2
        )
      }.code
    )
    assertEquals(
      "argon2_invalid_salt",
      assertThrows(Argon2KdfException::class.java) {
        deriveForTest(
          password = byteArrayOf(1),
          salt = ByteArray(15) { 2 },
          memoryKiB = 19_456,
          iterations = 2,
          parallelism = 1
        )
      }.code
    )
    assertEquals(
      "argon2_parameters_out_of_bounds",
      assertThrows(Argon2KdfException::class.java) {
        deriveForTest(
          password = byteArrayOf(1),
          salt = ByteArray(16) { 2 },
          memoryKiB = 19_457,
          iterations = 2,
          parallelism = 1
        )
      }.code
    )
  }
}

private fun String.hexBytes(): ByteArray =
  chunked(2).map { it.toInt(16).toByte() }.toByteArray()
