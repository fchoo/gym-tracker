package expo.modules.garminconnect

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.ByteBuffer
import java.security.MessageDigest
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
    assertThrows(IllegalArgumentException::class.java) { reads.runAdversarialSuite("wrong") }
    val adversarial = GarminClientWorker(
      RecordingDispatcher(ArrayDeque(listOf(success(0, emptyMap())))),
      MemorySessionStore(),
    )
    assertEquals("ok", adversarial.runAdversarialSuite("VERIFY-PHASE18-GARMIN-ADVERSARIAL")["status"])
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

  override fun read(): ByteArray? {
    if (failRead) throw GarminTokenStoreException("sign_in_required")
    return value?.copyOf()
  }

  override fun replace(tokenBytes: ByteArray) {
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
