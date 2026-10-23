package expo.modules.garminconnect

internal enum class GarminPythonKind { DICT, LIST, BOOLEAN, INTEGER, FLOAT, STRING, UNSUPPORTED }

/**
 * Explicit container conversion, independent of Chaquopy's Java proxy conversion.
 * The API functions are internal fixed builtins and scalar conversions, never provider methods.
 * Result conversion reserves room for the envelope; GarminClientWorker still applies the
 * unchanged depth/node/string/private-row limits to data. Benchmark input stays bounded at 1MB;
 * canonical float formatting can expand its output, so the transport string ceiling is 2MB.
 */
internal class GarminPythonContainers<T : Any>(
  private val create: (String) -> T,
  private val fromScalar: (Any) -> T,
  private val bytesFromList: (T) -> T,
  private val type: (T) -> GarminPythonKind,
  private val readScalar: (T, GarminPythonKind) -> Any,
  private val mapView: (T) -> MutableMap<T?, T?>,
  private val listView: (T) -> MutableList<T?>,
) {
  fun arguments(arguments: Map<String, Any>): T {
    if (arguments.size > 16) throw GarminWorkerException("arguments_rejected")
    val result = create("dict")
    val target = mapView(result)
    for ((key, value) in arguments) {
      if (key.isEmpty() || key.length > 128) throw GarminWorkerException("arguments_rejected")
      val converted = when (value) {
        is String -> {
          if (value.length > 1_000_000) throw GarminWorkerException("arguments_rejected")
          fromScalar(value)
        }
        is Int -> fromScalar(value)
        is ByteArray -> {
          if (value.size > 65_536) throw GarminWorkerException("arguments_rejected")
          val sequence = create("list")
          val items = listView(sequence)
          try {
            value.forEach { items.add(fromScalar(it.toInt() and 255)) }
            bytesFromList(sequence)
          } finally {
            items.clear()
          }
        }
        else -> throw GarminWorkerException("arguments_rejected")
      }
      target[fromScalar(key)] = converted
    }
    return result
  }

  fun resultMap(value: T?): Map<String, Any?> = requireMap(read(value, 0, intArrayOf(0)))

  fun stringMap(value: T?): Map<String, String> = resultMap(value).mapValues { (_, child) ->
    child as? String ?: throw GarminWorkerException("malformed_response")
  }

  fun mapList(value: T?): List<Map<String, Any?>> {
    val result = read(value, 0, intArrayOf(0)) as? List<*>
      ?: throw GarminWorkerException("malformed_response")
    return result.map(::requireMap)
  }

  private fun requireMap(value: Any?): Map<String, Any?> {
    @Suppress("UNCHECKED_CAST")
    return value as? Map<String, Any?> ?: throw GarminWorkerException("malformed_response")
  }

  private fun read(value: T?, depth: Int, nodes: IntArray): Any? {
    nodes[0] += 1
    if (depth > 19 || nodes[0] > 25_016) throw GarminWorkerException("malformed_response")
    if (value == null) return null // Chaquopy represents Python None as Java null.
    return when (val kind = type(value)) {
      GarminPythonKind.BOOLEAN -> readScalar(value, kind) as Boolean
      GarminPythonKind.INTEGER -> {
        val integer = readScalar(value, kind) as Long
        if (integer !in -9_007_199_254_740_991L..9_007_199_254_740_991L) throw GarminWorkerException("malformed_response")
        // RuntimeInfo's schemaVersion is an Int; retain larger JSON integers losslessly.
        if (integer in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) integer.toInt() else integer
      }
      GarminPythonKind.FLOAT -> (readScalar(value, kind) as Double).also {
        if (!it.isFinite() || kotlin.math.abs(it) > 9_007_199_254_740_991.0) throw GarminWorkerException("malformed_response")
      }
      GarminPythonKind.STRING -> (readScalar(value, kind) as String).also {
        if (it.length > 2_000_000) throw GarminWorkerException("malformed_response")
      }
      GarminPythonKind.DICT -> mapView(value).entries.associate { (key, child) ->
        if (key == null || type(key) != GarminPythonKind.STRING) throw GarminWorkerException("malformed_response")
        (readScalar(key, GarminPythonKind.STRING) as String) to read(child, depth + 1, nodes)
      }
      GarminPythonKind.LIST -> listView(value).map { read(it, depth + 1, nodes) }
      GarminPythonKind.UNSUPPORTED -> throw GarminWorkerException("malformed_response")
    }
  }
}
