package expo.modules.garminconnect

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class GarminTransportReadinessTest {
  private val nonce = "a".repeat(32)
  private val config = mapOf<String, Any?>(
    "scheme" to "gymtracker-devtest",
    "android" to mapOf("package" to "com.fchoo.gymtracker.devtest"),
    "extra" to mapOf("buildProfile" to "development-test", "nativeContractsEnabled" to true, "nativeContractSuite" to "v1.2-acceptance"),
  )
  private val uri get() = "gymtracker-devtest://__garmin-bridge-diagnostic?nonce=$nonce"
  private val passed = mapOf<String, Any?>("status" to "passed", "stage" to "complete", "code" to "actual_transport_ready")

  @Test fun `only exact package embedded config and nonce bound URI can dispatch`() {
    var calls = 0
    val runner = GarminTransportReadinessRunner { calls++; passed }
    assertEquals(passed, runner.run("com.fchoo.gymtracker.devtest", uri, config, nonce))
    assertEquals(1, calls)
    for ((pkg, route, manifest, input) in listOf(
      listOf(null, uri, config, nonce), listOf("com.fchoo.gymtracker", uri, config, nonce),
      listOf("com.fchoo.gymtracker.devtest", uri.replace("gymtracker-devtest", "gymtracker"), config, nonce),
      listOf("com.fchoo.gymtracker.devtest", uri.replace("__garmin-bridge-diagnostic", "__v12-production-garmin"), config, nonce),
      listOf("com.fchoo.gymtracker.devtest", "$uri&nonce=$nonce", config, nonce),
      listOf("com.fchoo.gymtracker.devtest", "$uri#fragment", config, nonce),
      listOf("com.fchoo.gymtracker.devtest", "$uri&other=1", config, nonce),
      listOf("com.fchoo.gymtracker.devtest", uri.replace(nonce, "b".repeat(32)), config, nonce),
      listOf("com.fchoo.gymtracker.devtest", uri, config, ""),
      listOf("com.fchoo.gymtracker.devtest", uri, config, "G".repeat(32)),
      listOf("com.fchoo.gymtracker.devtest", uri, null, nonce),
      listOf("com.fchoo.gymtracker.devtest", uri, config + ("scheme" to "gymtracker"), nonce),
      listOf("com.fchoo.gymtracker.devtest", uri, config + ("android" to null), nonce),
      listOf("com.fchoo.gymtracker.devtest", uri, config + ("android" to mapOf("package" to "com.fchoo.gymtracker")), nonce),
      listOf("com.fchoo.gymtracker.devtest", uri, config + ("extra" to null), nonce),
    )) {
      assertThrows(IllegalArgumentException::class.java) { runner.run(pkg as String?, route as String?, manifest, input as String) }
    }
    val extra = config["extra"] as Map<*, *>
    for ((key, value) in listOf("buildProfile" to "production", "nativeContractsEnabled" to false,
                                "nativeContractsEnabled" to "true", "nativeContractSuite" to "other")) {
      assertThrows(IllegalArgumentException::class.java) {
        runner.run("com.fchoo.gymtracker.devtest", uri, config + ("extra" to (extra + (key to value))), nonce)
      }
    }
    assertEquals(1, calls)
  }

  @Test fun `embedded config parsing preserves scalar types and fails closed`() {
    val source = """{"scheme":"gymtracker-devtest","android":{"package":"com.fchoo.gymtracker.devtest"},"extra":{"buildProfile":"development-test","nativeContractsEnabled":true,"nativeContractSuite":"v1.2-acceptance"}}"""
    assertEquals(config, embeddedGarminDiagnosticConfig(source))
    assertEquals(passed, GarminTransportReadinessRunner { passed }.run("com.fchoo.gymtracker.devtest", uri, embeddedGarminDiagnosticConfig(source), nonce))
    for (input in listOf("{}", source.replace("true", "\"true\""), source.replace("v1.2-acceptance", "other"))) {
      assertThrows(IllegalArgumentException::class.java) {
        GarminTransportReadinessRunner { throw AssertionError("must not dispatch") }.run("com.fchoo.gymtracker.devtest", uri, embeddedGarminDiagnosticConfig(input), nonce)
      }
    }
    assertThrows(org.json.JSONException::class.java) { embeddedGarminDiagnosticConfig("not JSON") }
  }

  @Test fun `Python output is reconstructed from exact fixed allowlist only`() {
    val stages = listOf("client_import", "cffi_backend", "curl_import", "curl_session", "requests_import", "ua_import", "certifi_import", "ssl_context", "client_factory", "session_close")
    val codes = listOf("ImportError", "ModuleNotFoundError", "OSError", "RuntimeError", "TypeError", "ValueError", "AttributeError", "Exception")
    for (stage in stages) for (code in codes) {
      val value = mapOf<String, Any?>("status" to "failed", "stage" to stage, "code" to code)
      assertEquals(value, GarminTransportReadinessRunner { value }.run("com.fchoo.gymtracker.devtest", uri, config, nonce))
    }
    val invalid = listOf<Any?>(null, 1, listOf(passed), emptyMap<String, Any>(),
      passed + ("status" to "other"), passed + ("stage" to "client_factory"), passed + ("code" to "ImportError"),
      passed + ("message" to "private"), passed + ("http_status" to 200),
      passed + ("status" to "failed"), mapOf("status" to "failed", "stage" to "bad", "code" to "Exception"),
      mapOf("status" to "failed", "stage" to "client_import", "code" to "PrivateClass"))
    for (value in invalid) assertEquals(rejected(), GarminTransportReadinessRunner { value }.run("com.fchoo.gymtracker.devtest", uri, config, nonce))
    assertEquals(rejected(), GarminTransportReadinessRunner { throw Error("private") }.run("com.fchoo.gymtracker.devtest", uri, config, nonce))
  }

  private fun rejected() = mapOf("status" to "failed", "stage" to "native", "code" to "native_bridge_rejected")
}
