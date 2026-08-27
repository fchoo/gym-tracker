package expo.modules.argon2kdf

import android.os.SystemClock
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array
import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters
import java.nio.ByteBuffer

class Argon2KdfException(code: String) :
  CodedException(code, code, null)

data class Argon2KdfTestResult(
  val bytes: ByteArray,
  val algorithm: String,
  val provider: String,
  val providerVersion: String
)

private const val CONTRACT_VERSION = 1
private const val OUTPUT_LENGTH = 32
private const val SALT_LENGTH = 16
private const val OWASP_MEMORY_KIB = 19_456
private const val OWASP_ITERATIONS = 2
private const val OWASP_PARALLELISM = 1
private const val ALGORITHM = "argon2id"
private const val PROVIDER = "Bouncy Castle"
private const val PROVIDER_VERSION = "1.85.2"
private val CALIBRATION_PARAMETERS = setOf(
  Triple(19_456, 2, 1),
  Triple(32_768, 2, 1),
  Triple(65_536, 2, 1),
  Triple(65_536, 3, 1),
  Triple(65_536, 4, 1)
)

internal fun deriveForTest(
  password: ByteArray,
  salt: ByteArray,
  memoryKiB: Int,
  iterations: Int,
  parallelism: Int,
  version: Int = 1,
  secret: ByteArray? = null,
  associatedData: ByteArray? = null
): Argon2KdfTestResult {
  validateRequest(
    version = version,
    passwordSize = password.size,
    saltSize = salt.size,
    memoryKiB = memoryKiB,
    iterations = iterations,
    parallelism = parallelism,
    outputLength = OUTPUT_LENGTH,
    allowRfcVector = secret != null || associatedData != null
  )

  val ownedPassword = password.copyOf()
  val ownedSalt = salt.copyOf()
  val ownedSecret = secret?.copyOf()
  val ownedAssociatedData = associatedData?.copyOf()
  val output = ByteArray(OUTPUT_LENGTH)
  var parameters: Argon2Parameters? = null

  try {
    parameters = try {
      val builder = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
        .withVersion(Argon2Parameters.ARGON2_VERSION_13)
        .withMemoryAsKB(memoryKiB)
        .withIterations(iterations)
        .withParallelism(parallelism)
        .withSalt(ownedSalt)
      ownedSecret?.let(builder::withSecret)
      ownedAssociatedData?.let(builder::withAdditional)
      builder.build()
    } catch (_: Throwable) {
      throw Argon2KdfException("argon2_native_parameters_failed")
    }

    try {
      val generator = Argon2BytesGenerator()
      generator.init(parameters)
      generator.generateBytes(ownedPassword, output)
    } catch (_: Throwable) {
      throw Argon2KdfException("argon2_native_generation_failed")
    }
    return Argon2KdfTestResult(
      bytes = output.copyOf(),
      algorithm = ALGORITHM,
      provider = PROVIDER,
      providerVersion = PROVIDER_VERSION
    )
  } catch (error: Argon2KdfException) {
    throw error
  } finally {
    try {
      parameters?.clear()
    } catch (_: Throwable) {
    }
    ownedPassword.fill(0)
    ownedSalt.fill(0)
    ownedSecret?.fill(0)
    ownedAssociatedData?.fill(0)
    output.fill(0)
  }
}

private fun validateRequest(
  version: Int,
  passwordSize: Int,
  saltSize: Int,
  memoryKiB: Int,
  iterations: Int,
  parallelism: Int,
  outputLength: Int,
  allowRfcVector: Boolean
) {
  if (version != CONTRACT_VERSION) {
    throw Argon2KdfException("argon2_invalid_version")
  }
  if (passwordSize < 1 || passwordSize > 1_024) {
    throw Argon2KdfException("argon2_invalid_password")
  }
  if (saltSize != SALT_LENGTH) {
    throw Argon2KdfException("argon2_invalid_salt")
  }
  val owaspParameters = memoryKiB == OWASP_MEMORY_KIB &&
    iterations == OWASP_ITERATIONS &&
    parallelism == OWASP_PARALLELISM
  val calibrationParameters = !allowRfcVector &&
    CALIBRATION_PARAMETERS.contains(Triple(memoryKiB, iterations, parallelism))
  val rfcParameters = allowRfcVector &&
    memoryKiB == 32 &&
    iterations == 3 &&
    parallelism == 4
  if (
    (!owaspParameters && !calibrationParameters && !rfcParameters) ||
    outputLength != OUTPUT_LENGTH
  ) {
    throw Argon2KdfException("argon2_parameters_out_of_bounds")
  }
}

private fun deriveNative(
  version: Int,
  passwordInput: Uint8Array,
  saltInput: Uint8Array,
  memoryKiB: Int,
  iterations: Int,
  parallelism: Int,
  outputLength: Int
): Map<String, Any> {
  val startedAt = SystemClock.elapsedRealtime()
  validateRequest(
    version = version,
    passwordSize = passwordInput.byteLength,
    saltSize = saltInput.byteLength,
    memoryKiB = memoryKiB,
    iterations = iterations,
    parallelism = parallelism,
    outputLength = outputLength,
    allowRfcVector = false
  )
  val password: ByteArray
  val salt: ByteArray
  try {
    password = ByteArray(passwordInput.byteLength)
    salt = ByteArray(saltInput.byteLength)
    passwordInput.read(password, 0, password.size)
    saltInput.read(salt, 0, salt.size)
  } catch (_: Throwable) {
    throw Argon2KdfException("argon2_native_input_failed")
  }

  try {
    val result = deriveForTest(
      password = password,
      salt = salt,
      memoryKiB = memoryKiB,
      iterations = iterations,
      parallelism = parallelism,
      version = version
    )
    try {
      try {
        val output = ByteBuffer.allocateDirect(result.bytes.size)
        output.apply {
          put(result.bytes)
          rewind()
        }
        return mapOf(
          "version" to CONTRACT_VERSION,
          "algorithm" to result.algorithm,
          "provider" to result.provider,
          "providerVersion" to result.providerVersion,
          "durationMs" to (SystemClock.elapsedRealtime() - startedAt),
          "output" to NativeArrayBuffer.wrap(output)
        )
      } catch (_: Throwable) {
        throw Argon2KdfException("argon2_native_output_failed")
      }
    } finally {
      result.bytes.fill(0)
    }
  } finally {
    password.fill(0)
    salt.fill(0)
  }
}

class Argon2KdfModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Argon2Kdf")

    (AsyncFunction("derive") Coroutine {
        version: Int,
        password: Uint8Array,
        salt: Uint8Array,
        memoryKiB: Int,
        iterations: Int,
        parallelism: Int,
        outputLength: Int ->
      deriveNative(
        version = version,
        passwordInput = password,
        saltInput = salt,
        memoryKiB = memoryKiB,
        iterations = iterations,
        parallelism = parallelism,
        outputLength = outputLength
      )
    }).runOnQueue(appContext.backgroundCoroutineScope)
  }
}
