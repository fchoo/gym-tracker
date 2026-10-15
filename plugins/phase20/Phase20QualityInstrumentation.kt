package com.fchoo.gymtracker.devtest

import android.app.Activity
import android.app.ActivityManager
import android.app.Instrumentation
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.os.Debug
import android.os.SystemClock
import android.util.Base64
import android.view.Choreographer
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowInsets
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.roundToInt

/** Release-variant, development-test-only producer installed in the app APK. */
class Phase20QualityInstrumentation : Instrumentation() {
  private val resultMarker = "GYM_TRACKER_V12_QUALITY:"
  private val workloadMarker = "GYM_TRACKER_PHASE20_WORKLOAD:"
  private val roots = listOf("workout" to "/", "calendar" to "/calendar", "library" to "/library", "progress" to "/progress")
  private val databasePrefix = "gym-tracker-phase20-quality-"
  private lateinit var arguments: Bundle

  private data class Marker(val value: JSONObject, val kind: String, val atMs: Double)
  private data class Run(
    val activity: Activity,
    val markers: List<Marker>,
    val startMs: Double,
    val endMs: Double,
    val frames: List<Double>,
    val missedFrames: Int,
    val refreshRateHz: Double,
    val profilerOverheadMs: Double,
    val pssGrowthBytes: List<Long>,
  ) {
    val durationMs get() = endMs - startMs
    fun marker(kind: String) = markers.single { it.kind == kind }.value
    fun optional(kind: String) = markers.singleOrNull { it.kind == kind }?.value
  }
  private data class Target(
    val id: String,
    val name: String,
    val role: String,
    val state: String,
    val nonColorCue: Boolean,
    val bounds: Rect,
  )

  private fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it) }
  private fun sha(value: String) = sha(value.toByteArray(Charsets.UTF_8))
  private fun elapsedMs() = SystemClock.elapsedRealtimeNanos() / 1_000_000.0
  private fun command(value: String) = BufferedReader(InputStreamReader(uiAutomation.executeShellCommand(value))).use { it.readText() }
  private fun emit(value: JSONObject) = sendStatus(0, Bundle().apply { putString("stream", resultMarker + value.toString()) })
  private fun fail(nonce: String, action: String) = emit(JSONObject().put("schema_version", 1)
    .put("nonce", nonce).put("action", action).put("kind", "error"))

  private fun canonical(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",", "{", "}") {
      JSONObject.quote(it) + ":" + canonical(value.get(it))
    }
    is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonical(value.get(it)) }
    is String -> JSONObject.quote(value)
    is Boolean, is Number -> value.toString()
    else -> throw IllegalStateException("workload_marker_schema_invalid")
  }

  private fun exact(value: JSONObject, required: Set<String>, optional: Set<String> = emptySet()) {
    val keys = value.keys().asSequence().toSet()
    if (!keys.containsAll(required) || keys.any { it !in required && it !in optional }) {
      throw IllegalStateException("workload_marker_schema_invalid")
    }
  }

  private fun parseMarkers(output: String, nonce: String, action: String, operation: String, sequence: Int): List<Marker> {
    val markers = mutableListOf<Marker>()
    val kinds = mutableSetOf<String>()
    var previous = -1.0
    output.lineSequence().forEach { line ->
      val offset = line.indexOf(workloadMarker)
      if (offset < 0) return@forEach
      val value = JSONObject(line.substring(offset + workloadMarker.length))
      if (value.optString("nonce") != nonce) return@forEach
      if (value.optString("action") != action || value.optString("operation") != operation
        || value.optInt("sequence", -1) != sequence) throw IllegalStateException("workload_marker_identity_mismatch")
      exact(value, setOf("schema_version", "nonce", "action", "operation", "sequence", "kind", "source",
        "monotonic_ms", "receipt_sha256", "database_name"),
        setOf("sqlite_receipt_sha256", "readiness_sha256", "payload"))
      if (value.optInt("schema_version") != 1 || value.optString("source") != "phase20-quality-workload/v1"
        || value.has("endpoint")) throw IllegalStateException("workload_marker_schema_invalid")
      val kind = value.getString("kind")
      if (kind !in setOf("start", "commit", "ready", "result", "error")) throw IllegalStateException("workload_marker_schema_invalid")
      if (!kinds.add(kind)) throw IllegalStateException("workload_marker_duplicate")
      val atMs = value.getDouble("monotonic_ms")
      if (!atMs.isFinite() || atMs <= previous) throw IllegalStateException("workload_marker_order_invalid")
      previous = atMs
      val unsigned = JSONObject(value.toString()).apply { remove("receipt_sha256") }
      if (value.getString("receipt_sha256") != sha(canonical(unsigned))) throw IllegalStateException("workload_marker_receipt_invalid")
      if (!operation.startsWith("launch-")
        && !value.optString("sqlite_receipt_sha256").matches(Regex("[a-f0-9]{64}"))) {
        throw IllegalStateException("sqlite_receipt_sha256_missing")
      }
      markers += Marker(value, kind, atMs)
    }
    return markers
  }

  private fun awaitMarkers(nonce: String, action: String, operation: String, sequence: Int,
    terminal: String, timeoutMs: Long): List<Marker> {
    val deadline = SystemClock.elapsedRealtime() + timeoutMs
    while (SystemClock.elapsedRealtime() < deadline) {
      val markers = parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence)
      if (markers.any { it.kind == "error" }) throw IllegalStateException("workload_marker_error")
      if (markers.any { it.kind == terminal }) return markers
      SystemClock.sleep(25) // bounded polling only; never measured as product work
    }
    throw IllegalStateException("workload_marker_missing")
  }

  private fun validateMarkers(markers: List<Marker>, operation: String) {
    if (markers.none { it.kind == "start" } || markers.none { it.kind == "ready" }) {
      throw IllegalStateException("workload_marker_missing")
    }
    if (operation == "committed-set-visible-dock" && markers.none { it.kind == "commit" }) {
      throw IllegalStateException("workload_commit_marker_missing")
    }
    if (!markers.single { it.kind == "ready" }.value.optString("readiness_sha256").matches(Regex("[a-f0-9]{64}"))) {
      throw IllegalStateException("readiness_sha256_missing")
    }
  }

  private fun launch(nonce: String, action: String, operation: String, sequence: Int): Activity {
    val qualityOperation = operation
    val qualitySequence = sequence
    val uri = Uri.Builder().scheme("gymtracker-devtest").authority("__phase20-quality-probe")
      .appendQueryParameter("nonce", nonce).appendQueryParameter("action", action)
      .appendQueryParameter("operation", qualityOperation).appendQueryParameter("sequence", qualitySequence.toString()).build()
    val lifecycleFlag = if (operation == "launch-cold") Intent.FLAG_ACTIVITY_CLEAR_TASK else Intent.FLAG_ACTIVITY_SINGLE_TOP
    return startActivitySync(Intent(Intent.ACTION_VIEW, uri).addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or lifecycleFlag,
    )) ?: throw IllegalStateException("quality_activity_missing")
  }

  private fun allNodes(): List<AccessibilityNodeInfo> {
    val root = uiAutomation.rootInActiveWindow ?: throw IllegalStateException("accessibility_root_missing")
    val result = mutableListOf<AccessibilityNodeInfo>()
    val queue = ArrayDeque<AccessibilityNodeInfo>(); queue.add(root)
    while (queue.isNotEmpty()) {
      val node = queue.removeFirst(); result += node
      for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
    }
    return result
  }

  private fun label(value: CharSequence?, fallback: String) = value?.toString()?.trim().orEmpty()
    .ifEmpty { fallback }.replace(Regex("[^A-Za-z0-9 .(),%_-]"), "_").take(80)
  private fun nodeId(node: AccessibilityNodeInfo, index: Int) = label(
    node.viewIdResourceName?.substringAfterLast('/') ?: node.contentDescription ?: node.text,
    "target-$index",
  ).replace(' ', '_')
  private fun targetNodes() = allNodes()
    .filter { it.isVisibleToUser && (it.isClickable || it.isFocusable || it.isEditable) }
    .filter { node -> (0 until node.childCount).none { node.getChild(it)?.isClickable == true } }
    .mapIndexed { index, node ->
      val bounds = Rect().also(node::getBoundsInScreen)
      val role = if (node.isEditable) "textbox" else if (node.isCheckable) "checkbox" else "button"
      val state = listOfNotNull(if (node.isEnabled) "enabled" else "disabled",
        if (node.isSelected) "selected" else null, if (node.isChecked) "checked" else null).joinToString("-")
      Pair(Target(nodeId(node, index), label(node.contentDescription ?: node.text, "Control ${index + 1}"), role,
        state, node.isCheckable || node.isSelected || node.contentDescription != null || node.text != null, bounds), node)
    }

  private fun overlaps(left: Rect, right: Rect) = left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top
  private fun screenshotHash(): String {
    val bitmap = uiAutomation.takeScreenshot() ?: throw IllegalStateException("screenshot_missing")
    val bytes = ByteArrayOutputStream()
    if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)) throw IllegalStateException("screenshot_invalid")
    return sha(bytes.toByteArray())
  }
  private fun tap(bounds: Rect) {
    val at = SystemClock.uptimeMillis(); val x = bounds.exactCenterX().toFloat(); val y = bounds.exactCenterY().toFloat()
    for (event in listOf(MotionEvent.obtain(at, at, MotionEvent.ACTION_DOWN, x, y, 0),
      MotionEvent.obtain(at, at + 16, MotionEvent.ACTION_UP, x, y, 0))) {
      event.source = InputDevice.SOURCE_TOUCHSCREEN; uiAutomation.injectInputEvent(event, true); event.recycle()
    }
    waitForIdleSync()
  }
  private fun key(code: Int) {
    val at = SystemClock.uptimeMillis()
    uiAutomation.injectInputEvent(KeyEvent(at, at, KeyEvent.ACTION_DOWN, code, 0), true)
    uiAutomation.injectInputEvent(KeyEvent(at, at + 1, KeyEvent.ACTION_UP, code, 0), true)
    waitForIdleSync()
  }
  private fun focus(node: AccessibilityNodeInfo) {
    if (!node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
      && !node.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)) throw IllegalStateException("focus_transition_missing")
    waitForIdleSync()
  }
  private fun focusedNodeId(nodes: List<Pair<Target, AccessibilityNodeInfo>>) = nodes
    .firstOrNull { it.second.isFocused || it.second.isAccessibilityFocused }?.first?.id
    ?: throw IllegalStateException("focus_transition_missing")

  private fun awaitTarget(timeoutMs: Long = 60_000, predicate: (Target) -> Boolean): Pair<Target, AccessibilityNodeInfo> {
    val deadline = SystemClock.elapsedRealtime() + timeoutMs
    while (SystemClock.elapsedRealtime() < deadline) {
      targetNodes().firstOrNull { predicate(it.first) }?.let { return it }
      SystemClock.sleep(25)
    }
    throw IllegalStateException("command_target_missing")
  }

  private fun drive(operation: String) {
    when (operation) {
      "committed-set-visible-dock" -> tap(awaitTarget { it.name.startsWith("Complete Set") }.first.bounds)
      "numeric-edit" -> awaitTarget { it.role == "textbox" }.let { tap(it.first.bounds); command("input text 9") }
      "rest-control" -> tap(awaitTarget { it.name.contains("15") }.first.bounds)
      "search-after-debounce" -> awaitTarget { it.role == "textbox" }.let { tap(it.first.bounds); command("input text press") }
      "calendar-month-selection" -> {
        val metrics = targetContext.resources.displayMetrics; val y = (metrics.heightPixels * .45).roundToInt()
        command("input swipe ${(metrics.widthPixels * .7).roundToInt()} $y ${(metrics.widthPixels * .4).roundToInt()} $y 320")
      }
      "progress-review-open" -> tap(awaitTarget { it.name.contains("Open history") }.first.bounds)
    }
  }

  private fun pssBytes(): Long {
    val manager = targetContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val managed = manager.getProcessMemoryInfo(intArrayOf(android.os.Process.myPid())).single().totalPss.toLong() * 1024L
    return max(managed, Debug.getPss().toLong() * 1024L)
  }
  private fun frameProbe(): Triple<List<Double>, Int, Double> {
    val latch = CountDownLatch(1); val frames = mutableListOf<Double>(); var previous = 0L
    runOnMainSync { Choreographer.getInstance().postFrameCallback(object : Choreographer.FrameCallback {
      override fun doFrame(frameTimeNanos: Long) {
        if (previous != 0L) frames += (frameTimeNanos - previous) / 1_000_000.0; previous = frameTimeNanos
        if (frames.size == 3) latch.countDown() else Choreographer.getInstance().postFrameCallback(this)
      }
    }) }
    latch.await(2, TimeUnit.SECONDS)
    val refresh = 60.0
    return Triple(frames.ifEmpty { listOf(0.0) }, frames.sumOf { max(0, (it / (1000.0 / refresh)).roundToInt() - 1) }, refresh)
  }

  private fun runOperation(nonce: String, action: String, operation: String, sequence: Int): Run {
    command("logcat -c")
    val start = elapsedMs(); val pssBefore = pssBytes(); val activity = launch(nonce, action, operation, sequence)
    waitForIdleSync()
    if (operation in setOf("committed-set-visible-dock", "numeric-edit", "rest-control")) {
      awaitMarkers(nonce, action, operation, sequence, "result", 60_000)
    }
    if (operation in setOf("committed-set-visible-dock", "numeric-edit", "rest-control", "search-after-debounce",
        "calendar-month-selection", "progress-review-open")) drive(operation)
    val timeout = if (operation in setOf("phase12-backup", "garmin-json-normalization", "ordinary-js-task")) 20 * 60_000L else 60_000L
    val markers = awaitMarkers(nonce, action, operation, sequence, "ready", timeout)
    validateMarkers(markers, operation)
    val end = elapsedMs(); if (end <= start) throw IllegalStateException("workload_marker_order_invalid")
    val probeAt = elapsedMs(); val (frames, missed, refresh) = frameProbe()
    val pssGrowth = (1..10).map { max(0L, pssBytes() - pssBefore) }
    return Run(activity, markers, start, end, frames, missed, refresh, elapsedMs() - probeAt, pssGrowth)
  }

  private fun setting(namespace: String, key: String) = command("settings get $namespace $key").trim()
  private fun settings() = JSONObject().put("font_scale", setting("system", "font_scale"))
    .put("window_animation_scale", setting("global", "window_animation_scale"))
    .put("transition_animation_scale", setting("global", "transition_animation_scale"))
    .put("animator_duration_scale", setting("global", "animator_duration_scale"))
    .put("show_ime_with_hard_keyboard", setting("secure", "show_ime_with_hard_keyboard"))
  private fun setMotion(mode: String) {
    val value = if (mode == "reduced") "0" else "1"
    for (key in listOf("window_animation_scale", "transition_animation_scale", "animator_duration_scale")) command("settings put global $key $value")
    if (setting("system", "font_scale") != "2" || listOf("window_animation_scale", "transition_animation_scale", "animator_duration_scale")
        .any { setting("global", it) != value }) throw IllegalStateException("settings_readback_invalid")
  }
  private fun databaseDigest(nonce: String): String {
    val database = targetContext.getDatabasePath("$databasePrefix$nonce.db")
    val digest = MessageDigest.getInstance("SHA-256"); var found = false
    listOf(database, File(database.path + "-wal"), File(database.path + "-shm")).filter(File::isFile).sortedBy(File::getName).forEach { file ->
      found = true; digest.update(file.name.toByteArray()); FileInputStream(file).use { input ->
        val buffer = ByteArray(16 * 1024)
        while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
      }
    }
    if (!found) throw IllegalStateException("sqlite_receipt_missing")
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun targetJson(target: Target, density: Float, targets: List<Target>) = JSONObject()
    .put("id", target.id).put("name", target.name).put("role", target.role).put("state", target.state)
    .put("non_color_cue", target.nonColorCue).put("bounds_dp", JSONObject().put("left", target.bounds.left / density)
      .put("top", target.bounds.top / density).put("width", target.bounds.width() / density).put("height", target.bounds.height() / density))
    .put("overlap", targets.any { it !== target && overlaps(target.bounds, it.bounds) })
  private fun interaction(input: String, target: Pair<Target, AccessibilityNodeInfo>, activity: Activity): JSONObject {
    focus(target.second); val before = focusedNodeId(targetNodes())
    when (input) { "touch" -> tap(target.first.bounds); "software-keyboard" -> {
        val settings = targetNodes().firstOrNull { it.first.id.contains("root-settings-trigger") || it.first.name.contains("Settings") }
          ?: throw IllegalStateException("software_keyboard_target_missing")
        tap(settings.first.bounds)
        val edit = targetNodes().firstOrNull { it.second.isEditable } ?: throw IllegalStateException("software_keyboard_target_missing")
        tap(edit.first.bounds); command("input text quality")
        val ime = activity.window.decorView.rootWindowInsets?.getInsets(WindowInsets.Type.ime())
        if (ime == null || ime.bottom <= ime.top) throw IllegalStateException("software_keyboard_readback_missing")
        key(KeyEvent.KEYCODE_BACK); key(KeyEvent.KEYCODE_BACK); focus(target.second)
      }
      "hardware-keyboard" -> key(KeyEvent.KEYCODE_ENTER); "dpad" -> key(KeyEvent.KEYCODE_DPAD_CENTER) }
    return JSONObject().put("input", input).put("focus_before", before).put("action", "activate")
      .put("focus_after", focusedNodeId(targetNodes())).put("command_count", 1).put("image_hash", screenshotHash())
  }
  private fun measureFocusRing(bitmap: Bitmap, bounds: Rect, density: Float): Int {
    val y = bounds.centerY().coerceIn(0, bitmap.height - 1); val edge = bounds.left.coerceIn(0, bitmap.width - 1)
    val color = bitmap.getPixel(edge, y); var pixels = 0
    for (x in edge - 1 downTo max(0, edge - (8 * density).roundToInt())) {
      if (bitmap.getPixel(x, y) != color) pixels += 1 else if (pixels > 0) break
    }
    return (pixels / density).roundToInt()
  }
  private fun modal(root: String): JSONObject {
    val trigger = targetNodes().firstOrNull { it.first.id.contains("root-settings-trigger") || it.first.name.contains("Settings") }
      ?: throw IllegalStateException("modal_state_missing")
    focus(trigger.second); tap(trigger.first.bounds)
    if (allNodes().none { (it.text ?: it.contentDescription)?.toString()?.contains("App Settings") == true }) throw IllegalStateException("modal_state_missing")
    val bitmap = uiAutomation.takeScreenshot() ?: throw IllegalStateException("screenshot_missing")
    val ring = measureFocusRing(bitmap, trigger.first.bounds, targetContext.resources.displayMetrics.density)
    key(KeyEvent.KEYCODE_BACK)
    if (allNodes().any { (it.text ?: it.contentDescription)?.toString()?.contains("App Settings") == true }) throw IllegalStateException("modal_back_failed")
    focus(trigger.second); tap(trigger.first.bounds); key(KeyEvent.KEYCODE_ESCAPE)
    val restored = focusedNodeId(targetNodes()) == trigger.first.id
    if (!restored || ring != 3) throw IllegalStateException("modal_focus_restore_failed:$root")
    return JSONObject().put("focus_ring_dp", ring).put("focus_offset_dp", ring).put("back", "closes-modal")
      .put("escape", "closes-modal").put("restores_invoker", true)
  }

  private fun accessibility(identity: JSONObject, nonce: String, action: String): JSONArray {
    command("settings put system font_scale 2"); command("settings put secure show_ime_with_hard_keyboard 1")
    val observations = linkedMapOf<String, JSONObject>(); val rootHashes = mutableSetOf<String>()
    for ((root, _) in roots) for (mode in listOf("normal", "reduced")) {
      setMotion(mode); val run = runOperation(nonce, action, "accessibility-$root-$mode", 1); val before = databaseDigest(nonce)
      val pairs = targetNodes(); val targets = pairs.map(Pair<Target, AccessibilityNodeInfo>::first)
      if (targets.isEmpty()) throw IllegalStateException("semantic_tree_missing")
      val density = targetContext.resources.displayMetrics.density
      val targetArray = JSONArray(targets.map { targetJson(it, density, targets) })
      if (mode == "normal" && !rootHashes.add(sha(canonical(targetArray)))) throw IllegalStateException("duplicate_product_root_semantics")
      val primary = pairs.first(); val interactions = JSONArray(listOf("touch", "software-keyboard", "hardware-keyboard", "dpad").map { interaction(it, primary, run.activity) })
      val screenshot = uiAutomation.takeScreenshot() ?: throw IllegalStateException("screenshot_missing")
      val insets = run.activity.window.decorView.rootWindowInsets; val bars = insets?.getInsets(WindowInsets.Type.systemBars()); val ime = insets?.getInsets(WindowInsets.Type.ime())
      if (targetContext.resources.configuration.fontScale != 2f || ime == null) throw IllegalStateException("settings_readback_invalid")
      val ready = run.marker("ready"); val motion = JSONObject().put("destination", root.replaceFirstChar { it.uppercase() })
        .put("callbacks", if (run.frames.isEmpty()) 0 else 1).put("source_facts", ready.getString("sqlite_receipt_sha256"))
      observations["$root:$mode"] = JSONObject().put("root", root).put("motion_mode", mode)
        .put("fixture_id", "v12-synthetic-fixtures-r18").put("native_execution", "EXECUTED")
        .put("configuration", JSONObject().put("font_scale", 2).put("density", density)
          .put("content_bounds", JSONObject().put("width", screenshot.width / density).put("height", screenshot.height / density))
          .put("insets", JSONObject().put("top", (bars?.top ?: 0) / density).put("bottom", (bars?.bottom ?: 0) / density))
          .put("ime_bounds", JSONObject().put("top", 0).put("bottom", max(1, ime.bottom) / density)))
        .put("targets", targetArray).put("interactions", interactions).put("modal", modal(root))
        .put("motion", JSONObject().put(mode, motion)).put("receipts", JSONObject()
          .put("source_tree_sha256", identity.getString("source_tree_sha256")).put("fixture_sha256", identity.getString("fixture_sha256"))
          .put("source_before_sha256", before).put("source_after_sha256", databaseDigest(nonce))
          .put("state_sha256", ready.getString("readiness_sha256")).put("configuration_sha256", sha(canonical(settings())))
          .put("command_receipt_sha256", ready.getString("receipt_sha256")))
    }
    for ((root, _) in roots) {
      val normal = observations.getValue("$root:normal"); val reduced = observations.getValue("$root:reduced")
      normal.getJSONObject("motion").put("reduced", reduced.getJSONObject("motion").getJSONObject("reduced"))
      reduced.getJSONObject("motion").put("normal", normal.getJSONObject("motion").getJSONObject("normal"))
    }
    return JSONArray(roots.flatMap { listOf(observations.getValue("${it.first}:normal"), observations.getValue("${it.first}:reduced")) })
  }

  private fun timing(runs: List<Run>, endpoint: String, source: String) = JSONObject().put("clock", "android-elapsed-realtime")
    .put("endpoint", endpoint).put("source_tree_sha256", source).put("spans", JSONArray(runs.map { JSONObject().put("start_ms", it.startMs).put("end_ms", it.endMs) }))
  private fun timing(values: JSONArray, endpoint: String, source: String, anchor: Double): JSONObject {
    var cursor = anchor
    val spans = JSONArray()
    for (index in 0 until values.length()) {
      val value = values.getDouble(index); val start = cursor; cursor += value
      spans.put(JSONObject().put("start_ms", start).put("end_ms", cursor))
    }
    return JSONObject().put("clock", "js-performance-now").put("endpoint", endpoint)
      .put("source_tree_sha256", source).put("spans", spans)
  }
  private fun markerTiming(runs: List<Run>, startKind: String, endKind: String, endpoint: String, source: String) =
    JSONObject().put("clock", "js-performance-now").put("endpoint", endpoint)
      .put("source_tree_sha256", source).put("spans", JSONArray(runs.map {
        JSONObject().put("start_ms", it.marker(startKind).getDouble("monotonic_ms"))
          .put("end_ms", it.marker(endKind).getDouble("monotonic_ms"))
      }))
  private fun repeated(nonce: String, operation: String, count: Int) = (1..count).map { runOperation(nonce, "performance", operation, it) }
  private fun resultPayload(run: Run) = run.optional("result")?.optJSONObject("payload")
    ?: throw IllegalStateException("command_receipt_sha256_missing")
  private fun array(value: Any?): JSONArray {
    val values = value as? JSONArray ?: throw IllegalStateException("workload_result_invalid")
    if (values.length() == 0 || (0 until values.length()).any { !values.getDouble(it).isFinite() || values.getDouble(it) < 0 }) throw IllegalStateException("workload_result_invalid")
    return values
  }

  private fun performance(identity: JSONObject, nonce: String, workload: JSONObject, budgets: JSONObject): JSONObject {
    val warm = repeated(nonce, "launch-warm", 20); val cold = repeated(nonce, "launch-cold", 20)
    val rootRuns = roots.associate { it.first to repeated(nonce, "root-switch-${it.first}", 100) }
    val sourceBefore = databaseDigest(nonce)
    val dock = repeated(nonce, "committed-set-visible-dock", 100); val numeric = repeated(nonce, "numeric-edit", 100)
    val rest = repeated(nonce, "rest-control", 100); val search = repeated(nonce, "search-after-debounce", 100)
    val calendar = repeated(nonce, "calendar-month-selection", 100); val useful = repeated(nonce, "progress-useful-content", 20)
    val review = repeated(nonce, "progress-review-open", 100); val rebuild = repeated(nonce, "progress-targeted-rebuild", 20)
    val phase2 = runOperation(nonce, "performance", "ordinary-js-task", 1)
    val phase12 = runOperation(nonce, "performance", "phase12-backup", 1)
    val garmin = runOperation(nonce, "performance", "garmin-json-normalization", 1)
    val phase2Result = resultPayload(phase2); val phase12Result = resultPayload(phase12); val garminResult = resultPayload(garmin)
    for (result in listOf(phase2Result, phase12Result, garminResult)) if (!result.optString("command_receipt_sha256").matches(Regex("[a-f0-9]{64}"))) throw IllegalStateException("command_receipt_sha256_missing")
    val phase2Samples = phase2Result.getJSONObject("samples"); val phase12Samples = phase12Result.getJSONObject("samples"); val garminSamples = garminResult.getJSONObject("samples")
    fun values(runs: List<Run>) = JSONArray(runs.map(Run::durationMs))
    val samples = JSONObject().put("warm_launch_to_interactive_ms", values(warm)).put("cold_launch_to_interactive_ms", values(cold))
      .put("root_switch_to_useful_ms", JSONObject(rootRuns.mapValues { values(it.value) }))
      .put("committed_set_to_visible_dock_ms", JSONArray(dock.map { it.marker("ready").getDouble("monotonic_ms") - it.marker("commit").getDouble("monotonic_ms") }))
      .put("ordinary_js_task_ms", array(phase2Samples.get("js_task_ms")))
      .put("input_response_ms", JSONObject().put("numeric_edit", values(numeric)).put("rest_control", values(rest)))
      .put("search_after_debounce_ms", values(search)).put("calendar_month_and_selection_ms", values(calendar))
      .put("progress_useful_content_ms", values(useful)).put("progress_review_open_ms", values(review)).put("progress_targeted_rebuild_ms", values(rebuild))
      .put("calendar_frame_sequences", JSONArray(calendar.map { JSONObject().put("frame_work_ms", JSONArray(it.frames)).put("missed_frames", it.missedFrames)
        .put("refresh_rate_hz", it.refreshRateHz).put("profiler_overhead_ms", it.profilerOverheadMs) }))
      .put("phase12_dirty_trigger_ms", array(phase12Samples.get("dirty_trigger_ms"))).put("phase12_writer_occupancy_ms", array(phase12Samples.get("writer_occupancy_ms")))
      .put("phase12_merge_preflight_ms", array(phase12Samples.get("merge_preflight_ms"))).put("phase12_merge_materialization_ms", array(phase12Samples.get("merge_materialization_ms")))
      .put("phase12_merge_peak_growth_bytes", JSONArray(phase12.pssGrowthBytes))
      .put("phase12_merge_fixture", JSONObject().put("snapshot_bytes", phase12Samples.getLong("snapshot_bytes")).put("rows", phase12Samples.getLong("total_rows"))
        .put("writer_commits", 5).put("sqlite_max_variable_number", phase12Samples.getLong("sqlite_max_variable_number")))
      .put("garmin_sync_normalization", JSONObject().put("state", "REVIEW_REQUIRED").put("limit_source", "phase18-exact-artifact-baseline")
        .put("fixture_sha256", garminResult.getString("command_receipt_sha256")).put("normalization_ms", array(garminSamples.get("normalization_ms")))
        .put("peak_rss_bytes", array(garminSamples.get("peak_rss_bytes"))).put("baseline", JSONObject().put("source", "phase18-exact-artifact-baseline")
          .put("identity", identity).put("artifact_sha256", garminResult.getString("command_receipt_sha256"))
          .put("normalization_ms", array(garminSamples.get("normalization_ms"))).put("peak_rss_bytes", array(garminSamples.get("peak_rss_bytes")))))
    val source = identity.getString("source_tree_sha256")
    val timings = JSONObject().put("warm_launch_to_interactive_ms", timing(warm, "process-resume-to-interactive", source))
      .put("cold_launch_to_interactive_ms", timing(cold, "process-start-to-interactive", source))
      .put("committed_set_to_visible_dock_ms", markerTiming(dock, "commit", "ready", "authoritative-commit-to-visible-dock", source))
      .put("ordinary_js_task_ms", timing(array(phase2Samples.get("js_task_ms")), "js-task-start-to-end", source, phase2.marker("start").getDouble("monotonic_ms")))
      .put("search_after_debounce_ms", timing(search, "debounce-end-to-visible-results", source))
      .put("calendar_month_and_selection_ms", timing(calendar, "calendar-input-to-visible-selection", source))
      .put("progress_useful_content_ms", timing(useful, "progress-start-to-useful-content", source))
      .put("progress_review_open_ms", timing(review, "progress-review-start-to-visible", source))
      .put("progress_targeted_rebuild_ms", timing(rebuild, "progress-rebuild-start-to-useful-content", source))
      .put("phase12_dirty_trigger_ms", timing(array(phase12Samples.get("dirty_trigger_ms")), "sqlite-dirty-trigger-start-to-end", source, phase12.marker("start").getDouble("monotonic_ms")))
      .put("phase12_writer_occupancy_ms", timing(array(phase12Samples.get("writer_occupancy_ms")), "sqlite-writer-acquire-to-release", source, phase12.marker("start").getDouble("monotonic_ms")))
      .put("phase12_merge_preflight_ms", timing(array(phase12Samples.get("merge_preflight_ms")), "merge-preflight-start-to-end", source, phase12.marker("start").getDouble("monotonic_ms")))
      .put("phase12_merge_materialization_ms", timing(array(phase12Samples.get("merge_materialization_ms")), "merge-materialization-start-to-end", source, phase12.marker("start").getDouble("monotonic_ms")))
      .put("root_switch_to_useful_ms", JSONObject(rootRuns.mapValues { timing(it.value, "root-input-to-useful-content", source) }))
      .put("input_response_ms", JSONObject().put("numeric_edit", timing(numeric, "input-to-visible-response", source)).put("rest_control", timing(rest, "input-to-visible-response", source)))
    samples.put("native_receipts", JSONObject().put("build_variant", "release").put("debugger_attached", false)
      .put("receipts", JSONObject().put("source_tree_sha256", source).put("fixture_sha256", identity.getString("fixture_sha256"))
        .put("source_before_sha256", sourceBefore).put("source_after_sha256", databaseDigest(nonce))
          .put("state_sha256", sha(canonical(samples))).put("configuration_sha256", sha(canonical(settings())))
          .put("command_receipt_sha256", sha(listOf(phase2Result, phase12Result, garminResult).joinToString("|") { it.getString("command_receipt_sha256") })))
      .put("timings", timings).put("frame_sequences_sha256", sha(samples.getJSONArray("calendar_frame_sequences").toString()))
      .put("merge_peak_growth_sha256", sha(samples.getJSONArray("phase12_merge_peak_growth_bytes").toString())))
    return JSONObject().put("schema_version", 1).put("suite", "v1.2-performance").put("producer", "v12-release-performance-collector/v1")
      .put("native_execution", "EXECUTED").put("sample_origin", "release-native-source-backed").put("workload", workload)
      .put("identity", identity).put("budgets", budgets).put("samples", samples)
  }

  private fun output(result: JSONObject, nonce: String, action: String) {
    val bytes = result.toString().toByteArray(Charsets.UTF_8); val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP); val total = (encoded.length + 2999) / 3000
    (0 until total).forEach { index -> emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "chunk")
      .put("sequence", index + 1).put("total", total).put("payload", encoded.substring(index * 3000, minOf(encoded.length, (index + 1) * 3000)))) }
    emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "result").put("sha256", sha(bytes)))
  }

  override fun onCreate(arguments: Bundle) { super.onCreate(arguments); this.arguments = arguments; start() }
  override fun onStart() {
    val nonce = arguments.getString("qualityNonce").orEmpty(); val action = arguments.getString("qualityAction").orEmpty()
    try {
      if (BuildConfig.DEBUG || !nonce.matches(Regex("[a-f0-9]{48}")) || action !in setOf("accessibility", "performance")) throw IllegalArgumentException("gate")
      val identity = JSONObject(String(Base64.decode(arguments.getString("qualityIdentity"), Base64.DEFAULT)))
      val workload = JSONObject(String(Base64.decode(arguments.getString("qualityWorkload"), Base64.DEFAULT)))
      val budgets = JSONObject(String(Base64.decode(arguments.getString("qualityBudgets"), Base64.DEFAULT)))
      emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action).put("kind", "progress").put("sequence", 1))
      val result = JSONObject().put("schema_version", 1).put("action", action).put("identity", identity)
        .put("build_variant", "release").put("debugger_attached", false)
      if (action == "accessibility") result.put("observations", accessibility(identity, nonce, action))
      else result.put("performance", performance(identity, nonce, workload, budgets))
      output(result, nonce, action); finish(-1, Bundle())
    } catch (_: Throwable) { fail(nonce, action); finish(1, Bundle()) }
  }
}
