package expo.modules.garminconnect

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
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
    val store = GarminTokenStore(root, JvmAesGcmCipher())
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
    val store = GarminTokenStore(root, JvmAesGcmCipher())
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
    val stable = GarminTokenStore(root, cipher)
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
    val store = GarminTokenStore(root, JvmAesGcmCipher())
    store.replace("synthetic-di-session".toByteArray())
    File(root, "unrelated").writeText("history")

    store.clear()

    assertNull(store.read())
    assertEquals("history", File(root, "unrelated").readText())
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
