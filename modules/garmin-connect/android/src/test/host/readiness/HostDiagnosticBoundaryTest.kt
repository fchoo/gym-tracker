package expo.modules.garminconnect

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.res.AssetManager
import android.net.Uri
import com.chaquo.python.Python
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import sun.misc.Unsafe

/** NON_NATIVE_HOST_ONLY: Android/Chaquopy runtime APIs below are explicit fakes. */
class HostDiagnosticBoundaryTest {
  companion object {
    var packageName = "com.fchoo.gymtracker.devtest"
    var nullApplicationContext = false
    var currentIntent: Intent? = Intent()
    val nonce = "a".repeat(32)
    val config = """{"scheme":"gymtracker-devtest","android":{"package":"com.fchoo.gymtracker.devtest"},"extra":{"buildProfile":"development-test","nativeContractsEnabled":true,"nativeContractSuite":"v1.2-acceptance"}}"""
    val passed = mapOf("status" to "passed", "stage" to "complete", "code" to "actual_transport_ready")
  }
  class HostContext : ContextWrapper(null) {
    override fun getApplicationContext(): Context? = if (nullApplicationContext) null else this
    override fun getPackageName(): String = Companion.packageName
    override fun getAssets(): AssetManager = AssetManager()
    override fun getNoBackupFilesDir(): File = throw AssertionError("store forbidden")
  }
  class HostActivity : Activity() { override fun getIntent(): Intent? = currentIntent }
  private fun <T> allocate(type: Class<T>): T {
    val field = Unsafe::class.java.getDeclaredField("theUnsafe").apply { isAccessible = true }
    return type.cast((field.get(null) as Unsafe).allocateInstance(type))
  }
  private fun module(): GarminConnectModule {
    val module = GarminConnectModule(GarminConnectPlatformBindings::production) { CoroutineScope(Dispatchers.Unconfined) }
    module.appContext.reactContext = allocate(HostContext::class.java)
    module.appContext.currentActivity = allocate(HostActivity::class.java)
    packageName = "com.fchoo.gymtracker.devtest"
    nullApplicationContext = false
    currentIntent = Intent().setData(Uri.parse("gymtracker-devtest://__garmin-bridge-diagnostic?nonce=$nonce"))
    AssetManager.config = config; AssetManager.fail = false
    Python.result = passed; Python.started = false; Python.dispatchCount = 0
    return module
  }
  private fun call(module: GarminConnectModule, value: Any = nonce): Any? = runBlocking {
    module.definition().functions.getValue("diagnoseTransportReadiness").body(value)
  }

  @Test fun `registered typed method reaches only zero argument inert Python probe`() {
    val module = module()
    assertEquals(passed, call(module)); assertTrue(Python.started); assertEquals(1, Python.dispatchCount)
    assertEquals(passed, call(module)); assertEquals(2, Python.dispatchCount)
    for (value in listOf(arrayOf(nonce), mapOf("nonce" to nonce), 123)) {
      assertThrows(ClassCastException::class.java) { call(module, value) }
    }
    assertThrows(IllegalArgumentException::class.java) { call(module, "") }
    assertEquals(2, Python.dispatchCount)
  }
  @Test fun `native production guard rejects before Python and never opens a store`() {
    for (kind in listOf("production", "uri", "no-data", "no-intent", "no-activity", "no-context", "no-application", "asset", "json", "profile")) {
      val module = module()
      when (kind) {
        "production" -> packageName = "com.fchoo.gymtracker"
        "uri" -> currentIntent = Intent().setData(Uri.parse("gymtracker-devtest://__garmin-bridge-diagnostic?nonce=$nonce&nonce=$nonce"))
        "no-data" -> currentIntent = Intent()
        "no-intent" -> currentIntent = null
        "no-activity" -> module.appContext.currentActivity = null
        "no-context" -> module.appContext.reactContext = null
        "no-application" -> nullApplicationContext = true
        "asset" -> AssetManager.fail = true
        "json" -> AssetManager.config = "bad"
        "profile" -> AssetManager.config = config.replace("development-test", "production")
      }
      try { call(module); fail("must reject") } catch (error: Exception) {
        assertTrue(error.message in listOf("garmin_operation_rejected", "garmin_runtime_unavailable"))
      }
      assertFalse(Python.started); assertEquals(0, Python.dispatchCount)
    }
  }
}
