package expo.modules.garminconnect

import java.io.File
import java.io.OutputStreamWriter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class GarminConnectModuleTest {
  @Test
  fun `Kotlin device identity equals the source-owned JavaScript canonical vectors`() {
    val vectors = listOf(
      listOf("emulator-5554", "arm64-v8a", "36", "sdk_gphone64_arm64"),
      listOf("R5CR30-quoted\\\"", "x86_64", "100", "Pixel \\ ☃"),
      listOf("escapes-\"\\\b\u000C\t\u0001-ok", "arm64-v8a", "36", "model"),
    )

    for ((serial, abi, apiLevel, model) in vectors) {
      assertEquals(
        javascriptIdentity(serial, abi, apiLevel, model),
        phase18DeviceIdentitySha256(serial, abi, apiLevel, model),
      )
    }
  }

  @Test
  fun `Kotlin device identity rejects malformed facts and covers every JSON escape`() {
    val invalid = listOf(
      listOf("bad\nserial", "arm64-v8a", "36", "model"),
      listOf("serial", "", "36", "model"),
      listOf("serial", "arm64-v8a", "36", "bad\u0000model"),
      listOf("serial", "arm64-v8a", "9", "model"),
      listOf("serial", "arm64-v8a", "1000", "model"),
      listOf("serial", "arm64-v8a", "xx", "model"),
      listOf("x".repeat(513), "arm64-v8a", "36", "model"),
    )
    for ((serial, abi, apiLevel, model) in invalid) {
      assertEquals("phase18_device_identity_invalid", assertThrows(IllegalArgumentException::class.java) {
        phase18DeviceIdentitySha256(serial, abi, apiLevel, model)
      }.message)
    }
  }

  @Test
  fun `Garmin evidence route requires the exact devtest package scheme and host`() {
    requireGarminEvidenceRoute(
      "com.fchoo.gymtracker.devtest",
      "gymtracker-devtest",
      "__v12-production-garmin",
    )
    for ((packageName, scheme, host) in listOf(
      listOf(null, "gymtracker-devtest", "__v12-production-garmin"),
      listOf("com.fchoo.gymtracker", "gymtracker-devtest", "__v12-production-garmin"),
      listOf("com.fchoo.gymtracker.devtest", null, "__v12-production-garmin"),
      listOf("com.fchoo.gymtracker.devtest", "wrong", "__v12-production-garmin"),
      listOf("com.fchoo.gymtracker.devtest", "gymtracker-devtest", null),
      listOf("com.fchoo.gymtracker.devtest", "gymtracker-devtest", "wrong"),
    )) {
      assertEquals("garmin_operation_rejected", assertThrows(IllegalArgumentException::class.java) {
        requireGarminEvidenceRoute(packageName, scheme, host)
      }.message)
    }
  }

  private fun javascriptIdentity(serial: String, abi: String, apiLevel: String, model: String): String {
    val script = generateSequence(File(System.getProperty("user.dir") ?: ".")) { it.parentFile }
      .map { File(it, "scripts/phase18-device-identity.mjs") }
      .firstOrNull(File::isFile)
      ?: throw AssertionError("phase18-device-identity.mjs not found")
    val process = ProcessBuilder("node", script.absolutePath).start()
    OutputStreamWriter(process.outputStream, Charsets.UTF_8).use { writer ->
      writer.write(listOf(serial, abi, apiLevel, model).joinToString("\n", postfix = "\n"))
    }
    val expected = process.inputStream.bufferedReader().use { it.readText().trim() }
    val error = process.errorStream.bufferedReader().use { it.readText() }
    assertEquals(error, 0, process.waitFor())
    return expected
  }
}
