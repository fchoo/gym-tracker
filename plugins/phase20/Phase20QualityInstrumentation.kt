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
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Base64
import android.view.Choreographer
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowInsets
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/** Release-variant, development-test-only producer installed in the app APK. */
class Phase20QualityInstrumentation : Instrumentation() {
  private val resultMarker = "GYM_TRACKER_V12_QUALITY:"
  private val workloadMarker = "GYM_TRACKER_PHASE20_WORKLOAD:"
  private val roots = listOf("workout" to "/", "calendar" to "/calendar", "library" to "/library", "progress" to "/progress")
  private val databasePrefix = "gym-tracker-phase20-quality-"
  private val scenarios = mapOf(
    "workout" to Pair("phase20-workout-active-r1", "workout-active-session"),
    "calendar" to Pair("phase20-calendar-month-r1", "calendar-month-agenda"),
    "library" to Pair("phase20-library-exercises-r1", "library-exercise-catalog"),
    "progress" to Pair("phase20-progress-overview-r1", "progress-overall-current"),
  )
  private lateinit var arguments: Bundle
  private var progressSequence = 0
  private var lastProgressAtMs = 0L
  private var lastImeHeightPx = 0

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
    val frameStartMs: Double,
    val frameEndMs: Double,
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
  private fun rootForOperation(operation: String) = Regex("^(?:accessibility-|root-switch-)(workout|calendar|library|progress)(?:-|$)")
    .find(operation)?.groupValues?.get(1) ?: when {
      operation == "search-after-debounce" -> "library"
      operation == "calendar-month-selection" -> "calendar"
      operation.startsWith("progress-") -> "progress"
      else -> "workout"
    }
  private fun databaseName(nonce: String, operation: String) = "$databasePrefix$nonce-${rootForOperation(operation)}.db"
  private fun configurationId(operation: String): String {
    val root = rootForOperation(operation)
    val mode = if (operation.startsWith("accessibility-")) if (operation.endsWith("-reduced")) "reduced" else "normal" else "performance"
    return "quality-$root-$mode-f200"
  }
  private fun command(value: String) = ParcelFileDescriptor.AutoCloseInputStream(
    uiAutomation.executeShellCommand(value),
  ).bufferedReader().use { it.readText() }
  private fun emit(value: JSONObject) = sendStatus(0, Bundle().apply { putString("stream", resultMarker + value.toString()) })
  private fun fail(nonce: String, action: String) = emit(JSONObject().put("schema_version", 1)
    .put("nonce", nonce).put("action", action).put("kind", "error"))
  private fun progress(nonce: String, action: String, force: Boolean = false) {
    val now = SystemClock.elapsedRealtime()
    if (!force && now - lastProgressAtMs < 10_000) return
    lastProgressAtMs = now
    progressSequence += 1
    emit(JSONObject().put("schema_version", 1).put("nonce", nonce).put("action", action)
      .put("kind", "progress").put("sequence", progressSequence))
  }

  private fun canonical(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",", "{", "}") {
      JSONObject.quote(it) + ":" + canonical(value.get(it))
    }
    is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonical(value.get(it)) }
    is String -> JSONObject.quote(value)
    is Boolean -> value.toString()
    is Number -> JSONObject.numberToString(value)
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
    val markerKeys = mutableSetOf<String>()
    var previous = -1.0
    output.lineSequence().forEach { line ->
      val offset = line.indexOf(workloadMarker)
      if (offset < 0) return@forEach
      val value = JSONObject(line.substring(offset + workloadMarker.length))
      if (value.optString("nonce") != nonce) return@forEach
      if (value.optString("action") != action || value.optString("operation") != operation
        || value.optInt("sequence", -1) != sequence) throw IllegalStateException("workload_marker_identity_mismatch")
      exact(value, setOf("schema_version", "nonce", "action", "operation", "sequence", "kind", "source",
        "monotonic_ms", "receipt_sha256", "database_name", "root", "fixture_id", "state_id", "configuration_id"),
        setOf("sqlite_receipt_sha256", "readiness_sha256", "payload"))
      val root = rootForOperation(operation); val scenario = scenarios.getValue(root)
      if (value.optInt("schema_version") != 1 || value.optString("source") != "phase20-quality-workload/v1"
        || value.optString("root") != root || value.optString("fixture_id") != scenario.first
        || value.optString("state_id") != scenario.second || value.optString("configuration_id") != configurationId(operation)
        || value.optString("database_name") != databaseName(nonce, operation)
        || value.has("endpoint")) throw IllegalStateException("workload_marker_schema_invalid")
      val kind = value.getString("kind")
      if (kind !in setOf("start", "commit", "ready", "result", "chunk", "callback", "error")) throw IllegalStateException("workload_marker_schema_invalid")
      val markerKey = when (kind) {
        "chunk" -> "chunk:${value.optJSONObject("payload")?.optInt("chunk_sequence", -1)}"
        "callback" -> "callback:${value.optJSONObject("payload")?.optString("callback_id")}:${value.optJSONObject("payload")?.optInt("callback_count", -1)}"
        else -> kind
      }
      if (!markerKeys.add(markerKey)) throw IllegalStateException("workload_marker_duplicate")
      val atMs = value.getDouble("monotonic_ms")
      if (!atMs.isFinite() || atMs <= previous) throw IllegalStateException("workload_marker_order_invalid")
      previous = atMs
      val unsigned = JSONObject(value.toString()).apply { remove("receipt_sha256") }
      if (value.getString("receipt_sha256") != sha(canonical(unsigned))) throw IllegalStateException("workload_marker_receipt_invalid")
      if (!value.optString("sqlite_receipt_sha256").matches(Regex("[a-f0-9]{64}"))) {
        throw IllegalStateException("sqlite_receipt_sha256_missing")
      }
      val payload = value.optJSONObject("payload")
      if (payload?.has("executed_operation") == true
        && payload.getString("executed_operation") != operation) {
        throw IllegalStateException("workload_marker_identity_mismatch")
      }
      markers += Marker(value, kind, atMs)
    }
    return markers
  }

  private fun awaitMarkers(nonce: String, action: String, operation: String, sequence: Int,
    terminal: String, timeoutMs: Long, observeOutput: ((String) -> Unit)? = null): List<Marker> {
    val deadline = SystemClock.elapsedRealtime() + timeoutMs
    while (SystemClock.elapsedRealtime() < deadline) {
      val output = command("logcat -d -v raw ReactNativeJS:I '*:S'")
      observeOutput?.invoke(output)
      val markers = parseMarkers(output, nonce, action, operation, sequence)
      if (markers.any { it.kind == "error" }) throw IllegalStateException("workload_marker_error")
      if (markers.any { it.kind == terminal }) return markers
      progress(nonce, action)
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
    return startActivitySync(Intent(Intent.ACTION_VIEW, uri).addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP,
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
  private fun activate(node: AccessibilityNodeInfo) {
    if (!node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw IllegalStateException("accessibility_action_failed")
    waitForIdleSync()
  }
  private fun replaceText(node: AccessibilityNodeInfo, value: String) {
    val arguments = Bundle().apply {
      putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
    }
    if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)) throw IllegalStateException("numeric_edit_failed")
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

  private fun callbackCount(markers: List<Marker>, callbackId: String) = markers
    .filter { it.kind == "callback" && it.value.optJSONObject("payload")?.optString("callback_id") == callbackId }
    .maxOfOrNull { it.value.getJSONObject("payload").getInt("callback_count") } ?: 0

  private fun awaitCallback(nonce: String, action: String, operation: String, sequence: Int,
    callbackId: String, afterCount: Int): Marker {
    val deadline = SystemClock.elapsedRealtime() + 30_000L
    while (SystemClock.elapsedRealtime() < deadline) {
      val markers = parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence)
      markers.firstOrNull { it.kind == "callback" && it.value.optJSONObject("payload")?.let { payload ->
        payload.optString("callback_id") == callbackId && payload.optInt("callback_count", 0) > afterCount
      } == true }?.let { return it }
      SystemClock.sleep(25)
    }
    throw IllegalStateException("product_callback_missing")
  }

  private fun awaitFocus(targetId: String): String {
    val deadline = SystemClock.elapsedRealtime() + 10_000L
    while (SystemClock.elapsedRealtime() < deadline) {
      val focused = runCatching { focusedNodeId(targetNodes()) }.getOrNull()
      if (focused == targetId) return focused
      SystemClock.sleep(25)
    }
    throw IllegalStateException("focus_transition_missing")
  }

  private fun awaitTarget(timeoutMs: Long = 60_000, predicate: (Target) -> Boolean): Pair<Target, AccessibilityNodeInfo> {
    val deadline = SystemClock.elapsedRealtime() + timeoutMs
    while (SystemClock.elapsedRealtime() < deadline) {
      targetNodes().firstOrNull { predicate(it.first) }?.let { return it }
      SystemClock.sleep(25)
    }
    throw IllegalStateException("command_target_missing")
  }

  private fun rootTabName(root: String) = if (root == "workout") "index" else root

  private fun drive(nonce: String, action: String, operation: String, sequence: Int) {
    when (operation) {
      "committed-set-visible-dock" -> tap(awaitTarget { it.name.startsWith("Complete Set") }.first.bounds)
      "numeric-edit" -> {
        val callbacksBefore = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), "numeric-edit-commit")
        activate(awaitTarget { it.name.contains("Edit set values") }.second)
        val textbox = awaitTarget { it.role == "textbox" }
        val replacement = if (textbox.second.text?.toString() == "91") "92" else "91"
        replaceText(textbox.second, replacement)
        activate(awaitTarget { it.name.startsWith("Save set values") || it.name.startsWith("Save committed set edit") }.second)
        awaitCallback(nonce, action, operation, sequence, "numeric-edit-commit", callbacksBefore)
      }
      "rest-control" -> {
        val callbacksBefore = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), "rest-adjust-commit")
        val control = awaitTarget { it.name == "Add 15 seconds to rest" && it.state.contains("enabled") }
        activate(control.second)
        awaitCallback(nonce, action, operation, sequence, "rest-adjust-commit", callbacksBefore)
      }
      "search-after-debounce" -> awaitTarget { it.role == "textbox" }.let { tap(it.first.bounds); command("input text press") }
      "calendar-month-selection" -> {
        val metrics = targetContext.resources.displayMetrics; val y = (metrics.heightPixels * .45).roundToInt()
        command("input swipe ${(metrics.widthPixels * .7).roundToInt()} $y ${(metrics.widthPixels * .4).roundToInt()} $y 320")
      }
      "progress-review-open" -> tap(awaitTarget { it.name.contains("Open history") }.first.bounds)
      else -> if (operation.startsWith("root-switch-")) {
        val root = rootForOperation(operation)
        val callbacksBefore = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), "route-ready")
        val targetId = "root-tab-${rootTabName(rootForOperation(operation))}"
        activate(awaitTarget { it.id == targetId }.second)
        awaitCallback(nonce, action, operation, sequence, "route-ready", callbacksBefore)
      }
    }
  }

  private fun pssBytes(): Long {
    val manager = targetContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val managed = manager.getProcessMemoryInfo(intArrayOf(android.os.Process.myPid())).single().totalPss.toLong() * 1024L
    return max(managed, Debug.getPss().toLong() * 1024L)
  }
  private data class FrameCaptureResult(val frames: List<Double>, val missedFrames: Int, val refreshRateHz: Double,
    val profilerOverheadMs: Double, val startMs: Double, val endMs: Double)
  private inner class GestureFrameCapture {
    private val frames = mutableListOf<Double>(); private val overhead = mutableListOf<Double>()
    private var previous = 0L; private var running = false; private var startedAt = 0.0
    private val refresh = (targetContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.refreshRate.toDouble()
    private val callback = object : Choreographer.FrameCallback {
      override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        val callbackStartedAt = elapsedMs()
        synchronized(frames) { if (previous != 0L) frames += (frameTimeNanos - previous) / 1_000_000.0; previous = frameTimeNanos }
        synchronized(overhead) { overhead += elapsedMs() - callbackStartedAt }
        Choreographer.getInstance().postFrameCallback(this)
      }
    }
    fun start() { startedAt = elapsedMs(); running = true; runOnMainSync { Choreographer.getInstance().postFrameCallback(callback) } }
    fun reset() { synchronized(frames) { frames.clear(); previous = 0L }; synchronized(overhead) { overhead.clear() }; startedAt = elapsedMs() }
    fun stop(readyAt: Double): FrameCaptureResult {
      running = false; runOnMainSync { Choreographer.getInstance().removeFrameCallback(callback) }
      val measured = synchronized(frames) { frames.toList() }; val costs = synchronized(overhead) { overhead.toList() }
      if (measured.isEmpty() || !refresh.isFinite() || refresh <= 0) throw IllegalStateException("frame_capture_missing")
      return FrameCaptureResult(measured, measured.sumOf { max(0, (it / (1000.0 / refresh)).roundToInt() - 1) },
        refresh, costs.maxOrNull() ?: 0.0, startedAt, minOf(elapsedMs(), readyAt))
    }
  }

  private fun runOperation(nonce: String, action: String, operation: String, sequence: Int): Run {
    progress(nonce, action, true)
    command("logcat -c")
    val start = elapsedMs(); val pssBefore = pssBytes()
    val frameCapture = if (operation.startsWith("accessibility-") || operation == "calendar-month-selection") GestureFrameCapture().also { it.start() } else null
    val activity = launch(nonce, action, operation, sequence)
    waitForIdleSync()
    if (operation == "calendar-month-selection") {
      awaitCallback(nonce, action, operation, sequence, "route-ready", 0)
      frameCapture?.reset()
    }
    if (operation in setOf("committed-set-visible-dock", "numeric-edit", "rest-control") || operation.startsWith("root-switch-")) {
      awaitMarkers(nonce, action, operation, sequence, "result", 5 * 60_000L)
    }
    if (operation in setOf("committed-set-visible-dock", "numeric-edit", "rest-control", "search-after-debounce",
        "calendar-month-selection", "progress-review-open") || operation.startsWith("root-switch-")) drive(nonce, action, operation, sequence)
    val timeout = if (operation in setOf("phase12-backup", "garmin-json-normalization", "ordinary-js-task")) 20 * 60_000L else 60_000L
    val mergeProgress = mutableSetOf<String>(); val pssGrowth = mutableListOf<Long>()
    val markers = awaitMarkers(nonce, action, operation, sequence, "ready", timeout) { output ->
      if (operation == "phase12-backup") output.lineSequence()
        .filter { it.contains("GYM_TRACKER_PHASE12_BENCHMARK_PROGRESS:") && it.contains("\"stage\":\"merge\"") }
        .forEach { line -> if (mergeProgress.add(line)) pssGrowth += max(0L, pssBytes() - pssBefore) }
    }
    validateMarkers(markers, operation)
    val end = elapsedMs(); if (end <= start) throw IllegalStateException("workload_marker_order_invalid")
    val frameResult = frameCapture?.stop(end) ?: FrameCaptureResult(emptyList(), 0,
      (targetContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.refreshRate.toDouble(), 0.0, start, end)
    if (operation == "phase12-backup" && pssGrowth.size != 10) throw IllegalStateException("phase12_memory_samples_missing")
    return Run(activity, markers, start, end, frameResult.frames, frameResult.missedFrames, frameResult.refreshRateHz, frameResult.profilerOverheadMs,
      frameResult.startMs, frameResult.endMs,
      if (pssGrowth.isEmpty()) listOf(max(0L, pssBytes() - pssBefore)) else pssGrowth)
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
  private fun databaseDigest(nonce: String, operation: String): String {
    val database = File(File(targetContext.filesDir, "SQLite"), databaseName(nonce, operation))
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
  private fun databaseSetDigest(nonce: String) = sha(roots.joinToString("|") { (root, _) ->
    "$root:${databaseDigest(nonce, "root-switch-$root")}"
  })

  private fun targetJson(target: Target, density: Float, targets: List<Target>) = JSONObject()
    .put("id", target.id).put("name", target.name).put("role", target.role).put("state", target.state)
    .put("non_color_cue", target.nonColorCue).put("bounds_dp", JSONObject().put("left", target.bounds.left / density)
      .put("top", target.bounds.top / density).put("width", target.bounds.width() / density).put("height", target.bounds.height() / density))
    .put("overlap", targets.any { it !== target && overlaps(target.bounds, it.bounds) })
  private fun interaction(input: String, targetId: String, activity: Activity, nonce: String, action: String,
    operation: String, sequence: Int): JSONObject {
    val target = awaitTarget { it.id == targetId }
    focus(target.second); val before = focusedNodeId(targetNodes()); val startedAt = elapsedMs()
    val callbackId = if (input == "software-keyboard") "settings-search-change" else "settings-open"
    val callbacksBefore = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), callbackId)
    val event = when (input) { "touch" -> { tap(target.first.bounds); "touch-tap" }; "software-keyboard" -> {
        tap(target.first.bounds)
        val edit = targetNodes().firstOrNull { it.second.isEditable } ?: throw IllegalStateException("software_keyboard_target_missing")
        tap(edit.first.bounds); command("input text quality")
        val ime = activity.window.decorView.rootWindowInsets?.getInsets(WindowInsets.Type.ime())
        if (ime == null || ime.bottom <= ime.top) throw IllegalStateException("software_keyboard_readback_missing")
        lastImeHeightPx = ime.bottom
        "ime-text"
      }
      "hardware-keyboard" -> { key(KeyEvent.KEYCODE_ENTER); "key-enter" }
      "dpad" -> { key(KeyEvent.KEYCODE_DPAD_CENTER); "key-dpad-center" }
      else -> throw IllegalStateException("input_invalid") }
    val callback = awaitCallback(nonce, action, operation, sequence, callbackId, callbacksBefore)
    val callbackCount = callback.value.getJSONObject("payload").getInt("callback_count") - callbacksBefore
    val after = focusedNodeId(targetNodes()); val image = screenshotHash(); val endedAt = elapsedMs()
    if (allNodes().any { (it.text ?: it.contentDescription)?.toString()?.contains("App Settings") == true }) {
      if (input == "software-keyboard") key(KeyEvent.KEYCODE_BACK)
      key(KeyEvent.KEYCODE_BACK); focus(target.second)
    }
    val eventReceipt = sha(canonical(JSONObject().put("input", input).put("event", event).put("focus_before", before)
      .put("focus_after", after).put("start_ms", startedAt).put("end_ms", endedAt)
      .put("callback_receipt_sha256", callback.value.getString("receipt_sha256"))))
    return JSONObject().put("input", input).put("event", event).put("focus_before", before).put("action", "activate")
      .put("focus_after", after).put("command_count", callbackCount).put("callback_count", callbackCount)
      .put("callback_receipt_sha256", callback.value.getString("receipt_sha256")).put("event_receipt_sha256", eventReceipt).put("image_hash", image)
  }
  private fun measureFocusRing(bitmap: Bitmap, bounds: Rect, density: Float): Int {
    val y = bounds.centerY().coerceIn(0, bitmap.height - 1); val edge = bounds.left.coerceIn(0, bitmap.width - 1)
    val color = bitmap.getPixel(edge, y); var pixels = 0
    for (x in edge - 1 downTo max(0, edge - (8 * density).roundToInt())) {
      if (bitmap.getPixel(x, y) != color) pixels += 1 else if (pixels > 0) break
    }
    return (pixels / density).roundToInt()
  }
  private fun modal(root: String, nonce: String, action: String, operation: String, sequence: Int): JSONObject {
    val trigger = targetNodes().firstOrNull { it.first.id.contains("root-settings-trigger") || it.first.name.contains("Settings") }
      ?: throw IllegalStateException("modal_state_missing")
    focus(trigger.second); tap(trigger.first.bounds)
    if (allNodes().none { (it.text ?: it.contentDescription)?.toString()?.contains("App Settings") == true }) throw IllegalStateException("modal_state_missing")
    val modalFocused = targetNodes().firstOrNull { it.second.isFocused || it.second.isAccessibilityFocused }
      ?: throw IllegalStateException("modal_focus_missing")
    val bitmap = uiAutomation.takeScreenshot() ?: throw IllegalStateException("screenshot_missing")
    val ring = measureFocusRing(bitmap, modalFocused.first.bounds, targetContext.resources.displayMetrics.density)
    val backgroundIsolated = targetNodes().none { it.first.id == trigger.first.id }
    val closeBeforeBack = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), "settings-close")
    val backStartedAt = elapsedMs(); val backFocusBefore = modalFocused.first.id
    key(KeyEvent.KEYCODE_BACK)
    val backCallback = awaitCallback(nonce, action, operation, sequence, "settings-close", closeBeforeBack)
    val backCallbackCount = backCallback.value.getJSONObject("payload").getInt("callback_count") - closeBeforeBack
    if (allNodes().any { (it.text ?: it.contentDescription)?.toString()?.contains("App Settings") == true }) throw IllegalStateException("modal_back_failed")
    val backFocusAfter = awaitFocus(trigger.first.id); val backEndedAt = elapsedMs()
    val closeBeforeEscape = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), "settings-close")
    val openBeforeEscape = callbackCount(parseMarkers(command("logcat -d -v raw ReactNativeJS:I '*:S'"), nonce, action, operation, sequence), "settings-open")
    tap(trigger.first.bounds); awaitCallback(nonce, action, operation, sequence, "settings-open", openBeforeEscape)
    val escapeFocusBefore = focusedNodeId(targetNodes()); val escapeStartedAt = elapsedMs(); key(KeyEvent.KEYCODE_ESCAPE)
    val escapeCallback = awaitCallback(nonce, action, operation, sequence, "settings-close", closeBeforeEscape)
    val escapeCallbackCount = escapeCallback.value.getJSONObject("payload").getInt("callback_count") - closeBeforeEscape
    val escapeFocusAfter = awaitFocus(trigger.first.id); val escapeEndedAt = elapsedMs()
    if (!backgroundIsolated || ring != 3) throw IllegalStateException("modal_focus_restore_failed:$root")
    fun event(name: String, focusBefore: String, focusAfter: String, startedAt: Double, endedAt: Double, callback: Marker, callbackCount: Int) = JSONObject()
      .put("event", name).put("focus_before", focusBefore).put("focus_after", focusAfter).put("callback_count", callbackCount)
      .put("callback_receipt_sha256", callback.value.getString("receipt_sha256"))
      .put("event_receipt_sha256", sha(canonical(JSONObject().put("event", name).put("focus_before", focusBefore)
        .put("focus_after", focusAfter).put("start_ms", startedAt).put("end_ms", endedAt)
        .put("callback_receipt_sha256", callback.value.getString("receipt_sha256")))))
    return JSONObject().put("focus_ring_dp", ring).put("focus_offset_dp", ring).put("background_isolated", backgroundIsolated)
      .put("back", event("key-back", backFocusBefore, backFocusAfter, backStartedAt, backEndedAt, backCallback, backCallbackCount))
      .put("escape", event("key-escape", escapeFocusBefore, escapeFocusAfter, escapeStartedAt, escapeEndedAt, escapeCallback, escapeCallbackCount))
      .put("restores_invoker", true)
  }

  private fun accessibility(identity: JSONObject, nonce: String, action: String): JSONArray {
    command("settings put system font_scale 2"); command("settings put secure show_ime_with_hard_keyboard 1")
    val observations = linkedMapOf<String, JSONObject>(); val rootHashes = mutableSetOf<String>()
    var observationSequence = 0
    for ((root, _) in roots) for (mode in listOf("normal", "reduced")) {
      observationSequence += 1
      lastImeHeightPx = 0
      val operation = "accessibility-$root-$mode"; val scenario = scenarios.getValue(root)
      setMotion(mode); val run = runOperation(nonce, action, operation, observationSequence); val before = databaseDigest(nonce, operation)
      val pairs = targetNodes(); val targets = pairs.map(Pair<Target, AccessibilityNodeInfo>::first)
      if (targets.isEmpty()) throw IllegalStateException("semantic_tree_missing")
      val density = targetContext.resources.displayMetrics.density
      val targetArray = JSONArray(targets.map { targetJson(it, density, targets) })
      if (mode == "normal" && !rootHashes.add(sha(canonical(targetArray)))) throw IllegalStateException("duplicate_product_root_semantics")
      val primary = pairs.firstOrNull { it.first.id.contains("root-settings-trigger") || it.first.name.contains("Settings") }
        ?: throw IllegalStateException("modal_invoker_missing")
      val interactions = JSONArray(listOf("touch", "software-keyboard", "hardware-keyboard", "dpad").map {
        interaction(it, primary.first.id, run.activity, nonce, action, operation, observationSequence)
      })
      val screenshot = uiAutomation.takeScreenshot() ?: throw IllegalStateException("screenshot_missing")
      val insets = run.activity.window.decorView.rootWindowInsets; val bars = insets?.getInsets(WindowInsets.Type.systemBars())
      if (targetContext.resources.configuration.fontScale != 2f || lastImeHeightPx <= 0) throw IllegalStateException("settings_readback_invalid")
      val ready = run.marker("ready"); val routeCallbacks = callbackCount(run.markers, "route-ready")
      val motion = JSONObject().put("mode", mode).put("destination", scenario.second)
        .put("callback_count", routeCallbacks).put("frame_callback_count", run.frames.size)
        .put("source_facts_sha256", ready.getString("sqlite_receipt_sha256"))
      motion.put("behavior_receipt_sha256", sha(canonical(motion)))
      val configuration = JSONObject().put("id", configurationId(operation)).put("root", root).put("motion_mode", mode)
        .put("operation", operation).put("fixture_id", scenario.first).put("state_id", scenario.second)
        .put("font_scale", 2).put("density", density)
          .put("content_bounds", JSONObject().put("width", screenshot.width / density).put("height", screenshot.height / density))
          .put("insets", JSONObject().put("top", (bars?.top ?: 0) / density).put("bottom", (bars?.bottom ?: 0) / density))
          .put("ime_bounds", JSONObject().put("top", (screenshot.height - lastImeHeightPx) / density).put("bottom", screenshot.height / density))
      val modal = modal(root, nonce, action, operation, observationSequence)
      val sourceReceipts = JSONObject()
          .put("source_tree_sha256", identity.getString("source_tree_sha256")).put("fixture_sha256", identity.getString("fixture_sha256"))
          .put("source_before_sha256", before).put("source_after_sha256", databaseDigest(nonce, operation))
          .put("state_sha256", ready.getString("readiness_sha256"))
      val eventReceipts = JSONArray((0 until interactions.length()).map { interactions.getJSONObject(it).getString("event_receipt_sha256") })
      val callbackReceipts = JSONArray((0 until interactions.length()).map { interactions.getJSONObject(it).getString("callback_receipt_sha256") })
      val nativeReceipts = JSONObject().put("operation", operation).put("sequence", observationSequence)
        .put("database_name", databaseName(nonce, operation)).put("configuration_sha256", sha(canonical(configuration)))
        .put("command_receipt_sha256", ready.getString("receipt_sha256")).put("readiness_sha256", ready.getString("readiness_sha256"))
        .put("event_receipts_sha256", sha(canonical(eventReceipts))).put("callback_receipts_sha256", sha(canonical(callbackReceipts)))
        .put("modal_receipt_sha256", sha(canonical(modal))).put("motion_receipt_sha256", sha(canonical(motion)))
      observations["$root:$mode"] = JSONObject().put("root", root).put("motion_mode", mode).put("operation", operation)
        .put("fixture_id", scenario.first).put("state_id", scenario.second).put("native_execution", "EXECUTED")
        .put("configuration", configuration).put("targets", targetArray).put("interactions", interactions).put("modal", modal)
        .put("motion", motion).put("source_receipts", sourceReceipts).put("native_receipts", nativeReceipts).put("restored_settings", true)
    }
    return JSONArray(roots.flatMap { listOf(observations.getValue("${it.first}:normal"), observations.getValue("${it.first}:reduced")) })
  }

  private fun timing(runs: List<Run>, endpoint: String, source: String) = JSONObject().put("clock", "android-elapsed-realtime")
    .put("endpoint", endpoint).put("source_tree_sha256", source).put("spans", JSONArray(runs.map { JSONObject().put("start_ms", it.startMs).put("end_ms", it.endMs) }))
  private fun timing(payload: JSONObject, key: String, endpoint: String, source: String): JSONObject {
    val values = array(payload.getJSONObject("samples").get(key))
    val spans = payload.getJSONObject("timings").getJSONArray(key)
    if (spans.length() != values.length()) throw IllegalStateException("timing_endpoint_mismatch")
    for (index in 0 until spans.length()) {
      val span = spans.getJSONObject(index); exact(span, setOf("start_ms", "end_ms"))
      if (abs(span.getDouble("end_ms") - span.getDouble("start_ms") - values.getDouble(index)) > 0.000001) {
        throw IllegalStateException("timing_endpoint_mismatch")
      }
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
  private fun actionReceipt(run: Run, callbackId: String, targetId: String): JSONObject {
    val callback = run.markers.filter { it.kind == "callback" && it.value.optJSONObject("payload")?.optString("callback_id") == callbackId }
      .maxByOrNull { it.value.getJSONObject("payload").getInt("callback_count") }
      ?: throw IllegalStateException("product_callback_missing")
    val payload = callback.value.getJSONObject("payload")
    val resultReceipt = when (callbackId) {
      "numeric-edit-commit" -> payload.optString("value_sha256").also {
        if (!it.matches(Regex("[a-f0-9]{64}"))) throw IllegalStateException("numeric_edit_receipt_invalid")
      }
      "rest-adjust-commit" -> {
        if (payload.optInt("delta_ms") != 15_000 || payload.optInt("rest_revision", -1) < 1) throw IllegalStateException("rest_receipt_invalid")
        sha(canonical(JSONObject().put("delta_ms", payload.getInt("delta_ms")).put("rest_revision", payload.getInt("rest_revision"))))
      }
      "route-ready" -> {
        val expectedRoot = rootForOperation(run.marker("ready").getString("operation"))
        if (payload.optString("rendered_root") != expectedRoot) throw IllegalStateException("root_readiness_invalid")
        sha(canonical(JSONObject().put("rendered_root", expectedRoot)))
      }
      else -> throw IllegalStateException("product_callback_missing")
    }
    return JSONObject().put("sequence", run.marker("ready").getInt("sequence"))
      .put("operation", run.marker("ready").getString("operation")).put("target_id", targetId)
      .put("activation", "accessibility-action").put("callback_id", callbackId)
      .put("callback_count", payload.getInt("callback_count"))
      .put("callback_receipt_sha256", callback.value.getString("receipt_sha256"))
      .put("result_sha256", resultReceipt)
  }
  private fun repeated(nonce: String, operation: String, count: Int) = (1..count).map { runOperation(nonce, "performance", operation, it) }
  private fun resultPayload(run: Run): JSONObject {
    val chunks = run.markers.filter { it.kind == "chunk" }.map { it.value.getJSONObject("payload") }
      .sortedBy { it.getInt("chunk_sequence") }
    if (chunks.isEmpty()) throw IllegalStateException("command_receipt_sha256_missing")
    val total = chunks.first().getInt("chunk_total")
    if (total != chunks.size || chunks.indices.any { chunks[it].getInt("chunk_sequence") != it + 1
        || chunks[it].getInt("chunk_total") != total || chunks[it].getString("chunk").length > 1_500 }) {
      throw IllegalStateException("workload_chunk_invalid")
    }
    val serialized = chunks.joinToString("") { it.getString("chunk") }
    val result = run.marker("result").getJSONObject("payload")
    if (result.getString("payload_sha256") != sha(serialized)) throw IllegalStateException("workload_chunk_digest_invalid")
    return JSONObject(serialized)
  }
  private fun array(value: Any?): JSONArray {
    val values = value as? JSONArray ?: throw IllegalStateException("workload_result_invalid")
    if (values.length() == 0 || (0 until values.length()).any { !values.getDouble(it).isFinite() || values.getDouble(it) < 0 }) throw IllegalStateException("workload_result_invalid")
    return values
  }

  private fun performance(identity: JSONObject, nonce: String, workload: JSONObject, budgets: JSONObject,
    coldLaunch: JSONObject): JSONObject {
    val warm = repeated(nonce, "launch-warm", 20)
    val coldValues = array(coldLaunch.get("durations_ms")); val coldTiming = coldLaunch.getJSONObject("timing")
    val coldCycles = coldLaunch.getJSONArray("cycles")
    if (coldValues.length() != 20 || coldCycles.length() != 20) throw IllegalStateException("cold_launch_evidence_invalid")
    val rootRuns = roots.associate { it.first to repeated(nonce, "root-switch-${it.first}", 100) }
    val sourceBefore = databaseSetDigest(nonce)
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
    val source = identity.getString("source_tree_sha256")
    val rawGarminBaseline = garminSamples.getJSONObject("baseline")
    val garminBaselineArtifact = JSONObject().put("schema_version", 1).put("producer", "phase20-current-source-garmin-baseline/v1")
      .put("source_tree_sha256", source)
      .put("native_path", "modules/garmin-connect/android/src/main/python/garmin_bridge.py#benchmarkDeterministicJson")
      .put("transport", garminSamples.getString("transport")).put("fixture_sha256", garminSamples.getString("fixture_sha256"))
      .put("payload_sha256", rawGarminBaseline.getString("payload_sha256")).put("output_sha256", rawGarminBaseline.getString("output_sha256"))
      .put("fixture_profile", garminSamples.getJSONObject("fixture_profile"))
      .put("normalization_ms", array(rawGarminBaseline.get("normalization_ms")))
      .put("peak_rss_bytes", array(rawGarminBaseline.get("peak_rss_bytes")))
    val garminBaselineJson = canonical(garminBaselineArtifact)
    val garminBaseline = JSONObject().put("source", "phase20-current-source-baseline/v1").put("source_tree_sha256", source)
      .put("artifact_sha256", sha(garminBaselineJson)).put("artifact_json", garminBaselineJson)
      .put("fixture_sha256", garminSamples.getString("fixture_sha256"))
      .put("normalization_ms", garminBaselineArtifact.getJSONArray("normalization_ms"))
      .put("peak_rss_bytes", garminBaselineArtifact.getJSONArray("peak_rss_bytes"))
    fun values(runs: List<Run>) = JSONArray(runs.map(Run::durationMs))
    fun markerValues(runs: List<Run>, startKind: String = "start", endKind: String = "ready") = JSONArray(runs.map {
      it.marker(endKind).getDouble("monotonic_ms") - it.marker(startKind).getDouble("monotonic_ms")
    })
    val samples = JSONObject().put("warm_launch_to_interactive_ms", values(warm)).put("cold_launch_to_interactive_ms", coldValues)
      .put("root_switch_to_useful_ms", JSONObject(rootRuns.mapValues { markerValues(it.value) }))
      .put("committed_set_to_visible_dock_ms", markerValues(dock, "commit"))
      .put("ordinary_js_task_ms", array(phase2Samples.get("js_task_ms")))
      .put("input_response_ms", JSONObject().put("numeric_edit", markerValues(numeric)).put("rest_control", markerValues(rest)))
      .put("search_after_debounce_ms", markerValues(search)).put("calendar_month_and_selection_ms", markerValues(calendar))
      .put("progress_useful_content_ms", markerValues(useful)).put("progress_review_open_ms", markerValues(review)).put("progress_targeted_rebuild_ms", markerValues(rebuild))
      .put("calendar_frame_sequences", JSONArray(calendar.mapIndexed { index, run -> JSONObject().put("sequence", index + 1)
        .put("capture_phase", "calendar-gesture-before-ready").put("start_ms", run.frameStartMs).put("end_ms", run.frameEndMs).put("ready_ms", run.endMs)
        .put("frame_work_ms", JSONArray(run.frames)).put("missed_frames", run.missedFrames)
        .put("refresh_rate_hz", run.refreshRateHz).put("refresh_rate_source", "android-display-mode").put("profiler_overhead_ms", run.profilerOverheadMs) }))
      .put("phase12_dirty_trigger_ms", array(phase12Samples.get("dirty_trigger_ms"))).put("phase12_writer_occupancy_ms", array(phase12Samples.get("writer_occupancy_ms")))
      .put("phase12_merge_preflight_ms", array(phase12Samples.get("merge_preflight_ms"))).put("phase12_merge_materialization_ms", array(phase12Samples.get("merge_materialization_ms")))
      .put("phase12_merge_peak_growth_bytes", JSONArray(phase12.pssGrowthBytes))
      .put("phase12_merge_fixture", JSONObject().put("snapshot_bytes", phase12Samples.getLong("snapshot_bytes")).put("rows", phase12Samples.getLong("total_rows"))
        .put("writer_commits", 5).put("sqlite_max_variable_number", phase12Samples.getLong("sqlite_max_variable_number")))
      .put("garmin_sync_normalization", JSONObject().put("state", "REVIEW_REQUIRED").put("limit_source", "phase20-current-source-baseline/v1")
        .put("transport", garminSamples.getString("transport")).put("fixture_sha256", garminSamples.getString("fixture_sha256"))
        .put("fixture_profile", garminSamples.getJSONObject("fixture_profile"))
        .put("payload_sha256", garminSamples.getString("payload_sha256")).put("output_sha256", garminSamples.getString("output_sha256"))
        .put("runtime_receipt_sha256", garminSamples.getString("runtime_receipt_sha256"))
        .put("normalization_ms", array(garminSamples.get("normalization_ms"))).put("peak_rss_bytes", array(garminSamples.get("peak_rss_bytes")))
        .put("baseline", garminBaseline))
    val timings = JSONObject().put("warm_launch_to_interactive_ms", timing(warm, "process-resume-to-interactive", source))
      .put("cold_launch_to_interactive_ms", coldTiming)
      .put("committed_set_to_visible_dock_ms", markerTiming(dock, "commit", "ready", "authoritative-commit-to-visible-dock", source))
      .put("ordinary_js_task_ms", timing(phase2Result, "ordinary_js_task_ms", "js-task-start-to-end", source))
      .put("search_after_debounce_ms", markerTiming(search, "start", "ready", "debounce-end-to-visible-results", source))
      .put("calendar_month_and_selection_ms", markerTiming(calendar, "start", "ready", "calendar-input-to-visible-selection", source))
      .put("progress_useful_content_ms", markerTiming(useful, "start", "ready", "progress-start-to-useful-content", source))
      .put("progress_review_open_ms", markerTiming(review, "start", "ready", "progress-review-start-to-visible", source))
      .put("progress_targeted_rebuild_ms", markerTiming(rebuild, "start", "ready", "progress-rebuild-start-to-useful-content", source))
      .put("phase12_dirty_trigger_ms", timing(phase12Result, "dirty_trigger_ms", "sqlite-dirty-trigger-start-to-end", source))
      .put("phase12_writer_occupancy_ms", timing(phase12Result, "writer_occupancy_ms", "sqlite-writer-acquire-to-release", source))
      .put("phase12_merge_preflight_ms", timing(phase12Result, "merge_preflight_ms", "merge-preflight-start-to-end", source))
      .put("phase12_merge_materialization_ms", timing(phase12Result, "merge_materialization_ms", "merge-materialization-start-to-end", source))
      .put("root_switch_to_useful_ms", JSONObject(rootRuns.mapValues { markerTiming(it.value, "start", "ready", "root-input-to-useful-content", source) }))
      .put("input_response_ms", JSONObject().put("numeric_edit", markerTiming(numeric, "start", "ready", "input-to-visible-response", source)).put("rest_control", markerTiming(rest, "start", "ready", "input-to-visible-response", source)))
    samples.put("native_receipts", JSONObject().put("build_variant", "release").put("debugger_attached", false)
      .put("source_receipts", JSONObject().put("source_tree_sha256", source).put("fixture_sha256", identity.getString("fixture_sha256"))
        .put("source_before_sha256", sourceBefore).put("source_after_sha256", databaseSetDigest(nonce))
          .put("state_sha256", sha(canonical(samples))))
      .put("timings", timings).put("cold_launch_cycles", coldCycles)
      .put("root_switch_receipts", JSONObject(rootRuns.mapValues { (root, runs) -> JSONArray(runs.map {
        actionReceipt(it, "route-ready", "root-tab-${rootTabName(root)}")
      }) }))
      .put("input_receipts", JSONObject()
        .put("numeric_edit", JSONArray(numeric.map { actionReceipt(it, "numeric-edit-commit", "set-editor-save") }))
        .put("rest_control", JSONArray(rest.map { actionReceipt(it, "rest-adjust-commit", "rest-control-Add 15 seconds to rest") })))
      .put("workload_receipt", phase2Samples.getJSONObject("workload"))
      .put("frame_sequences_sha256", sha(canonical(samples.getJSONArray("calendar_frame_sequences"))))
      .put("merge_peak_growth_sha256", sha(canonical(samples.getJSONArray("phase12_merge_peak_growth_bytes"))))
      .put("ordinary_js_receipt", JSONObject().put("producer", phase2Result.getString("producer"))
        .put("database_name", phase2Result.getString("result_database_name")).put("work_units", phase2Samples.getJSONArray("js_task_ms").length())
        .put("receipt_sha256", phase2Result.getString("command_receipt_sha256")))
      .put("garmin_receipt", JSONObject().put("producer", garminResult.getString("producer"))
        .put("transport", garminSamples.getString("transport")).put("receipt_sha256", garminSamples.getString("runtime_receipt_sha256"))))
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
      val coldLaunch = if (action == "performance") JSONObject(String(Base64.decode(arguments.getString("qualityColdLaunchEvidence"), Base64.DEFAULT))) else JSONObject()
      progress(nonce, action, true)
      val result = JSONObject().put("schema_version", 1).put("action", action).put("identity", identity)
        .put("build_variant", "release").put("debugger_attached", false)
      if (action == "accessibility") result.put("observations", accessibility(identity, nonce, action))
      else result.put("performance", performance(identity, nonce, workload, budgets, coldLaunch))
      output(result, nonce, action); finish(-1, Bundle())
    } catch (_: Throwable) { fail(nonce, action); finish(1, Bundle()) }
  }
}
