package expo.modules.garminconnect

import java.io.File
import java.io.OutputStreamWriter
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
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

  @Test
  fun `authorization controller consumes exactly one arm and clears it with derived receipt`() {
    val root = Files.createTempDirectory("garmin-authorization-").toFile()
    try {
      val now = 2_000_000L
      val expected = controllerExpectation("execute")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = { mapOf("result" to "ran") },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )

      val consumed = controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = expected,
      )
      assertEquals(1, consumed["schema_version"])
      assertEquals("arm-consumed", consumed["code"])
      val receipt = consumed["receipt_sha256"] as String
      assertTrue(receipt.matches(Regex("^[a-f0-9]{64}$")))

      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      assertEquals("garmin_operation_rejected", assertThrows(IllegalArgumentException::class.java) {
        controller.consume(
          packageName = "com.fchoo.gymtracker.devtest",
          scheme = "gymtracker-devtest",
          host = "__v12-production-garmin",
          expected = expected,
        )
      }.message)
      assertTrue(store.recordFileForTest().isFile)

      assertEquals(mapOf("result" to "ran"), controller.runStoredSessionLifecycle())
      val completed = controller.complete()
      assertEquals(1, completed["schema_version"])
      assertEquals("arm-cleared", completed["code"])
      assertEquals(sha256("$receipt:cleared"), completed["receipt_sha256"])
      assertFalse(store.recordFileForTest().exists())
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.complete()
      }.message)
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller rejects missing and preflight execution but runs execute phase`() {
    val root = Files.createTempDirectory("garmin-authorization-phase-").toFile()
    try {
      val now = 2_000_000L
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      var sessionRuns = 0
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = {
          sessionRuns += 1
          mapOf("result" to "ran")
        },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )

      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)

      val preflight = controllerExpectation("preflight")
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(preflight, now + 60_000))
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = preflight,
      )
      assertEquals("garmin_operation_rejected", assertThrows(IllegalArgumentException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)
      assertEquals(0, sessionRuns)
      controller.complete()

      val execute = controllerExpectation("execute")
      store.recordFileForTest().writeText(controllerArm(execute, now + 60_000))
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = execute,
      )
      assertEquals(mapOf("result" to "ran"), controller.runStoredSessionLifecycle())
      assertEquals(1, sessionRuns)
      controller.complete()
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller rejects invalid routes and failed arm consumption without authorizing`() {
    val root = Files.createTempDirectory("garmin-authorization-rejection-").toFile()
    try {
      val now = 2_000_000L
      val expected = controllerExpectation("execute")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = { mapOf("result" to "ran") },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )

      assertEquals("garmin_operation_rejected", assertThrows(IllegalArgumentException::class.java) {
        controller.consume(
          packageName = "com.fchoo.gymtracker",
          scheme = "gymtracker-devtest",
          host = "__v12-production-garmin",
          expected = expected,
        )
      }.message)
      assertTrue(store.recordFileForTest().isFile)

      store.recordFileForTest().delete()
      assertEquals("operation_rejected", assertThrows(GarminWorkerException::class.java) {
        controller.consume(
          packageName = "com.fchoo.gymtracker.devtest",
          scheme = "gymtracker-devtest",
          host = "__v12-production-garmin",
          expected = expected,
        )
      }.code)
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)

      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = expected,
      )
      controller.runStoredSessionLifecycle()
      controller.complete()
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller consumes lifecycle authorization after one execution`() {
    val root = Files.createTempDirectory("garmin-authorization-replay-").toFile()
    try {
      val now = 2_000_000L
      val expected = controllerExpectation("execute")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      var sessionRuns = 0
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = {
          sessionRuns += 1
          mapOf("result" to "ran")
        },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = expected,
      )

      assertEquals(mapOf("result" to "ran"), controller.runStoredSessionLifecycle())
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)
      assertEquals(1, sessionRuns)
      controller.complete()
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller rejects a concurrent lifecycle execution`() {
    val root = Files.createTempDirectory("garmin-authorization-concurrent-").toFile()
    val releaseRun = CountDownLatch(1)
    val firstRunStarted = CountDownLatch(1)
    val firstFailure = AtomicReference<Throwable?>()
    try {
      val now = 2_000_000L
      val expected = controllerExpectation("execute")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      val sessionRuns = AtomicInteger(0)
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = {
          if (sessionRuns.incrementAndGet() == 1) {
            firstRunStarted.countDown()
            check(releaseRun.await(5, TimeUnit.SECONDS)) { "test_run_release_timeout" }
          }
          mapOf("result" to "ran")
        },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = expected,
      )
      val first = Thread {
        try {
          controller.runStoredSessionLifecycle()
        } catch (error: Throwable) {
          firstFailure.set(error)
        }
      }
      first.start()
      assertTrue(firstRunStarted.await(5, TimeUnit.SECONDS))

      try {
        assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
          controller.runStoredSessionLifecycle()
        }.message)
      } finally {
        releaseRun.countDown()
        first.join(5_000)
      }
      assertFalse(first.isAlive)
      assertEquals(null, firstFailure.get())
      assertEquals(1, sessionRuns.get())
      controller.complete()
    } finally {
      releaseRun.countDown()
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller rejects completion while lifecycle is running`() {
    val root = Files.createTempDirectory("garmin-authorization-running-").toFile()
    val releaseRun = CountDownLatch(1)
    val firstRunStarted = CountDownLatch(1)
    val firstFailure = AtomicReference<Throwable?>()
    try {
      val now = 2_000_000L
      val expected = controllerExpectation("execute")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = {
          firstRunStarted.countDown()
          check(releaseRun.await(5, TimeUnit.SECONDS)) { "test_run_release_timeout" }
          mapOf("result" to "ran")
        },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = expected,
      )
      val first = Thread {
        try {
          controller.runStoredSessionLifecycle()
        } catch (error: Throwable) {
          firstFailure.set(error)
        }
      }
      first.start()
      assertTrue(firstRunStarted.await(5, TimeUnit.SECONDS))

      try {
        assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
          controller.complete()
        }.message)
      } finally {
        releaseRun.countDown()
        first.join(5_000)
      }
      assertFalse(first.isAlive)
      assertEquals(null, firstFailure.get())
      controller.complete()
    } finally {
      releaseRun.countDown()
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller consumes a failed lifecycle without allowing retry`() {
    val root = Files.createTempDirectory("garmin-authorization-failed-run-").toFile()
    try {
      val now = 2_000_000L
      val expected = controllerExpectation("execute")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
      var sessionRuns = 0
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = {
          sessionRuns += 1
          throw IllegalStateException("test_lifecycle_failure")
        },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = expected,
      )

      assertEquals("test_lifecycle_failure", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)
      assertEquals(1, sessionRuns)
      controller.complete()
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller completes preflight without lifecycle but rejects unrun execute`() {
    val root = Files.createTempDirectory("garmin-authorization-completion-phase-").toFile()
    try {
      val now = 2_000_000L
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = { mapOf("result" to "ran") },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )
      val preflight = controllerExpectation("preflight")
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(preflight, now + 60_000))
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = preflight,
      )
      assertEquals("arm-cleared", controller.complete()["code"])

      val execute = controllerExpectation("execute")
      store.recordFileForTest().writeText(controllerArm(execute, now + 60_000))
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = execute,
      )
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.complete()
      }.message)
      controller.runStoredSessionLifecycle()
      controller.complete()
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller binds current route run device lease and deadline at execution`() {
    val root = Files.createTempDirectory("garmin-authorization-execution-identity-").toFile()
    try {
      var now = 2_000_000L
      val expected = controllerExpectation("execute")
      val valid = controllerExecutionIdentity()
      var currentIdentity = valid
      var sessionRuns = 0
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = {
          sessionRuns += 1
          mapOf("result" to "ran")
        },
        executionIdentity = { currentIdentity },
        nowMs = { now },
      )
      val mismatches = listOf(
        GarminEvidenceExecutionIdentity("com.fchoo.gymtracker", valid.scheme, valid.host, valid.runIdSha256, valid.deviceIdentitySha256, valid.leaseIdSha256),
        GarminEvidenceExecutionIdentity(valid.packageName, "wrong", valid.host, valid.runIdSha256, valid.deviceIdentitySha256, valid.leaseIdSha256),
        GarminEvidenceExecutionIdentity(valid.packageName, valid.scheme, "wrong", valid.runIdSha256, valid.deviceIdentitySha256, valid.leaseIdSha256),
        GarminEvidenceExecutionIdentity(valid.packageName, valid.scheme, valid.host, "e".repeat(64), valid.deviceIdentitySha256, valid.leaseIdSha256),
        GarminEvidenceExecutionIdentity(valid.packageName, valid.scheme, valid.host, valid.runIdSha256, "e".repeat(64), valid.leaseIdSha256),
        GarminEvidenceExecutionIdentity(valid.packageName, valid.scheme, valid.host, valid.runIdSha256, valid.deviceIdentitySha256, "e".repeat(64)),
      )

      for (mismatch in mismatches) {
        store.recordFileForTest().parentFile!!.mkdirs()
        store.recordFileForTest().writeText(controllerArm(expected, now + 60_000))
        controller.consume(
          packageName = valid.packageName,
          scheme = valid.scheme,
          host = valid.host,
          expected = expected,
        )
        currentIdentity = mismatch
        assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
          controller.runStoredSessionLifecycle()
        }.message)
        currentIdentity = valid
        assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
          controller.runStoredSessionLifecycle()
        }.message)
        controller.complete()
      }
      assertEquals(0, sessionRuns)

      store.recordFileForTest().writeText(controllerArm(expected, now + 1))
      controller.consume(
        packageName = valid.packageName,
        scheme = valid.scheme,
        host = valid.host,
        expected = expected,
      )
      now += 2
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.runStoredSessionLifecycle()
      }.message)
      assertEquals(0, sessionRuns)
      controller.complete()
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun `authorization controller expires preflight without lifecycle completion receipt`() {
    val root = Files.createTempDirectory("garmin-authorization-preflight-expiry-").toFile()
    try {
      var now = 2_000_000L
      val preflight = controllerExpectation("preflight")
      val store = GarminEvidenceArmStore(root, ControllerArmWriter(), nowMs = { now })
      store.recordFileForTest().parentFile!!.mkdirs()
      store.recordFileForTest().writeText(controllerArm(preflight, now + 1))
      val controller = GarminEvidenceAuthorizationController(
        store,
        sessionRunner = { mapOf("result" to "ran") },
        executionIdentity = ::controllerExecutionIdentity,
        nowMs = { now },
      )
      controller.consume(
        packageName = "com.fchoo.gymtracker.devtest",
        scheme = "gymtracker-devtest",
        host = "__v12-production-garmin",
        expected = preflight,
      )
      now += 2

      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.complete()
      }.message)
      assertFalse(store.recordFileForTest().exists())
      assertEquals("garmin_operation_rejected", assertThrows(IllegalStateException::class.java) {
        controller.complete()
      }.message)
    } finally {
      root.deleteRecursively()
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

  private fun controllerExpectation(phase: String) = GarminEvidenceArmExpectation(
    phase = phase,
    nonce = "a".repeat(32),
    runIdSha256 = "b".repeat(64),
    deviceIdentitySha256 = "c".repeat(64),
    leaseIdSha256 = "d".repeat(64),
  )

  private fun controllerExecutionIdentity() = GarminEvidenceExecutionIdentity(
    packageName = "com.fchoo.gymtracker.devtest",
    scheme = "gymtracker-devtest",
    host = "__v12-production-garmin",
    runIdSha256 = "b".repeat(64),
    deviceIdentitySha256 = "c".repeat(64),
    leaseIdSha256 = "d".repeat(64),
  )

  private fun controllerArm(value: GarminEvidenceArmExpectation, expiresAtMs: Long) = listOf(
    "schema_version=1", "route_id=v12-production-garmin", "phase=${value.phase}",
    "nonce=${value.nonce}", "run_id_sha256=${value.runIdSha256}",
    "device_identity_sha256=${value.deviceIdentitySha256}", "lease_id_sha256=${value.leaseIdSha256}",
    "expires_at_ms=$expiresAtMs",
  ).joinToString("\n", postfix = "\n")

  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }
}

private class ControllerArmWriter : GarminAtomicWriter {
  override fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit) {
    target.parentFile!!.mkdirs()
    target.writeBytes(bytes)
    verify(target)
  }

  override fun remove(target: File) {
    if (target.exists() && !target.delete()) throw GarminTokenStoreException("garmin_token_clear_failed")
  }
}
