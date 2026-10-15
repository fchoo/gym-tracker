import { AndroidConfig, ConfigPlugin, withAndroidManifest, withDangerousMod } from "expo/config-plugins";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const instrumentationClass = ".Phase20QualityInstrumentation";

export function phase20QualityInstrumentationEnabled(extra: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return extra?.nativeContractsEnabled === true && extra.nativeContractSuite === "v1.2-acceptance";
}

/* This source is generated only into the development-test APK. It measures the
 * installed product through its own Instrumentation/UIAutomation APIs; host-side
 * clocks, files and fallback fixtures are intentionally absent. */
export const phase20InstrumentationSource = `package com.fchoo.gymtracker.devtest

import android.app.Instrumentation
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.Base64
import android.view.WindowInsets
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.security.MessageDigest

class Phase20QualityInstrumentation : Instrumentation() {
  private val marker = "GYM_TRACKER_V12_QUALITY:"
  private fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
  private fun fail(nonce: String, action: String) { emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "error")) }
  private fun emit(value: JSONObject) { sendStatus(0, Bundle().apply { putString("stream", marker + value.toString()) }) }
  private fun command(command: String): String = BufferedReader(InputStreamReader(uiAutomation.executeShellCommand(command))).use { it.readText() }
  private fun launch(path: String, nonce: String, action: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("gymtracker-devtest://" + path + "?nonce=" + nonce + "&action=" + action)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    targetContext.startActivity(intent); waitForIdleSync(); SystemClock.sleep(250); waitForIdleSync()
  }
  private fun dump(): String = command("uiautomator dump /sdcard/phase20-quality.xml >/dev/null && cat /sdcard/phase20-quality.xml")
  private fun bounds(value: String): JSONArray {
    val m = Regex("\\\\[(\\\\d+),(\\\\d+)\\\\]\\\\[(\\\\d+),(\\\\d+)\\\\]").find(value) ?: return JSONArray(listOf(0, 0, 0, 0))
    return JSONArray(listOf(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt(), m.groupValues[4].toInt()))
  }
  private fun accessibility(identity: JSONObject, nonce: String, action: String): JSONArray {
    val roots = arrayOf("workout" to "/", "calendar" to "/calendar", "library" to "/library", "progress" to "/progress")
    val semanticHashes = HashSet<String>()
    roots.forEach { (_, path) -> launch(path, nonce, action); if (!semanticHashes.add(digest(dump()))) throw IllegalStateException("duplicate_product_root_semantics") }
    throw IllegalStateException("actual_accessibility_operation_marker_required")
  }
  /** Phase 20 must never turn UI-idle spans into product-workload evidence.
   * A real bridge must expose an operation id and a matching readiness marker
   * from the product route after the operation commits. Until then this fails
   * closed and emits no chunk/result receipt. */
  private fun performance(identity: JSONObject): JSONObject {
    throw IllegalStateException("actual_product_workload_marker_required")
  }
  private lateinit var arguments: Bundle
  override fun onCreate(arguments: Bundle) { super.onCreate(arguments); this.arguments = arguments; start() }
  override fun onStart() { val nonce = arguments.getString("qualityNonce").orEmpty(); val action = arguments.getString("qualityAction").orEmpty(); try { if (BuildConfig.DEBUG || !nonce.matches(Regex("[a-f0-9]{48}")) || (action != "accessibility" && action != "performance")) throw IllegalArgumentException("gate"); val identity = JSONObject(String(Base64.decode(arguments.getString("qualityIdentity"), Base64.DEFAULT))); val result = JSONObject().put("schema_version", 1).put("action", action).put("identity", identity).put("build_variant", "release").put("debugger_attached", false); emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "progress").put("sequence", 1)); if (action == "accessibility") result.put("observations", accessibility(identity, nonce, action)) else result.put("performance", performance(identity)); val bytes = result.toString().toByteArray(); val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP); val total = (encoded.length + 2999) / 3000; (0 until total).forEach { i -> emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "chunk").put("sequence", i + 1).put("total", total).put("payload", encoded.substring(i * 3000, minOf(encoded.length, (i + 1) * 3000)))) }; emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "result").put("sha256", MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) })); finish(-1, Bundle()) } catch (_: Throwable) { fail(nonce, action); finish(1, Bundle()) } }
}
`;

const withPhase20QualityInstrumentation: ConfigPlugin = (config) => {
  if (!phase20QualityInstrumentationEnabled(config.extra)) return config;
  config = withAndroidManifest(config, (manifestConfig) => {
    type Instrumentation = { $: Record<string, string> };
    const manifest = manifestConfig.modResults.manifest as typeof manifestConfig.modResults.manifest & { instrumentation?: Instrumentation[] };
    manifest.instrumentation ??= [];
    manifest.instrumentation = manifest.instrumentation.filter((entry: Instrumentation) => entry.$["android:name"] !== instrumentationClass);
    manifest.instrumentation.push({ $: { "android:name": instrumentationClass, "android:targetPackage": "com.fchoo.gymtracker.devtest", "android:handleProfiling": "false", "android:functionalTest": "true" } });
    return manifestConfig;
  });
  return withDangerousMod(config, ["android", async (modConfig) => {
    const directory = path.join(modConfig.modRequest.platformProjectRoot, "app", "src", "main", "java", "com", "fchoo", "gymtracker", "devtest");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "Phase20QualityInstrumentation.kt"), phase20InstrumentationSource);
    return modConfig;
  }]);
};

export default withPhase20QualityInstrumentation;
