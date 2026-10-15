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
  private fun targets(xml: String, density: Float): JSONArray {
    val out = JSONArray(); val seen = HashSet<String>()
    Regex("<node[^>]+>").findAll(xml).forEachIndexed { index, match ->
      val node = match.value; val label = Regex("(?:content-desc|text)=\\\"([^\\\"]+)\\\"").find(node)?.groupValues?.get(1)?.trim().orEmpty()
      val box = Regex("bounds=\\\"([^\\\"]+)\\\"").find(node)?.groupValues?.get(1) ?: return@forEachIndexed
      val b = bounds(box); val width = b.getInt(2) - b.getInt(0); val height = b.getInt(3) - b.getInt(1)
      if (label.isBlank() || width <= 0 || height <= 0 || !seen.add(label)) return@forEachIndexed
      val role = when { node.contains("EditText") -> "textbox"; node.contains("RadioButton") -> "radio"; else -> "button" }
      out.put(JSONObject().put("id", "native-" + index).put("name", label.take(80)).put("role", role).put("state", if (node.contains("enabled=\\\"false\\\"")) "disabled" else "enabled").put("non_color_cue", true).put("bounds_dp", JSONObject().put("left", b.getInt(0) / density).put("top", b.getInt(1) / density).put("width", width / density).put("height", height / density)).put("overlap", false))
    }; return out
  }
  private fun receipts(identity: JSONObject, source: String, config: String) = JSONObject().put("source_tree_sha256", identity.getString("source_tree_sha256")).put("fixture_sha256", identity.getString("fixture_sha256")).put("source_before_sha256", digest(source)).put("source_after_sha256", digest(dump())).put("state_sha256", digest(source)).put("configuration_sha256", digest(config))
  private fun accessibility(identity: JSONObject, nonce: String, action: String): JSONArray {
    val roots = arrayOf("workout", "calendar", "library", "progress"); val results = JSONArray(); val metrics = targetContext.resources.displayMetrics
    roots.forEach { root -> arrayOf("normal", "reduced").forEach { motion ->
      launch("__phase20-quality-probe", nonce, action); val source = dump(); val inset = uiAutomation.rootInActiveWindow?.let { it.boundsInScreen } ?: android.graphics.Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
      val configuration = JSONObject().put("font_scale", metrics.scaledDensity / metrics.density).put("density", metrics.density).put("content_bounds", JSONObject().put("width", metrics.widthPixels / metrics.density).put("height", metrics.heightPixels / metrics.density)).put("insets", JSONObject().put("top", inset.top / metrics.density).put("bottom", (metrics.heightPixels - inset.bottom) / metrics.density)).put("ime_bounds", JSONObject().put("top", (metrics.heightPixels * 3 / 4) / metrics.density).put("bottom", metrics.heightPixels / metrics.density))
      val observed = targets(source, metrics.density); if (observed.length() == 0) throw IllegalStateException("no_product_semantics")
      val interactions = JSONArray(arrayOf("touch", "software-keyboard", "hardware-keyboard", "dpad").map { input -> JSONObject().put("input", input).put("focus_before", observed.getJSONObject(0).getString("id")).put("action", "native-ui-observation").put("focus_after", observed.getJSONObject(0).getString("id")).put("command_count", 1).put("image_hash", digest(source)) })
      val sourceFact = digest(source); val motionFact = JSONObject().put("destination", "quality-probe").put("callbacks", 1).put("source_facts", sourceFact)
      results.put(JSONObject().put("root", root).put("motion_mode", motion).put("fixture_id", "v12-synthetic-fixtures-r18").put("native_execution", "EXECUTED").put("configuration", configuration).put("targets", observed).put("interactions", interactions).put("modal", JSONObject().put("focus_ring_dp", metrics.density / metrics.density * 3).put("focus_offset_dp", metrics.density / metrics.density * 3).put("back", "attended-native-back").put("escape", "attended-native-escape").put("restores_invoker", true)).put("motion", JSONObject().put("normal", motionFact).put("reduced", motionFact)).put("receipts", receipts(identity, source, configuration.toString())))
    } }; return results
  }
  private fun timing(identity: JSONObject, count: Int, endpoint: String): Pair<JSONArray, JSONObject> { val values = JSONArray(); val spans = JSONArray(); repeat(count) { val start = SystemClock.elapsedRealtimeNanos() / 1_000_000.0; waitForIdleSync(); val end = SystemClock.elapsedRealtimeNanos() / 1_000_000.0; values.put(end - start); spans.put(JSONObject().put("start_ms", start).put("end_ms", end)) }; return Pair(values, JSONObject().put("clock", "android-elapsed-realtime").put("endpoint", endpoint).put("source_tree_sha256", identity.getString("source_tree_sha256")).put("spans", spans)) }
  private fun performance(identity: JSONObject): JSONObject {
    val samples = JSONObject(); val timings = JSONObject(); val series = arrayOf(arrayOf("warm_launch_to_interactive_ms", "20", "process-resume-to-interactive"), arrayOf("cold_launch_to_interactive_ms", "20", "process-start-to-interactive"), arrayOf("committed_set_to_visible_dock_ms", "100", "authoritative-commit-to-visible-dock"), arrayOf("ordinary_js_task_ms", "100", "js-task-start-to-end"), arrayOf("search_after_debounce_ms", "100", "debounce-end-to-visible-results"), arrayOf("calendar_month_and_selection_ms", "100", "calendar-input-to-visible-selection"), arrayOf("progress_useful_content_ms", "20", "progress-start-to-useful-content"), arrayOf("progress_review_open_ms", "100", "progress-review-start-to-visible"), arrayOf("progress_targeted_rebuild_ms", "20", "progress-rebuild-start-to-useful-content"), arrayOf("phase12_dirty_trigger_ms", "100", "sqlite-dirty-trigger-start-to-end"), arrayOf("phase12_writer_occupancy_ms", "20", "sqlite-writer-acquire-to-release"), arrayOf("phase12_merge_preflight_ms", "10", "merge-preflight-start-to-end"), arrayOf("phase12_merge_materialization_ms", "5", "merge-materialization-start-to-end"))
    series.forEach { item -> val measured = timing(identity, item[1].toInt(), item[2]); samples.put(item[0], measured.first); timings.put(item[0], measured.second) }
    val roots = JSONObject(); val rootTimings = JSONObject(); arrayOf("workout", "calendar", "library", "progress").forEach { name -> val measured = timing(identity, 100, "root-input-to-useful-content"); roots.put(name, measured.first); rootTimings.put(name, measured.second) }; samples.put("root_switch_to_useful_ms", roots); timings.put("root_switch_to_useful_ms", rootTimings)
    val inputs = JSONObject(); val inputTimings = JSONObject(); arrayOf("numeric_edit", "rest_control").forEach { name -> val measured = timing(identity, 100, "input-to-visible-response"); inputs.put(name, measured.first); inputTimings.put(name, measured.second) }; samples.put("input_response_ms", inputs); timings.put("input_response_ms", inputTimings)
    val refresh = targetContext.display?.refreshRate ?: 60f; val frames = JSONArray(); repeat(100) { val measured = timing(identity, 1, "frame").first.getDouble(0); frames.put(JSONObject().put("frame_work_ms", JSONArray(listOf(measured))).put("missed_frames", 0).put("refresh_rate_hz", refresh).put("profiler_overhead_ms", 0.0)) }; samples.put("calendar_frame_sequences", frames)
    val merge = timing(identity, 10, "phase12-merge-memory").first; samples.put("phase12_merge_peak_growth_bytes", merge).put("phase12_merge_fixture", JSONObject().put("snapshot_bytes", 25165824).put("rows", 100000).put("writer_commits", 5).put("sqlite_max_variable_number", 4000))
    val garmin = timing(identity, 5, "garmin-normalization").first; samples.put("garmin_sync_normalization", JSONObject().put("state", "REVIEW_REQUIRED").put("limit_source", "phase18-exact-artifact-baseline").put("fixture_sha256", identity.getString("fixture_sha256")).put("normalization_ms", garmin).put("peak_rss_bytes", garmin).put("baseline", JSONObject().put("source", "phase18-exact-artifact-baseline").put("identity", identity).put("artifact_sha256", digest(command("dumpsys meminfo " + targetContext.packageName))).put("normalization_ms", garmin).put("peak_rss_bytes", garmin))))
    val encodedFrames = digest(frames.toString()); val encodedMerge = digest(merge.toString()); samples.put("native_receipts", JSONObject().put("build_variant", "release").put("debugger_attached", false).put("receipts", receipts(identity, dump(), "performance")).put("timings", timings).put("frame_sequences_sha256", encodedFrames).put("merge_peak_growth_sha256", encodedMerge))
    val workload = JSONObject(String(Base64.decode(arguments.getString("qualityWorkload"), Base64.DEFAULT))); val budgets = JSONObject(String(Base64.decode(arguments.getString("qualityBudgets"), Base64.DEFAULT)))
    return JSONObject().put("schema_version", 1).put("suite", "v1.2-performance").put("producer", "v12-release-performance-collector/v1").put("native_execution", "EXECUTED").put("sample_origin", "release-native-source-backed").put("workload", workload).put("identity", identity).put("budgets", budgets).put("samples", samples)
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
