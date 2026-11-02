package expo.modules.garminconnect

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.lang.reflect.InvocationTargetException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class GarminTokenStoreTest {
  @get:Rule
  val temporaryFolder = TemporaryFolder()

  @Test
  fun `encrypted record round trips without plaintext and declares Android Keystore`() {
    val root = temporaryFolder.newFolder("no-backup")
    val store = GarminTokenStore(root, JvmAesGcmCipher(), JvmAtomicWriter())
    val tokenBytes = "synthetic-di-session".toByteArray()

    store.replace(tokenBytes)

    assertArrayEquals(tokenBytes, store.read())
    assertFalse(store.recordFileForTest().readBytes().toString(Charsets.UTF_8).contains("synthetic-di-session"))
    assertEquals("AndroidKeyStore", GARMIN_KEYSTORE_PROVIDER)
    assertEquals("AES/GCM/NoPadding", GARMIN_TOKEN_TRANSFORMATION)
  }

  @Test
  fun `Chaquopy dispatcher exposes injected installed bridge results and sanitizes every failure`() {
    var failure: String? = null
    val dispatcher = ChaquopyGarminPythonDispatcher(
      ensurePythonStarted = { if (failure == "start") throw IllegalStateException("unsafe") },
      dispatchBridge = { operation, arguments ->
        if (failure == "dispatch") throw IllegalStateException("unsafe")
        mapOf("operation" to operation, "arguments" to arguments.toMap())
      },
      takeTokens = {
        if (failure == "tokens") throw IllegalStateException("unsafe")
        "opaque".toByteArray()
      },
      rejectionEvidence = {
        if (failure == "rejections") throw IllegalStateException("unsafe")
        mapOf("operation_rejection" to "operation_rejected")
      },
      recoveryEvidence = {
        if (failure == "recovery") throw IllegalStateException("unsafe")
        listOf(mapOf("id" to "fixture"))
      },
    )

    assertEquals("installed-chaquopy", dispatcher.evidenceSource())
    assertEquals(
      mapOf("operation" to "fixture", "arguments" to mapOf("value" to 1)),
      dispatcher.dispatch("fixture", mutableMapOf("value" to 1)),
    )
    assertArrayEquals("opaque".toByteArray(), dispatcher.takePersistableTokens())
    assertEquals(mapOf("operation_rejection" to "operation_rejected"), dispatcher.evidenceRejections())
    assertEquals(listOf(mapOf("id" to "fixture")), dispatcher.evidenceRecoveryExtensions())

    for (edge in listOf("start", "dispatch", "tokens", "rejections", "recovery")) {
      failure = edge
      val error = assertThrows(GarminWorkerException::class.java) {
        when (edge) {
          "start", "dispatch" -> dispatcher.dispatch("fixture", mutableMapOf())
          "tokens" -> dispatcher.takePersistableTokens()
          "rejections" -> dispatcher.evidenceRejections()
          else -> dispatcher.evidenceRecoveryExtensions()
        }
      }
      assertEquals("temporary_failure", error.code)
      assertEquals("temporary_failure", error.message)
    }

  }

  @Test
  fun `Android keystore cipher binding is injectable and maps encryption failures safely`() {
    val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    val cipher = AndroidKeystoreGarminTokenCipher(
      cipherFactory = { Cipher.getInstance(GARMIN_TOKEN_TRANSFORMATION) },
      keyProvider = { key },
    )
    val plaintext = "opaque-session".toByteArray()
    val associatedData = "bound-aad".toByteArray()
    val encrypted = cipher.encrypt(plaintext, associatedData)

    assertArrayEquals(plaintext, cipher.decrypt(encrypted.nonce, encrypted.ciphertext, associatedData))
    assertEquals("garmin_token_encrypt_failed", assertThrows(GarminTokenStoreException::class.java) {
      AndroidKeystoreGarminTokenCipher(
        cipherFactory = { throw IllegalStateException("unsafe") },
        keyProvider = { key },
      ).encrypt(plaintext, associatedData)
    }.code)
    assertEquals("sign_in_required", assertThrows(GarminTokenStoreException::class.java) {
      cipher.decrypt(encrypted.nonce, encrypted.ciphertext, "wrong-aad".toByteArray())
    }.code)
  }

  @Test
  fun `Android atomic writer covers durable replace remove and bounded failure paths`() {
    val root = temporaryFolder.newFolder("android-atomic-writer")
    val target = File(root, "record.bin")
    val synced = mutableListOf<File>()
    val writer = AndroidGarminAtomicWriter(
      renameFile = { source, destination ->
        Files.move(
          source.toPath(),
          destination.toPath(),
          StandardCopyOption.ATOMIC_MOVE,
          StandardCopyOption.REPLACE_EXISTING,
        )
      },
      deleteFile = { Files.deleteIfExists(it.toPath()) },
      syncDirectory = { synced += it },
    )
    val bytes = "durable-record".toByteArray()

    writer.replace(target, bytes) { candidate -> assertArrayEquals(bytes, candidate.readBytes()) }
    assertArrayEquals(bytes, target.readBytes())
    assertEquals(listOf(root), synced)
    writer.remove(target)
    assertFalse(target.exists())
    assertEquals(listOf(root, root, root), synced)
    writer.remove(target)

    val noParent = File("record-without-parent")
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      writer.replace(noParent, bytes) {}
    }.code)
    assertEquals("garmin_token_clear_failed", assertThrows(GarminTokenStoreException::class.java) {
      writer.remove(noParent)
    }.code)

    val parentIsFile = File(root, "not-a-directory").apply { writeText("x") }
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      writer.replace(File(parentIsFile, "record"), bytes) {}
    }.code)
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      writer.replace(File(File(parentIsFile, "missing-parent"), "record"), bytes) {}
    }.code)
    val createdParentTarget = File(File(root, "created-parent"), "record")
    writer.replace(createdParentTarget, bytes) {}
    assertArrayEquals(bytes, createdParentTarget.readBytes())

    val verificationFailure = File(root, "verification.bin")
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      writer.replace(verificationFailure, bytes) {
        throw GarminTokenStoreException("garmin_token_write_failed")
      }
    }.code)
    assertFalse(verificationFailure.exists())

    val renameFailure = AndroidGarminAtomicWriter(
      renameFile = { _, _ -> throw IOException("synthetic") },
      deleteFile = { true },
      syncDirectory = {},
    )
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      renameFailure.replace(File(root, "rename.bin"), bytes) {}
    }.code)
    File(root, "remove-rename.bin").writeBytes(bytes)
    assertEquals("garmin_token_clear_failed", assertThrows(GarminTokenStoreException::class.java) {
      renameFailure.remove(File(root, "remove-rename.bin"))
    }.code)

    val retainedTombstone = File(root, ".retained.bin.deleted").apply { writeBytes(bytes) }
    val retainedWriter = AndroidGarminAtomicWriter(
      renameFile = { _, _ -> throw AssertionError("not reached") },
      deleteFile = { true },
      syncDirectory = {},
    )
    assertEquals("garmin_token_clear_failed", assertThrows(GarminTokenStoreException::class.java) {
      retainedWriter.remove(File(root, "retained.bin"))
    }.code)
    assertTrue(retainedTombstone.exists())

    val recreated = File(root, "recreated.bin").apply { writeBytes(bytes) }
    var syncCount = 0
    val recreatingWriter = AndroidGarminAtomicWriter(
      renameFile = { source, destination ->
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
      },
      deleteFile = { Files.deleteIfExists(it.toPath()) },
      syncDirectory = {
        syncCount += 1
        if (syncCount == 2) recreated.writeBytes(bytes)
      },
    )
    assertEquals("garmin_token_clear_failed", assertThrows(GarminTokenStoreException::class.java) {
      recreatingWriter.remove(recreated)
    }.code)
    assertTrue(recreated.exists())

    val tombstoneRaceTarget = File(root, "tombstone-race.bin").apply { writeBytes(bytes) }
    val tombstoneRace = File(root, ".tombstone-race.bin.deleted")
    syncCount = 0
    val tombstoneRecreatingWriter = AndroidGarminAtomicWriter(
      renameFile = { source, destination ->
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
      },
      deleteFile = { Files.deleteIfExists(it.toPath()) },
      syncDirectory = {
        syncCount += 1
        if (syncCount == 2) tombstoneRace.writeBytes(bytes)
      },
    )
    assertEquals("garmin_token_clear_failed", assertThrows(GarminTokenStoreException::class.java) {
      tombstoneRecreatingWriter.remove(tombstoneRaceTarget)
    }.code)
    assertTrue(tombstoneRace.exists())
  }

  @Test
  fun `corrupt and unsupported records fail closed without exposing record bytes`() {
    val root = temporaryFolder.newFolder("corrupt")
    val store = GarminTokenStore(root, JvmAesGcmCipher(), JvmAtomicWriter())
    store.replace("synthetic-di-session".toByteArray())
    val file = store.recordFileForTest()

    val corrupt = file.readBytes()
    corrupt[corrupt.lastIndex] = (corrupt[corrupt.lastIndex].toInt() + 1).toByte()
    file.writeBytes(corrupt)
    val corruptError = assertThrows(GarminTokenStoreException::class.java) { store.read() }
    assertEquals("sign_in_required", corruptError.code)
    assertEquals("sign_in_required", corruptError.message)

    store.replace("synthetic-di-session".toByteArray())
    val unsupported = file.readBytes()
    unsupported[7] = 2.toByte()
    file.writeBytes(unsupported)
    val unsupportedError = assertThrows(GarminTokenStoreException::class.java) { store.read() }
    assertEquals("sign_in_required", unsupportedError.code)
  }

  @Test
  fun `failed verified rotation leaves the prior record readable`() {
    val root = temporaryFolder.newFolder("rotation")
    val cipher = JvmAesGcmCipher()
    val stable = GarminTokenStore(root, cipher, JvmAtomicWriter())
    stable.replace("old-session".toByteArray())
    val failing = GarminTokenStore(root, cipher, VerifyThenFailWriter())

    val error = assertThrows(GarminTokenStoreException::class.java) {
      failing.replace("new-session".toByteArray())
    }

    assertEquals("garmin_token_write_failed", error.code)
    assertArrayEquals("old-session".toByteArray(), stable.read())
  }

  @Test
  fun `controlled before-commit interruption preserves the prior encrypted record`() {
    val root = temporaryFolder.newFolder("controlled-rotation")
    var interrupt = false
    val store = GarminTokenStore(
      root,
      JvmAesGcmCipher(),
      JvmAtomicWriter(),
      beforeCommit = {
        if (interrupt) throw GarminTokenStoreException("garmin_token_write_failed")
      },
    )
    store.replace("last-valid-session".toByteArray())
    val before = store.recordIdentity()
    interrupt = true

    val error = assertThrows(GarminTokenStoreException::class.java) {
      store.replace("rotated-session".toByteArray())
    }

    assertEquals("garmin_token_write_failed", error.code)
    assertEquals(before, store.recordIdentity())
    assertArrayEquals("last-valid-session".toByteArray(), store.read())
  }

  @Test
  fun `rewriting identical plaintext preserves encrypted record identity`() {
    val root = temporaryFolder.newFolder("stable-identity")
    val store = GarminTokenStore(root, JvmAesGcmCipher(), JvmAtomicWriter())
    store.replace("same-session".toByteArray())
    val before = store.recordIdentity()

    store.replace("same-session".toByteArray())

    assertEquals(before, store.recordIdentity())
  }

  @Test
  fun `clear removes only the encrypted session record`() {
    val root = temporaryFolder.newFolder("clear")
    val store = GarminTokenStore(root, JvmAesGcmCipher(), JvmAtomicWriter())
    store.replace("synthetic-di-session".toByteArray())
    File(root, "unrelated").writeText("history")

    store.clear()

    assertNull(store.read())
    assertEquals("history", File(root, "unrelated").readText())
  }

  @Test
  fun `clear retries a tombstone left by rename success and delete failure`() {
    val root = temporaryFolder.newFolder("clear-tombstone-failure")
    val fileOperations = DeleteFailOnceFileOperations()
    val store = GarminTokenStore(root, JvmAesGcmCipher(), fileOperations.writer())
    store.replace("synthetic-di-session".toByteArray())
    val live = store.recordFileForTest()
    val tombstone = File(root, ".garmin-di-session.bin.deleted")
    fileOperations.syncedDirectories.clear()

    val error = assertThrows(GarminTokenStoreException::class.java) {
      store.clear()
    }

    assertEquals("garmin_token_clear_failed", error.code)
    assertFalse(live.exists())
    assertTrue(tombstone.exists())
    assertTrue(tombstone.length() > 0L)
    assertEquals(listOf(root), fileOperations.syncedDirectories)

    store.clear()

    assertFalse(live.exists())
    assertFalse(tombstone.exists())
    assertEquals(listOf(root, root), fileOperations.syncedDirectories)

    store.clear()
    assertFalse(live.exists())
    assertFalse(tombstone.exists())
    assertEquals(listOf(root, root), fileOperations.syncedDirectories)
  }

  @Test
  fun `clear preserves live and tombstone files when stale tombstone deletion fails then recovers`() {
    val root = temporaryFolder.newFolder("clear-live-and-tombstone")
    val fileOperations = DeleteFailOnceFileOperations()
    val store = GarminTokenStore(root, JvmAesGcmCipher(), fileOperations.writer())
    store.replace("synthetic-di-session".toByteArray())
    val live = store.recordFileForTest()
    val tombstone = File(root, ".garmin-di-session.bin.deleted")
    live.copyTo(tombstone)
    fileOperations.syncedDirectories.clear()

    val error = assertThrows(GarminTokenStoreException::class.java) {
      store.clear()
    }

    assertEquals("garmin_token_clear_failed", error.code)
    assertTrue(live.exists())
    assertTrue(tombstone.exists())
    assertTrue(fileOperations.syncedDirectories.isEmpty())

    store.clear()

    assertFalse(live.exists())
    assertFalse(tombstone.exists())
    assertEquals(listOf(root, root, root), fileOperations.syncedDirectories)
  }

  @Test
  fun `worker persists login and refresh rotations then clears them on fenced logout`() {
    val store = MemorySessionStore()
    val dispatcher = RecordingDispatcher(
      ArrayDeque(
        listOf(
          success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture")),
          success(1, mapOf("activityId" to 42)),
          success(2, mapOf("kind" to "disconnected")),
        )
      )
    )
    dispatcher.pendingTokens = "first-session".toByteArray()
    val worker = GarminClientWorker(dispatcher, store)

    worker.login("owner", "synthetic-secret")
    assertArrayEquals("first-session".toByteArray(), store.value)
    dispatcher.pendingTokens = "rotated-session".toByteArray()
    worker.getActivity("42")
    assertArrayEquals("rotated-session".toByteArray(), store.value)

    worker.logout()

    assertNull(store.value)
    assertEquals(2L, worker.generationForTest())
  }

  @Test
  fun `logout overtakes a delayed read and rejects its pre-logout generation`() {
    val dispatcher = DelayedReadDispatcher()
    val worker = GarminClientWorker(dispatcher, MemorySessionStore())
    worker.login("owner", "synthetic-secret")
    val executor = Executors.newFixedThreadPool(2)
    try {
      val delayed = executor.submit<Map<String, Any?>> { worker.getActivity("42") }
      assertTrue(dispatcher.readStarted.await(1, TimeUnit.SECONDS))
      val logout = executor.submit<Map<String, Any?>> { worker.logout() }

      assertEquals("ok", logout.get(1, TimeUnit.SECONDS)["status"])
      dispatcher.releaseRead.countDown()
      assertEquals("stale_generation", errorCode(delayed.get(1, TimeUnit.SECONDS)))
    } finally {
      dispatcher.releaseRead.countDown()
      executor.shutdownNow()
    }
  }

  @Test
  fun `failed durable deletion keeps the live worker session connected`() {
    val store = MemorySessionStore(failClear = true)
    val dispatcher = RecordingDispatcher(
      ArrayDeque(
        listOf(
          success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture")),
          success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture")),
        )
      )
    )
    dispatcher.pendingTokens = "first-session".toByteArray()
    val worker = GarminClientWorker(dispatcher, store)
    worker.login("owner", "synthetic-secret")

    val error = assertThrows(GarminWorkerException::class.java) { worker.logout() }

    assertEquals("garmin_token_clear_failed", error.code)
    assertEquals(1L, worker.generationForTest())
    assertEquals("connected", (worker.connectionState()["data"] as Map<*, *>)["kind"])
    assertEquals(listOf("login", "connectionState"), dispatcher.calls.map { it.first })
  }

  @Test
  fun `worker logout retry succeeds only after stranded encrypted bytes are deleted`() {
    val root = temporaryFolder.newFolder("worker-logout-tombstone-retry")
    val store = GarminTokenStore(root, JvmAesGcmCipher(), DeleteFailOnceFileOperations().writer())
    val dispatcher = RecordingDispatcher(
      ArrayDeque(
        listOf(
          success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture")),
          success(2, mapOf("kind" to "disconnected")),
        )
      )
    )
    dispatcher.pendingTokens = "first-session".toByteArray()
    val worker = GarminClientWorker(dispatcher, store)
    worker.login("owner", "synthetic-secret")
    val tombstone = File(root, ".garmin-di-session.bin.deleted")

    val first = assertThrows(GarminWorkerException::class.java) { worker.logout() }

    assertEquals("garmin_token_clear_failed", first.code)
    assertTrue(tombstone.exists())
    assertEquals(1L, worker.generationForTest())
    assertEquals(listOf("login"), dispatcher.calls.map { it.first })
    assertTrue(dispatcher.lastReturnedTokens?.all { it == 0.toByte() } == true)

    val retry = worker.logout()

    assertEquals("ok", retry["status"])
    assertEquals(2L, worker.generationForTest())
    assertFalse(store.recordFileForTest().exists())
    assertFalse(tombstone.exists())
    assertEquals(listOf("login", "logout"), dispatcher.calls.map { it.first })
  }

  @Test
  fun `record identity zeroes the encrypted file buffer after hashing`() {
    val root = temporaryFolder.newFolder("identity-buffer-zeroing")
    val cipher = JvmAesGcmCipher()
    GarminTokenStore(root, cipher, JvmAtomicWriter()).replace("synthetic-di-session".toByteArray())
    lateinit var observedBytes: ByteArray
    val store = GarminTokenStore(
      root,
      cipher,
      JvmAtomicWriter(),
      readFileBytes = { file -> file.readBytes().also { observedBytes = it } },
    )

    assertEquals(true, store.recordIdentity()["present"])
    assertTrue(observedBytes.all { it == 0.toByte() })
  }

  @Test
  fun `worker injects decrypted bytes only into restore and persists the verified rotation`() {
    val store = MemorySessionStore("stored-session".toByteArray())
    val dispatcher = RecordingDispatcher(
      ArrayDeque(listOf(success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture"))))
    )
    dispatcher.pendingTokens = "verified-rotation".toByteArray()
    val worker = GarminClientWorker(dispatcher, store)

    worker.restoreSession()

    assertArrayEquals("stored-session".toByteArray(), dispatcher.calls.single().second["tokenPayload"] as ByteArray)
    assertArrayEquals("verified-rotation".toByteArray(), store.value)
  }

  @Test
  fun `explicit refresh proves the encrypted session record rotated`() {
    val store = MemorySessionStore()
    val dispatcher = RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture")),
      success(1, mapOf("kind" to "connected", "account_namespace" to "account-fixture")),
    )))
    dispatcher.pendingTokens = "first-session".toByteArray()
    val worker = GarminClientWorker(dispatcher, store)
    worker.login("owner", "synthetic-secret")
    val before = worker.sessionRecordState()["sha256"]

    dispatcher.pendingTokens = "rotated-session".toByteArray()
    worker.forceRefreshForTest()
    val after = worker.sessionRecordState()["sha256"]

    assertFalse(before == after)
    assertEquals(listOf("login", "forceRefreshForTest"), dispatcher.calls.map { it.first })
  }

  @Test
  fun `worker strips unsafe errors and rejects unsafe success payloads`() {
    val unsafeError = mapOf<String, Any?>(
      "status" to "error",
      "error" to mapOf(
        "code" to "rate_limited",
        "retryAfterMs" to 9_999_999,
        "detail" to "synthetic-secret traceback",
      ),
    )
    val unsafeSuccess = success(
      0,
      mapOf("activityId" to 42, "url" to "https://private.invalid"),
    )
    val dispatcher = RecordingDispatcher(ArrayDeque(listOf(unsafeError, unsafeSuccess)))
    val worker = GarminClientWorker(dispatcher, MemorySessionStore())

    assertEquals(
      mapOf("status" to "error", "error" to mapOf("code" to "rate_limited", "retryAfterMs" to 900_000L)),
      worker.connectionState(),
    )
    assertEquals(
      mapOf("status" to "error", "error" to mapOf("code" to "malformed_response")),
      worker.connectionState(),
    )
  }

  @Test
  fun `token store rejects every malformed bound and reports current record identity`() {
    val root = temporaryFolder.newFolder("token-bounds")
    GarminTokenStore(root)
    val cipher = JvmAesGcmCipher()
    val store = GarminTokenStore(root, cipher, JvmAtomicWriter())
    assertNull(store.read())
    assertEquals(mapOf("present" to false, "version" to 1), store.recordIdentity())

    for (tokens in listOf(byteArrayOf(), ByteArray(65_537))) {
      assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
        store.replace(tokens)
      }.code)
    }
    for (encrypted in listOf(
      EncryptedGarminTokens(ByteArray(11), ByteArray(16)),
      EncryptedGarminTokens(ByteArray(12), ByteArray(15)),
    )) {
      val invalid = GarminTokenStore(root, FixedCipher(encrypted, "unused".toByteArray()), JvmAtomicWriter())
      assertEquals("garmin_token_encrypt_failed", assertThrows(GarminTokenStoreException::class.java) {
        invalid.replace("session".toByteArray())
      }.code)
    }
    val throwing = GarminTokenStore(root, object : GarminTokenCipher {
      override fun encrypt(plaintext: ByteArray, associatedData: ByteArray): EncryptedGarminTokens {
        throw IOException("synthetic")
      }
      override fun decrypt(nonce: ByteArray, ciphertext: ByteArray, associatedData: ByteArray) = byteArrayOf()
    }, JvmAtomicWriter())
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      throwing.replace("session".toByteArray())
    }.code)

    val mismatch = GarminTokenStore(
      root,
      FixedCipher(EncryptedGarminTokens(ByteArray(12), ByteArray(16)), "different".toByteArray()),
      JvmAtomicWriter(),
    )
    assertEquals("garmin_token_write_failed", assertThrows(GarminTokenStoreException::class.java) {
      mismatch.replace("session".toByteArray())
    }.code)

    store.replace("session".toByteArray())
    val identity = store.recordIdentity()
    assertEquals(true, identity["present"])
    assertEquals(64, (identity["sha256"] as String).length)
    val file = store.recordFileForTest()
    val valid = file.readBytes()
    val malformed = listOf<(ByteArray) -> ByteArray>(
      { byteArrayOf(1, 2, 3) },
      { bytes -> bytes.apply { this[0] = 0 } },
      { bytes -> bytes.apply { this[7] = 2 } },
      { bytes -> bytes.apply { this[8] = 11 } },
      { bytes -> bytes.apply { ByteBuffer.wrap(this, 9, 4).putInt(15) } },
      { bytes -> bytes.apply { ByteBuffer.wrap(this, 9, 4).putInt(65_553) } },
      { bytes -> bytes.apply { ByteBuffer.wrap(this, 9, 4).putInt(size - 14) } },
    )
    for (mutate in malformed) {
      file.writeBytes(mutate(valid.copyOf()))
      assertEquals("sign_in_required", assertThrows(GarminTokenStoreException::class.java) {
        store.read()
      }.code)
    }

    file.writeBytes(valid)
    for (plaintext in listOf(byteArrayOf(), ByteArray(65_537))) {
      val invalidPlaintext = GarminTokenStore(
        root,
        FixedCipher(EncryptedGarminTokens(ByteArray(12), ByteArray(16)), plaintext),
        JvmAtomicWriter(),
      )
      assertEquals("sign_in_required", assertThrows(GarminTokenStoreException::class.java) {
        invalidPlaintext.read()
      }.code)
    }
    file.delete()
    file.mkdir()
    assertEquals("sign_in_required", assertThrows(GarminTokenStoreException::class.java) {
      store.read()
    }.code)
  }

  @Test
  fun `MFA challenge never extracts or persists a session before connected completion`() {
    var connected = false
    var extractions = 0
    val token = "opaque-completed-session".toByteArray()
    val dispatcher = object : GarminPythonDispatcher {
      override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
        connected = operation == "resumeMfa"
        return success(1, mapOf("kind" to if (connected) "connected" else "mfa_required"))
      }
      override fun takePersistableTokens(): ByteArray? {
        check(connected) { "challenge_has_no_session" }
        extractions += 1
        return token
      }
    }
    val store = MemorySessionStore()
    val worker = GarminClientWorker(dispatcher, store)
    assertEquals("mfa_required", (worker.login("owner", "synthetic-secret")["data"] as Map<*, *>)["kind"])
    assertEquals(0, extractions)
    assertNull(store.value)
    assertEquals("connected", (worker.resumeMfa("opaque-challenge", "123456")["data"] as Map<*, *>)["kind"])
    assertEquals(1, extractions)
    assertArrayEquals("opaque-completed-session".toByteArray(), store.value)
    assertTrue(token.all { it == 0.toByte() })
  }

  @Test
  fun `login and MFA completion persist only connected results not errors or incomplete successes`() {
    for (result in listOf(
      mapOf<String, Any?>("status" to "error", "error" to mapOf("code" to "mfa_expired")),
      success(1, mapOf("kind" to "mfa_required")),
      success(1, mapOf("kind" to "disconnected")),
      success(1, emptyMap()),
      mapOf("status" to "ok", "generation" to 1, "data" to emptyList<Any>()),
    )) {
      val dispatcher = object : GarminPythonDispatcher {
        override fun dispatch(operation: String, arguments: MutableMap<String, Any>) = result
        override fun takePersistableTokens(): ByteArray? = throw AssertionError("incomplete_session_extraction")
      }
      val worker = GarminClientWorker(dispatcher, MemorySessionStore())
      worker.login("owner", "synthetic-secret")
      worker.resumeMfa("opaque-challenge", "123456")
    }
  }

  @Test
  fun `worker validates MFA restore read and argument boundaries`() {
    val noSession = GarminClientWorker(RecordingDispatcher(ArrayDeque()), MemorySessionStore())
    assertEquals("sign_in_required", errorCode(noSession.restoreSession()))
    assertEquals("sign_in_required", errorCode(noSession.forceRefreshForTest()))
    assertEquals("sign_in_required", errorCode(noSession.getActivity("42")))
    val failedRead = GarminClientWorker(RecordingDispatcher(ArrayDeque()), MemorySessionStore(failRead = true))
    assertEquals("sign_in_required", errorCode(failedRead.restoreSession()))

    for ((email, password) in listOf(
      "" to "secret",
      "x".repeat(255) to "secret",
      "owner" to "",
      "owner" to "x".repeat(1_025),
    )) assertThrows(IllegalArgumentException::class.java) { noSession.login(email, password) }

    for ((handle, code) in listOf(
      "short" to "1234",
      "opaque-challenge" to "abc",
    )) assertThrows(IllegalArgumentException::class.java) { noSession.resumeMfa(handle, code) }

    val mfaDispatcher = RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "mfa_required")),
      success(1, mapOf("kind" to "connected")),
    )))
    val mfa = GarminClientWorker(mfaDispatcher, MemorySessionStore())
    mfa.login("owner", "secret")
    assertEquals("connected", (mfa.resumeMfa("opaque-challenge", "1234")["data"] as Map<*, *>)["kind"])

    val restored = GarminClientWorker(
      RecordingDispatcher(ArrayDeque(listOf(success(1, mapOf("kind" to "connected"))))),
      MemorySessionStore("stored".toByteArray()),
    )
    assertEquals("connected", (restored.restoreSession()["data"] as Map<*, *>)["kind"])

    for ((start, limit) in listOf(-1 to 1, 10_001 to 1, 0 to 0, 0 to 51)) {
      assertThrows(IllegalArgumentException::class.java) { restored.getActivities(start, limit) }
    }
    val reads = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "connected")),
      success(1, emptyMap()),
      success(1, emptyMap()),
      success(1, emptyMap()),
    ))), MemorySessionStore("stored".toByteArray()))
    reads.restoreSession()
    reads.getActivities(0, 1)
    reads.getActivitySplits("42")
    reads.getActivityDetails("42")
    for (identifier in listOf("", "0", "01", "1".repeat(20))) {
      assertThrows(IllegalArgumentException::class.java) { reads.getActivity(identifier) }
    }
  }

  @Test
  fun `native adversarial runner emits sixteen observed lifecycle and injected rows`() {
    val dispatcher = ProtocolAdversarialDispatcher()
    val store = MemorySessionStore()
    var now = 0L
    val runner = GarminAdversarialSuiteRunner(
      dispatcher = dispatcher,
      sessionStore = store,
      interruptRotation = { store.failNextReplace = true },
      now = { ++now },
    )

    val report = runner.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")
    val cases = report["cases"] as List<*>
    val rows = cases.map { it as Map<*, *> }

    assertEquals("passed", report["status"])
    assertEquals(16, rows.size)
    assertEquals(
      listOf(1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3),
      rows.map { it["call_count"] },
    )
    assertEquals(
      listOf(
        "completed", "completed", "completed", "completed", "sign_in_required", "stale_generation",
        "data_access_denied", "rate_limited", "offline", "timeout", "temporary_failure",
        "malformed_response", "malformed_response", "malformed_response", "temporary_failure", "stale_generation",
      ),
      rows.map { it["code"] },
    )
    assertTrue(rows.all { it["status"] == "passed" })
    assertTrue(rows.all { it["provenance"] == "native-exact-artifact" })
    assertTrue(rows.all { it["automatic_retry_count"] == 0 })
    assertTrue(rows.all { "source_write_count" !in it })
    assertTrue(rows.all { "history_digest" !in it && "source_digest" !in it && "match_digest" !in it })
    assertEquals(setOf("activity", "splits", "details"), (report["source_components"] as Map<*, *>).keys)
    assertEquals(900_000L, rows[7]["retry_after_ms"])
    assertTrue(rows.filterIndexed { index, _ -> index != 7 }.all { it["retry_after_ms"] == 0L })

    assertFalse(rows[0]["session_digest"] == rows[1]["session_digest"])
    assertEquals(rows[1]["session_digest"], rows[2]["session_digest"])
    assertEquals(rows[3]["session_digest"], rows[4]["session_digest"])
    assertEquals(rows[4]["session_digest"], rows[5]["session_digest"])
    assertFalse(rows[2]["session_digest"] == rows[3]["session_digest"])
    assertTrue(rows.drop(7).all { it["session_digest"] == rows[6]["session_digest"] })
    assertTrue((rows[3]["generation_after"] as Long) > (rows[3]["generation_before"] as Long))
    assertTrue((rows[5]["generation_after"] as Long) > (rows[5]["generation_before"] as Long))
    assertFalse(store.failNextReplace)
    assertNull(store.value)
    assertFalse(Regex("email|password|credential|raw_json|route|heart_rate|external_activity_id", RegexOption.IGNORE_CASE)
      .containsMatchIn(report.toString()))
  }

  @Test
  fun `unexpected adversarial runtime failure remains technical review required`() {
    val failingDispatcher = object : GarminPythonDispatcher {
      override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
        throw IOException("injected runtime failure")
      }

      override fun takePersistableTokens(): ByteArray? = null
    }
    val runner = GarminAdversarialSuiteRunner(
      dispatcher = failingDispatcher,
      sessionStore = MemorySessionStore(),
      interruptRotation = {},
    )

    val report = runner.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")
    val rows = report["cases"] as List<*>

    assertEquals("TECHNICAL_REVIEW_REQUIRED", report["status"])
    assertEquals(16, rows.size)
    assertTrue(rows.all { (it as Map<*, *>)["status"] == "TECHNICAL_REVIEW_REQUIRED" })
    assertTrue(rows.all { (it as Map<*, *>)["provenance"] == "unexpected" })
    assertThrows(IllegalArgumentException::class.java) { runner.run("wrong") }
  }

  @Test
  fun `adversarial runner rejects malformed controlled observations and results`() {
    val corruptions = listOf<(String, Map<String, Any>, String?, Map<String, Any?>) -> Map<String, Any?>>(
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withData("operation_counts", "invalid")
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withData("operation_counts", mapOf(1 to 1))
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withData("operation_counts", mapOf("restoreSession" to "invalid"))
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withoutData("automatic_retry_count")
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withoutData("source_components")
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withData("source_components", "invalid")
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe") {
          result.withData("source_components", mapOf("activity" to emptyMap<String, Any>()))
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "start") {
          result + ("data" to "invalid")
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          result.withData("items", "invalid")
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          result.withData("items", listOf("invalid"))
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          result.withData("items", listOf(mapOf("activityId" to true)))
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          mapOf("status" to "error", "error" to "invalid")
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          mapOf("status" to "error", "error" to mapOf("code" to 1))
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          mapOf("status" to "unknown")
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          mapOf("status" to "ok", "generation" to 1, "data" to null)
        } else result
      },
      { operation, _, caseId, result ->
        if (operation == "connectionState" && caseId == "PH18-ADV-RESTART") {
          result.withData("kind", "connected")
        } else result
      },
      { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "awaitLateStart") {
          result.withData("started", false)
        } else result
      },
      { operation, _, _, result ->
        if (operation == "restoreSession") result.withData("kind", "mfa_required") else result
      },
      { operation, _, caseId, result ->
        if (operation == "getActivities" && caseId == "PH18-ADV-READ") {
          result.withData("items", listOf(mapOf("activityId" to 424242)))
        } else result
      },
      { operation, arguments, caseId, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe" && caseId == "PH18-ADV-REFRESH") {
          result.withData("operation_counts", mapOf("forceRefreshForTest" to 0))
        } else result
      },
      { operation, arguments, caseId, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe" && caseId == "PH18-ADV-REFRESH") {
          result.withData("automatic_retry_count", 1)
        } else result
      },
      { operation, arguments, caseId, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe" && caseId == "PH18-ADV-REFRESH") {
          result.withData("source_components", mapOf("activity" to emptyMap<String, Any>()))
        } else result
      },
      { operation, arguments, caseId, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "observe" && caseId == "PH18-ADV-REFRESH") {
          result.withData("source_components", mapOf(
            "activity" to emptyMap<String, Any>(),
            "splits" to emptyMap<String, Any>(),
            "details" to emptyMap<String, Any>(),
            "extra" to emptyMap<String, Any>(),
          ))
        } else result
      },
    )
    for (corruption in corruptions) {
      val runner = GarminAdversarialSuiteRunner(
        dispatcher = TransformingAdversarialDispatcher(transform = corruption),
        sessionStore = MemorySessionStore(),
        interruptRotation = {},
      )
      assertEquals("TECHNICAL_REVIEW_REQUIRED", runner.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")["status"])
    }

    val failedRelease = GarminAdversarialSuiteRunner(
      dispatcher = TransformingAdversarialDispatcher(transform = { operation, arguments, _, result ->
        if (operation == "runAdversarialSuite" && arguments["action"] == "releaseLate") {
          throw IOException("controlled release failure")
        }
        result
      }),
      sessionStore = MemorySessionStore(),
      interruptRotation = {},
    )
    assertEquals("TECHNICAL_REVIEW_REQUIRED", failedRelease.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")["status"])

    val failedCleanup = GarminAdversarialSuiteRunner(
      dispatcher = TransformingAdversarialDispatcher(dropTokens = true),
      sessionStore = MemorySessionStore(failClear = true),
      interruptRotation = {},
    )
    assertEquals("TECHNICAL_REVIEW_REQUIRED", failedCleanup.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")["status"])

    val missingTokens = GarminAdversarialSuiteRunner(
      dispatcher = TransformingAdversarialDispatcher(dropTokens = true),
      sessionStore = MemorySessionStore(),
      interruptRotation = {},
    )
    assertEquals("TECHNICAL_REVIEW_REQUIRED", missingTokens.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")["status"])
  }

  @Test
  fun `adversarial runner exercises every defensive relationship and helper branch`() {
    val store = MemorySessionStore()
    val runner = GarminAdversarialSuiteRunner(
      dispatcher = ProtocolAdversarialDispatcher(),
      sessionStore = store,
      interruptRotation = { store.failNextReplace = true },
    )
    val report = runner.run("VERIFY-PHASE18-GARMIN-ADVERSARIAL")
    @Suppress("UNCHECKED_CAST")
    val baseRows = (report["cases"] as List<*>).map { (it as Map<String, Any?>).toMutableMap() }

    val relationships = GarminAdversarialSuiteRunner::class.java
      .getDeclaredMethod("digestAndGenerationRelationshipsValid", List::class.java)
      .apply { isAccessible = true }
    fun valid(rows: List<Map<String, Any?>>) = relationships.invoke(runner, rows) as Boolean
    assertTrue(valid(baseRows))
    assertFalse(valid(baseRows.dropLast(1)))
    val mutations = listOf<(MutableList<MutableMap<String, Any?>>) -> Unit>(
      { it[0]["session_digest"] = it[1]["session_digest"] },
      { it[2]["session_digest"] = "8".repeat(64) },
      { it[3]["session_digest"] = "8".repeat(64) },
      { it[5]["session_digest"] = "8".repeat(64) },
      {
        val shared = it[1]["session_digest"]
        for (index in 1..5) it[index]["session_digest"] = shared
      },
      { it[7]["session_digest"] = "8".repeat(64) },
      { it[3]["generation_after"] = it[3]["generation_before"] },
      { it[5]["generation_after"] = it[5]["generation_before"] },
      { it[0]["generation_after"] = (it[0]["generation_before"] as Long) + 1 },
    )
    for (mutate in mutations) {
      val rows = baseRows.map { it.toMutableMap() }.toMutableList()
      mutate(rows)
      assertFalse(valid(rows))
    }

    fun invoke(name: String, parameter: Class<*>, value: Any?) {
      val method = GarminAdversarialSuiteRunner::class.java.getDeclaredMethod(name, parameter)
        .apply { isAccessible = true }
      assertThrows(InvocationTargetException::class.java) { method.invoke(runner, value) }
    }
    invoke("successData", Map::class.java, mapOf("status" to "ok", "data" to "invalid"))
    invoke("successValue", Map::class.java, mapOf("status" to "error", "error" to "invalid"))
    invoke("successValue", Map::class.java, mapOf("status" to "error", "error" to mapOf("code" to 1)))
    invoke("successValue", Map::class.java, mapOf("status" to "unknown"))
    invoke("successValue", Map::class.java, mapOf("status" to "ok", "data" to null))
    invoke("digest", Any::class.java, 1)
    invoke("digest", Any::class.java, "short")

    val errorCode = GarminAdversarialSuiteRunner::class.java
      .getDeclaredMethod("errorCode", Map::class.java)
      .apply { isAccessible = true }
    assertEquals("temporary_failure", errorCode.invoke(runner, mapOf("error" to "invalid")))
    assertEquals("temporary_failure", errorCode.invoke(runner, mapOf("error" to mapOf("code" to 1))))
  }

  @Test
  fun `worker rejects stale generations and sanitizes every result shape`() {
    val staleConnection = GarminClientWorker(
      RecordingDispatcher(ArrayDeque(listOf(success(2, emptyMap()), success(1, emptyMap())))),
      MemorySessionStore(),
    )
    staleConnection.connectionState()
    assertEquals("stale_generation", assertThrows(GarminWorkerException::class.java) {
      staleConnection.connectionState()
    }.code)

    for (response in listOf<Map<String, Any?>>(
      mapOf("status" to "ok", "data" to emptyMap<String, Any>()),
      mapOf("status" to "ok", "generation" to -1, "data" to emptyMap<String, Any>()),
      mapOf("status" to "ok", "generation" to 1.5, "data" to emptyMap<String, Any>()),
      mapOf("status" to "unknown"),
    )) {
      val worker = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(response))), MemorySessionStore())
      assertEquals("malformed_response", errorCode(worker.connectionState()))
    }

    val staleLogin = GarminClientWorker(
      RecordingDispatcher(ArrayDeque(listOf(success(2, mapOf("kind" to "connected"))))),
      MemorySessionStore(),
    )
    assertEquals("stale_generation", assertThrows(GarminWorkerException::class.java) {
      staleLogin.login("owner", "secret")
    }.code)

    val staleRead = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "connected")),
      success(2, emptyMap()),
    ))), MemorySessionStore())
    staleRead.login("owner", "secret")
    assertEquals("stale_generation", errorCode(staleRead.getActivity("42")))

    val readError = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "connected")),
      mapOf("status" to "error", "error" to mapOf("code" to "temporary_failure")),
    ))), MemorySessionStore())
    readError.login("owner", "secret")
    assertEquals("temporary_failure", errorCode(readError.getActivity("42")))

    for (response in listOf<Map<String, Any?>>(
      mapOf("status" to "error", "error" to mapOf("code" to "invalid_credentials")),
      mapOf("status" to "ok", "generation" to 1, "data" to null),
    )) {
      val worker = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(response))), MemorySessionStore())
      assertEquals(response["status"], worker.login("owner", "secret")["status"])
    }

    val dispatcherFailure = object : GarminPythonDispatcher {
      var workerFailure = true
      override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
        if (workerFailure) throw GarminWorkerException("unsafe")
        throw IOException("unsafe")
      }
      override fun takePersistableTokens(): ByteArray? = null
    }
    val failedWorker = GarminClientWorker(dispatcherFailure, MemorySessionStore())
    assertEquals("temporary_failure", errorCode(failedWorker.connectionState()))
    dispatcherFailure.workerFailure = false
    assertEquals("temporary_failure", errorCode(failedWorker.connectionState()))

    val errors = listOf<Map<String, Any?>>(
      mapOf("status" to "error", "error" to "invalid"),
      mapOf("status" to "error", "error" to mapOf("code" to 42)),
      mapOf("status" to "error", "error" to mapOf("code" to "private")),
      mapOf("status" to "error", "error" to mapOf("code" to "rate_limited")),
      mapOf("status" to "error", "error" to mapOf("code" to "rate_limited", "retryAfterMs" to -1)),
      mapOf("status" to "error", "error" to mapOf("code" to "rate_limited", "retryAfterMs" to 1)),
    )
    for (response in errors) {
      val result = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(response))), MemorySessionStore()).connectionState()
      assertTrue(errorCode(result) in setOf("malformed_response", "temporary_failure", "rate_limited"))
    }

    val safeValues: List<Any?> = listOf(null, true, 1.toByte(), 2.toShort(), 3, 4L, 1.5f, 2.5, "value", listOf(1), mapOf("key" to 1))
    for (value in safeValues) {
      val result = GarminClientWorker(
        RecordingDispatcher(ArrayDeque(listOf(mapOf("status" to "ok", "generation" to 0, "data" to value)))),
        MemorySessionStore(),
      ).connectionState()
      assertEquals("ok", result["status"])
    }
    val unsafeValues: List<Any?> = listOf(
      Float.POSITIVE_INFINITY,
      Float.MAX_VALUE,
      Double.NEGATIVE_INFINITY,
      Double.MAX_VALUE,
      "x".repeat(16_385),
      "https://private.invalid",
      mapOf<Any, Any>(1 to "value"),
      mapOf("" to "value"),
      mapOf("x".repeat(129) to "value"),
      mapOf("token" to "value"),
      Any(),
      nestedList(18),
      List(25_001) { null },
    )
    for (value in unsafeValues) {
      val result = GarminClientWorker(
        RecordingDispatcher(ArrayDeque(listOf(mapOf("status" to "ok", "generation" to 0, "data" to value)))),
        MemorySessionStore(),
      ).connectionState()
      assertEquals("malformed_response", errorCode(result))
    }
  }

  @Test
  fun `worker wipes pending tokens after persistence failures and tolerates logout errors`() {
    val tokenBytes = "pending".toByteArray()
    val dispatcher = RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "connected")),
    )))
    dispatcher.pendingTokens = tokenBytes.copyOf()
    val worker = GarminClientWorker(dispatcher, MemorySessionStore(failReplace = true))
    assertThrows(GarminTokenStoreException::class.java) { worker.login("owner", "secret") }
    assertTrue(dispatcher.lastReturnedTokens?.all { it == 0.toByte() } == true)

    val logout = GarminClientWorker(RecordingDispatcher(ArrayDeque(listOf(
      success(1, mapOf("kind" to "connected")),
      mapOf("status" to "error", "error" to mapOf("code" to "temporary_failure")),
    ))), MemorySessionStore())
    logout.login("owner", "secret")
    assertEquals("ok", logout.logout()["status"])
  }

  private fun success(generation: Int, data: Map<String, Any?>): Map<String, Any?> = mapOf(
    "status" to "ok",
    "generation" to generation,
    "data" to data,
  )

  private fun errorCode(result: Map<String, Any?>): String =
    ((result["error"] as Map<*, *>)["code"] as String)

  private fun nestedList(depth: Int): Any =
    if (depth == 0) "leaf" else listOf(nestedList(depth - 1))
}

private class MemorySessionStore(
  initial: ByteArray? = null,
  private val failClear: Boolean = false,
  private val failRead: Boolean = false,
  private val failReplace: Boolean = false,
) : GarminSessionStore {
  var value: ByteArray? = initial?.copyOf()
  var failNextReplace = false

  override fun read(): ByteArray? {
    if (failRead) throw GarminTokenStoreException("sign_in_required")
    return value?.copyOf()
  }

  override fun replace(tokenBytes: ByteArray) {
    if (value?.contentEquals(tokenBytes) == true) return
    if (failNextReplace) {
      failNextReplace = false
      throw GarminTokenStoreException("garmin_token_write_failed")
    }
    if (failReplace) throw GarminTokenStoreException("garmin_token_write_failed")
    value = tokenBytes.copyOf()
  }

  override fun clear() {
    if (failClear) throw GarminTokenStoreException("garmin_token_clear_failed")
    value?.fill(0)
    value = null
  }

  override fun recordIdentity(): Map<String, Any?> {
    val bytes = value ?: return mapOf("present" to false, "version" to 1)
    val digest = MessageDigest.getInstance("SHA-256")
      .digest(bytes)
      .joinToString("") { byte -> "%02x".format(byte) }
    return mapOf("present" to true, "version" to 1, "sha256" to digest)
  }
}

private class ProtocolAdversarialDispatcher : GarminPythonDispatcher {
  private var generation = 0L
  private var configuredCase = "PH18-ADV-RESTORE"
  private var tokenGeneration = 1
  private var pendingTokens: ByteArray? = null
  private var lateStarted = CountDownLatch(1)
  private var releaseLate = CountDownLatch(1)
  private val operationCounts = linkedMapOf<String, Int>()
  private val sourceComponents = mapOf(
    "source_components" to mapOf(
      "activity" to mapOf(
        "activityId" to 424242,
        "activityTypeDTO" to mapOf("typeKey" to "running"),
        "summaryDTO" to mapOf(
          "startTimeGMT" to "2026-10-05T23:30:00.000Z",
          "distance" to 5_000,
          "duration" to 1_500,
          "elapsedDuration" to 1_560,
          "movingDuration" to 1_475,
        ),
      ),
      "splits" to mapOf("lapDTOs" to emptyList<Any>()),
      "details" to mapOf(
        "metricDescriptors" to emptyList<Any>(),
        "activityDetailMetrics" to emptyList<Any>(),
      ),
    ),
  )

  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
    if (operation == "runAdversarialSuite") return control(arguments)
    operationCounts[operation] = (operationCounts[operation] ?: 0) + 1
    return when (operation) {
      "restoreSession" -> {
        generation += 1
        pendingTokens = tokenBytes()
        success(mapOf("kind" to "connected", "account_namespace" to "garmin:fixture"))
      }
      "forceRefreshForTest" -> {
        tokenGeneration += 1
        pendingTokens = tokenBytes()
        success(mapOf("kind" to "connected", "account_namespace" to "garmin:fixture"))
      }
      "connectionState" -> success(mapOf("kind" to "disconnected"))
      "logout" -> {
        generation += 1
        pendingTokens = null
        success(mapOf("kind" to "disconnected"))
      }
      "getActivities" -> activities(arguments)
      "getActivity" -> activity(arguments)
      "getActivitySplits" -> splits()
      "getActivityDetails" -> success(mapOf("metricDescriptors" to emptyList<Any>(), "activityDetailMetrics" to emptyList<Any>()))
      else -> throw AssertionError("unexpected operation")
    }
  }

  override fun takePersistableTokens(): ByteArray? = pendingTokens?.copyOf().also {
    pendingTokens?.fill(0)
    pendingTokens = null
  }

  private fun control(arguments: Map<String, Any>): Map<String, Any?> = when (arguments["action"]) {
    "start" -> {
      generation = 0
      configuredCase = "PH18-ADV-RESTORE"
      tokenGeneration = 1
      pendingTokens = tokenBytes()
      operationCounts.clear()
      success(mapOf("kind" to "prepared") + sourceComponents)
    }
    "reset" -> {
      generation = 0
      success(mapOf("kind" to "reset"))
    }
    "configure" -> {
      configuredCase = arguments["caseId"] as String
      operationCounts.clear()
      lateStarted = CountDownLatch(1)
      releaseLate = CountDownLatch(1)
      success(mapOf("kind" to "configured"))
    }
    "observe" -> success(mapOf(
      "operation_counts" to operationCounts.toMap(),
      "automatic_retry_count" to 0,
    ) + sourceComponents)
    "awaitLateStart" -> success(mapOf("started" to lateStarted.await(2, TimeUnit.SECONDS)))
    "releaseLate" -> {
      releaseLate.countDown()
      success(mapOf("released" to true))
    }
    "finish" -> {
      releaseLate.countDown()
      success(mapOf("kind" to "finished"))
    }
    else -> throw AssertionError("unexpected control")
  }

  private fun activities(arguments: Map<String, Any>): Map<String, Any?> = when (configuredCase) {
    "PH18-ADV-403" -> failure("data_access_denied")
    "PH18-ADV-429" -> failure("rate_limited", 900_000L)
    "PH18-ADV-OFFLINE" -> failure("offline")
    "PH18-ADV-TIMEOUT" -> failure("timeout")
    "PH18-ADV-5XX" -> failure("temporary_failure")
    "PH18-ADV-MALFORMED", "PH18-ADV-OVERSIZED" -> failure("malformed_response")
    "PH18-ADV-LATE-GENERATION" -> {
      val startedGeneration = generation
      lateStarted.countDown()
      releaseLate.await(2, TimeUnit.SECONDS)
      mapOf(
        "status" to "ok",
        "generation" to startedGeneration,
        "data" to mapOf("items" to listOf(discovery("424242"))),
      )
    }
    "PH18-ADV-PARTIAL-PAGE" -> success(mapOf("items" to listOf(discovery("424242"), discovery("424243"))))
    else -> success(mapOf("items" to listOf(discovery("424242"))))
  }

  private fun activity(arguments: Map<String, Any>): Map<String, Any?> {
    if (configuredCase == "PH18-ADV-PARTIAL-PAGE" && arguments["externalActivityId"] == "424243") {
      return failure("temporary_failure")
    }
    pendingTokens = tokenBytes()
    return success(mapOf("activityId" to 424242))
  }

  private fun splits(): Map<String, Any?> {
    if (configuredCase == "PH18-ADV-MISSING-COMPONENT") return success(null)
    if (configuredCase == "PH18-ADV-ROTATION") tokenGeneration += 1
    pendingTokens = tokenBytes()
    return success(mapOf("lapDTOs" to emptyList<Any>()))
  }

  private fun success(data: Any?): Map<String, Any?> = mapOf(
    "status" to "ok",
    "generation" to generation,
    "data" to data,
  )

  private fun failure(code: String, retryAfterMs: Long? = null): Map<String, Any?> = mapOf(
    "status" to "error",
    "error" to mapOf("code" to code) + if (retryAfterMs == null) emptyMap() else mapOf("retryAfterMs" to retryAfterMs),
  )

  private fun discovery(id: String) = mapOf("activityId" to id, "activityType" to mapOf("typeKey" to "running"))

  private fun tokenBytes() = "controlled-session-$tokenGeneration".toByteArray()
}

private class TransformingAdversarialDispatcher(
  private val delegate: ProtocolAdversarialDispatcher = ProtocolAdversarialDispatcher(),
  private val dropTokens: Boolean = false,
  private val transform: (String, Map<String, Any>, String?, Map<String, Any?>) -> Map<String, Any?> =
    { _, _, _, result -> result },
) : GarminPythonDispatcher {
  private var configuredCase: String? = null

  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
    if (operation == "runAdversarialSuite" && arguments["action"] == "configure") {
      configuredCase = arguments["caseId"] as? String
    }
    val result = delegate.dispatch(operation, arguments)
    return transform(operation, arguments, configuredCase, result)
  }

  override fun takePersistableTokens(): ByteArray? =
    if (dropTokens) null else delegate.takePersistableTokens()
}

private fun Map<String, Any?>.withData(key: String, value: Any?): Map<String, Any?> {
  val data = (this["data"] as? Map<*, *>)?.entries?.associate { (entryKey, entryValue) ->
    entryKey as String to entryValue
  }?.toMutableMap() ?: mutableMapOf()
  data[key] = value
  return this + ("data" to data)
}

private fun Map<String, Any?>.withoutData(key: String): Map<String, Any?> {
  val data = (this["data"] as? Map<*, *>)?.entries?.associate { (entryKey, entryValue) ->
    entryKey as String to entryValue
  }?.toMutableMap() ?: mutableMapOf()
  data.remove(key)
  return this + ("data" to data)
}

private class RecordingDispatcher(
  private val responses: ArrayDeque<Map<String, Any?>>,
) : GarminPythonDispatcher {
  val calls = mutableListOf<Pair<String, Map<String, Any>>>()
  var pendingTokens: ByteArray? = null
  var lastReturnedTokens: ByteArray? = null

  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
    calls += operation to arguments.mapValues { (_, value) ->
      if (value is ByteArray) value.copyOf() else value
    }
    return responses.removeFirst()
  }

  override fun takePersistableTokens(): ByteArray? = pendingTokens?.copyOf().also {
    lastReturnedTokens = it
    pendingTokens?.fill(0)
    pendingTokens = null
  }
}

private class DelayedReadDispatcher : GarminPythonDispatcher {
  val readStarted = CountDownLatch(1)
  val releaseRead = CountDownLatch(1)

  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> =
    when (operation) {
      "login" -> mapOf(
        "status" to "ok",
        "generation" to 1,
        "data" to mapOf("kind" to "connected"),
      )
      "getActivity" -> {
        readStarted.countDown()
        releaseRead.await(2, TimeUnit.SECONDS)
        mapOf("status" to "ok", "generation" to 1, "data" to mapOf("activityId" to 42))
      }
      "logout" -> mapOf(
        "status" to "ok",
        "generation" to 2,
        "data" to mapOf("kind" to "disconnected"),
      )
      else -> throw AssertionError("unexpected operation")
    }

  override fun takePersistableTokens(): ByteArray? = null
}

private class FixedCipher(
  private val encrypted: EncryptedGarminTokens,
  private val decrypted: ByteArray,
) : GarminTokenCipher {
  override fun encrypt(plaintext: ByteArray, associatedData: ByteArray) = EncryptedGarminTokens(
    encrypted.nonce.copyOf(),
    encrypted.ciphertext.copyOf(),
  )

  override fun decrypt(nonce: ByteArray, ciphertext: ByteArray, associatedData: ByteArray) =
    decrypted.copyOf()
}

private class JvmAtomicWriter : GarminAtomicWriter {
  override fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit) {
    target.parentFile?.mkdirs()
    val temporary = File.createTempFile(".garmin-di-", ".tmp", target.parentFile)
    try {
      FileOutputStream(temporary).use { output ->
        output.write(bytes)
        output.fd.sync()
      }
      verify(temporary)
      Files.move(
        temporary.toPath(),
        target.toPath(),
        StandardCopyOption.ATOMIC_MOVE,
        StandardCopyOption.REPLACE_EXISTING,
      )
    } finally {
      temporary.delete()
    }
  }

  override fun remove(target: File) {
    if (!target.exists()) return
    val tombstone = File(target.parentFile, ".${target.name}.deleted")
    Files.move(target.toPath(), tombstone.toPath(), StandardCopyOption.ATOMIC_MOVE)
    Files.deleteIfExists(tombstone.toPath())
  }
}

private class VerifyThenFailWriter : GarminAtomicWriter {
  override fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit) {
    val temporary = File(target.parentFile, "rotation-test.tmp")
    try {
      FileOutputStream(temporary).use { output ->
        output.write(bytes)
        output.fd.sync()
      }
      verify(temporary)
      throw IOException("synthetic write interruption")
    } finally {
      temporary.delete()
    }
  }

  override fun remove(target: File) = JvmAtomicWriter().remove(target)
}

private class DeleteFailOnceFileOperations {
  private var failNextDelete = true
  val syncedDirectories = mutableListOf<File>()

  fun writer() = AndroidGarminAtomicWriter(
    renameFile = { source, destination ->
      Files.move(
        source.toPath(),
        destination.toPath(),
        StandardCopyOption.ATOMIC_MOVE,
        StandardCopyOption.REPLACE_EXISTING,
      )
    },
    deleteFile = { target ->
      if (failNextDelete) {
        failNextDelete = false
        false
      } else {
        Files.deleteIfExists(target.toPath())
      }
    },
    syncDirectory = { directory -> syncedDirectories += directory },
  )
}

private class JvmAesGcmCipher : GarminTokenCipher {
  private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

  override fun encrypt(plaintext: ByteArray, associatedData: ByteArray): EncryptedGarminTokens {
    val cipher = Cipher.getInstance(GARMIN_TOKEN_TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key)
    cipher.updateAAD(associatedData)
    return EncryptedGarminTokens(cipher.iv, cipher.doFinal(plaintext))
  }

  override fun decrypt(nonce: ByteArray, ciphertext: ByteArray, associatedData: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(GARMIN_TOKEN_TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, nonce))
    cipher.updateAAD(associatedData)
    return cipher.doFinal(ciphertext)
  }
}
