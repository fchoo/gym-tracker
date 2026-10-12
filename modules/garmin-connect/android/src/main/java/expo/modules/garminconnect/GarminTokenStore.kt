package expo.modules.garminconnect

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.system.Os
import android.system.OsConstants
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal const val GARMIN_KEYSTORE_PROVIDER = "AndroidKeyStore"
internal const val GARMIN_TOKEN_TRANSFORMATION = "AES/GCM/NoPadding"
private const val GARMIN_KEY_ALIAS = "gym_tracker_garmin_di_v1"
private const val RECORD_VERSION = 1
private const val NONCE_BYTES = 12
private const val GCM_TAG_BYTES = 16
private const val MAX_TOKEN_BYTES = 65_536
private val RECORD_MAGIC = byteArrayOf(0x47, 0x54, 0x44, 0x49)
private val RECORD_AAD = "gym-tracker:garmin-di-session:v1".toByteArray(Charsets.UTF_8)

internal class GarminTokenStoreException(
  val code: String
) : IllegalStateException(code)

internal data class EncryptedGarminTokens(
  val nonce: ByteArray,
  val ciphertext: ByteArray
)

internal interface GarminTokenCipher {
  fun encrypt(plaintext: ByteArray, associatedData: ByteArray): EncryptedGarminTokens
  fun decrypt(nonce: ByteArray, ciphertext: ByteArray, associatedData: ByteArray): ByteArray
}

internal interface GarminSessionStore {
  fun read(): ByteArray?
  fun replace(tokenBytes: ByteArray)
  fun clear()
  fun recordIdentity(): Map<String, Any?>
}

internal interface GarminAtomicWriter {
  fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit)
  fun remove(target: File)
}

internal class AndroidGarminAtomicWriter : GarminAtomicWriter {
  override fun replace(target: File, bytes: ByteArray, verify: (File) -> Unit) {
    val parent = target.parentFile ?: throw GarminTokenStoreException("garmin_token_write_failed")
    if ((!parent.exists() && !parent.mkdirs()) || !parent.isDirectory) {
      throw GarminTokenStoreException("garmin_token_write_failed")
    }
    parent.setReadable(true, true)
    parent.setWritable(true, true)
    parent.setExecutable(true, true)
    val temporary = File.createTempFile(".garmin-di-", ".tmp", parent)
    try {
      temporary.setReadable(true, true)
      temporary.setWritable(true, true)
      FileOutputStream(temporary).use { output ->
        output.write(bytes)
        output.fd.sync()
      }
      verify(temporary)
      Os.rename(temporary.absolutePath, target.absolutePath)
      target.setReadable(true, true)
      target.setWritable(true, true)
      fsyncDirectory(parent)
    } catch (error: GarminTokenStoreException) {
      throw error
    } catch (_: Throwable) {
      throw GarminTokenStoreException("garmin_token_write_failed")
    } finally {
      temporary.delete()
    }
  }

  override fun remove(target: File) {
    if (!target.exists()) return
    val parent = target.parentFile ?: throw GarminTokenStoreException("garmin_token_clear_failed")
    val tombstone = File(parent, ".${target.name}.deleted")
    try {
      if (tombstone.exists() && !tombstone.delete()) {
        throw GarminTokenStoreException("garmin_token_clear_failed")
      }
      Os.rename(target.absolutePath, tombstone.absolutePath)
      fsyncDirectory(parent)
      val deleted = !tombstone.exists() || tombstone.delete()
      if (!deleted || tombstone.exists()) {
        throw GarminTokenStoreException("garmin_token_clear_failed")
      }
      fsyncDirectory(parent)
    } catch (error: GarminTokenStoreException) {
      throw error
    } catch (_: Throwable) {
      throw GarminTokenStoreException("garmin_token_clear_failed")
    }
  }

  private fun fsyncDirectory(directory: File) {
    var descriptor: java.io.FileDescriptor? = null
    try {
      descriptor = Os.open(directory.absolutePath, OsConstants.O_RDONLY, 0)
      Os.fsync(descriptor)
    } catch (_: Throwable) {
      throw GarminTokenStoreException("garmin_token_write_failed")
    } finally {
      if (descriptor != null) {
        try {
          Os.close(descriptor)
        } catch (_: Throwable) {
        }
      }
    }
  }
}

internal class AndroidKeystoreGarminTokenCipher : GarminTokenCipher {
  override fun encrypt(plaintext: ByteArray, associatedData: ByteArray): EncryptedGarminTokens {
    return try {
      val cipher = Cipher.getInstance(GARMIN_TOKEN_TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, key())
      cipher.updateAAD(associatedData)
      EncryptedGarminTokens(cipher.iv.copyOf(), cipher.doFinal(plaintext))
    } catch (_: Throwable) {
      throw GarminTokenStoreException("garmin_token_encrypt_failed")
    }
  }

  override fun decrypt(
    nonce: ByteArray,
    ciphertext: ByteArray,
    associatedData: ByteArray
  ): ByteArray {
    return try {
      val cipher = Cipher.getInstance(GARMIN_TOKEN_TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, nonce))
      cipher.updateAAD(associatedData)
      cipher.doFinal(ciphertext)
    } catch (_: Throwable) {
      throw GarminTokenStoreException("sign_in_required")
    }
  }

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance(GARMIN_KEYSTORE_PROVIDER).apply { load(null) }
    (keyStore.getKey(GARMIN_KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, GARMIN_KEYSTORE_PROVIDER)
    generator.init(
      KeyGenParameterSpec.Builder(
        GARMIN_KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return generator.generateKey()
  }
}

internal class GarminTokenStore(
  root: File,
  private val cipher: GarminTokenCipher = AndroidKeystoreGarminTokenCipher(),
  private val atomicWriter: GarminAtomicWriter = AndroidGarminAtomicWriter(),
  private val beforeCommit: () -> Unit = {},
) : GarminSessionStore {
  private val recordFile = File(root, "garmin-di-session.bin")

  override fun read(): ByteArray? {
    if (!recordFile.exists()) return null
    return readRecord(recordFile)
  }

  override fun replace(tokenBytes: ByteArray) {
    if (tokenBytes.isEmpty() || tokenBytes.size > MAX_TOKEN_BYTES) {
      throw GarminTokenStoreException("garmin_token_write_failed")
    }
    val owned = tokenBytes.copyOf()
    var encrypted: EncryptedGarminTokens? = null
    var record: ByteArray? = null
    try {
      if (recordFile.exists()) {
        val existing = try {
          readRecord(recordFile)
        } catch (_: GarminTokenStoreException) {
          null
        }
        try {
          if (existing?.contentEquals(owned) == true) return
        } finally {
          existing?.fill(0)
        }
      }
      encrypted = cipher.encrypt(owned, RECORD_AAD)
      if (encrypted.nonce.size != NONCE_BYTES || encrypted.ciphertext.size < GCM_TAG_BYTES) {
        throw GarminTokenStoreException("garmin_token_encrypt_failed")
      }
      record = encode(encrypted)
      beforeCommit()
      atomicWriter.replace(recordFile, record) { candidate ->
        val verified = readRecord(candidate)
        try {
          if (!verified.contentEquals(owned)) {
            throw GarminTokenStoreException("garmin_token_write_failed")
          }
        } finally {
          verified.fill(0)
        }
      }
    } catch (error: GarminTokenStoreException) {
      throw error
    } catch (_: Throwable) {
      throw GarminTokenStoreException("garmin_token_write_failed")
    } finally {
      owned.fill(0)
      encrypted?.nonce?.fill(0)
      encrypted?.ciphertext?.fill(0)
      record?.fill(0)
    }
  }

  override fun clear() {
    atomicWriter.remove(recordFile)
  }

  override fun recordIdentity(): Map<String, Any?> {
    if (!recordFile.exists()) return mapOf("present" to false, "version" to RECORD_VERSION)
    val digest = MessageDigest.getInstance("SHA-256")
      .digest(recordFile.readBytes())
      .joinToString("") { byte -> "%02x".format(byte) }
    return mapOf("present" to true, "version" to RECORD_VERSION, "sha256" to digest)
  }

  internal fun recordFileForTest(): File = recordFile

  private fun readRecord(file: File): ByteArray {
    return try {
      val bytes = file.readBytes()
      try {
        if (bytes.size < RECORD_MAGIC.size + 4 + 1 + 4 + NONCE_BYTES + GCM_TAG_BYTES) {
          throw GarminTokenStoreException("sign_in_required")
        }
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
          val magic = ByteArray(RECORD_MAGIC.size).also(input::readFully)
          val version = input.readInt()
          val nonceLength = input.readUnsignedByte()
          val ciphertextLength = input.readInt()
          if (
            !magic.contentEquals(RECORD_MAGIC)
            || version != RECORD_VERSION
            || nonceLength != NONCE_BYTES
            || ciphertextLength < GCM_TAG_BYTES
            || ciphertextLength > MAX_TOKEN_BYTES + GCM_TAG_BYTES
            || input.available() != nonceLength + ciphertextLength
          ) {
            throw GarminTokenStoreException("sign_in_required")
          }
          val nonce = ByteArray(nonceLength).also(input::readFully)
          val ciphertext = ByteArray(ciphertextLength).also(input::readFully)
          try {
            val plaintext = cipher.decrypt(nonce, ciphertext, RECORD_AAD)
            if (plaintext.isEmpty() || plaintext.size > MAX_TOKEN_BYTES) {
              plaintext.fill(0)
              throw GarminTokenStoreException("sign_in_required")
            }
            plaintext
          } finally {
            nonce.fill(0)
            ciphertext.fill(0)
          }
        }
      } finally {
        bytes.fill(0)
      }
    } catch (error: GarminTokenStoreException) {
      throw GarminTokenStoreException("sign_in_required")
    } catch (_: Throwable) {
      throw GarminTokenStoreException("sign_in_required")
    }
  }

  private fun encode(encrypted: EncryptedGarminTokens): ByteArray {
    val output = ByteArrayOutputStream()
    DataOutputStream(output).use { data ->
      data.write(RECORD_MAGIC)
      data.writeInt(RECORD_VERSION)
      data.writeByte(encrypted.nonce.size)
      data.writeInt(encrypted.ciphertext.size)
      data.write(encrypted.nonce)
      data.write(encrypted.ciphertext)
    }
    return output.toByteArray()
  }
}
