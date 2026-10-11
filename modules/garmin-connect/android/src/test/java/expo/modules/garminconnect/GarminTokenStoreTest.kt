package expo.modules.garminconnect

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
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
      mapOf("status" to "error", "error" to mapOf("code" to "rate_limited", "retryAfterMs" to 900_000)),
      worker.connectionState(),
    )
    assertEquals(
      mapOf("status" to "error", "error" to mapOf("code" to "malformed_response")),
      worker.connectionState(),
    )
  }

  private fun success(generation: Int, data: Map<String, Any?>): Map<String, Any?> = mapOf(
    "status" to "ok",
    "generation" to generation,
    "data" to data,
  )
}

private class MemorySessionStore(initial: ByteArray? = null) : GarminSessionStore {
  var value: ByteArray? = initial?.copyOf()

  override fun read(): ByteArray? = value?.copyOf()

  override fun replace(tokenBytes: ByteArray) {
    value = tokenBytes.copyOf()
  }

  override fun clear() {
    value?.fill(0)
    value = null
  }
}

private class RecordingDispatcher(
  private val responses: ArrayDeque<Map<String, Any?>>,
) : GarminPythonDispatcher {
  val calls = mutableListOf<Pair<String, Map<String, Any>>>()
  var pendingTokens: ByteArray? = null

  override fun dispatch(operation: String, arguments: MutableMap<String, Any>): Map<String, Any?> {
    calls += operation to arguments.mapValues { (_, value) ->
      if (value is ByteArray) value.copyOf() else value
    }
    return responses.removeFirst()
  }

  override fun takePersistableTokens(): ByteArray? = pendingTokens?.copyOf().also {
    pendingTokens?.fill(0)
    pendingTokens = null
  }
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
