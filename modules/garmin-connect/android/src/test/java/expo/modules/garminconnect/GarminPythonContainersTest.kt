package expo.modules.garminconnect

import org.junit.Assert.*
import org.junit.Test

/** Pure container codec tests. These are host fakes, not installed Chaquopy evidence. */
class GarminPythonContainersTest {
  private fun codec(bytesFromList: (Any) -> Any = {
    (it as List<*>).map { item -> (item as Int).toByte() }.toByteArray()
  }) = GarminPythonContainers<Any>(
    create = { if (it == "dict") linkedMapOf<Any?, Any?>() else mutableListOf<Any?>() },
    fromScalar = { it },
    bytesFromList = bytesFromList,
    type = { when (it) {
      is Map<*, *> -> GarminPythonKind.DICT
      is List<*> -> GarminPythonKind.LIST
      is Boolean -> GarminPythonKind.BOOLEAN
      is Long, is Int -> GarminPythonKind.INTEGER
      is Double -> GarminPythonKind.FLOAT
      is String -> GarminPythonKind.STRING
      else -> GarminPythonKind.UNSUPPORTED
    } },
    readScalar = { value, kind -> when (kind) {
      GarminPythonKind.INTEGER -> (value as Number).toLong()
      else -> value
    } },
    mapView = { @Suppress("UNCHECKED_CAST") (it as MutableMap<Any?, Any?>) },
    listView = { @Suppress("UNCHECKED_CAST") (it as MutableList<Any?>) },
  )

  @Test
  fun `arguments become a Python dict with typed scalars and unsigned bytes not Java proxies`() {
    val codec = codec()
    val values = mutableMapOf<String, Any>("email" to "owner", "password" to "synthetic-secret")
    val converted = codec.arguments(values) as MutableMap<*, *>
    assertEquals(values, converted)
    assertNotSame(values, converted)
    values.clear()
    assertEquals("owner", converted["email"])
    assertEquals(mapOf("start" to 0, "limit" to 50), codec.arguments(mapOf("start" to 0, "limit" to 50)))
    assertEquals(emptyMap<String, Any>(), codec.arguments(emptyMap()))
    val bytes = byteArrayOf(0, 127, -128, -1)
    val restored = codec.arguments(mapOf("tokenPayload" to bytes)) as Map<*, *>
    assertArrayEquals(bytes, restored["tokenPayload"] as ByteArray)
    assertNotSame(bytes, restored["tokenPayload"])
    assertArrayEquals(byteArrayOf(0, 127, -128, -1), bytes)
  }

  @Test
  fun `opaque byte staging is cleared even when Python bytes construction fails`() {
    var staged: List<*>? = null
    val codec = codec {
      staged = it as List<*>
      assertEquals(listOf(0, 127, 128, 255), staged)
      throw IllegalStateException("injected_conversion_failure")
    }
    val payload = byteArrayOf(0, 127, -128, -1)
    assertThrows(IllegalStateException::class.java) { codec.arguments(mapOf("tokenPayload" to payload)) }
    assertTrue(staged!!.isEmpty())
    assertArrayEquals(byteArrayOf(0, 127, -128, -1), payload)
  }

  @Test
  fun `argument conversion rejects unsupported values and bounds without stringifying them`() {
    for (arguments in listOf(
      mapOf("value" to Any()), mapOf("value" to true), mapOf("value" to 1L),
      mapOf("value" to "x".repeat(1_000_001)), mapOf("tokenPayload" to ByteArray(65_537)),
      mapOf("" to 1), mapOf("x".repeat(129) to 1),
      (0..16).associate { "k$it" to it },
    )) {
      assertEquals("arguments_rejected", assertThrows(GarminWorkerException::class.java) {
        codec().arguments(arguments)
      }.code)
    }
    assertEquals(1_000_000, ((codec().arguments(mapOf("payloadJson" to "x".repeat(1_000_000))) as Map<*, *>)["payloadJson"] as String).length)
    assertEquals(65_536, ((codec().arguments(mapOf("tokenPayload" to ByteArray(65_536))) as Map<*, *>)["tokenPayload"] as ByteArray).size)
    assertEquals(0, ((codec().arguments(mapOf("tokenPayload" to byteArrayOf())) as Map<*, *>)["tokenPayload"] as ByteArray).size)
  }

  @Test
  fun `dict list and scalar results are detached Java containers including Python None`() {
    val source = linkedMapOf<Any?, Any?>("status" to "ok", "generation" to 1,
      "data" to mutableListOf(null, true, false, 42, 1.5, "text", linkedMapOf<Any?, Any?>("items" to mutableListOf<Any?>())))
    val converted = codec().resultMap(source)
    assertEquals(1, converted["generation"])
    val data = converted["data"] as List<*>
    assertEquals(listOf(null, true, false, 42, 1.5, "text", mapOf("items" to emptyList<Any?>())), data)
    source.clear()
    assertEquals("ok", converted["status"])
    assertEquals(mapOf("operation_rejection" to "operation_rejected"), codec().stringMap(linkedMapOf<Any?, Any?>("operation_rejection" to "operation_rejected")))
    assertEquals(listOf(mapOf("id" to "PH18-ADV-401", "call_count" to 2)), codec().mapList(mutableListOf(linkedMapOf<Any?, Any?>("id" to "PH18-ADV-401", "call_count" to 2))))
    assertEquals(emptyMap<String, Any?>(), codec().resultMap(linkedMapOf<Any?, Any?>()))
    assertEquals(emptyList<Map<String, Any?>>(), codec().mapList(mutableListOf<Any?>()))
  }

  @Test
  fun `result conversion rejects unsupported container families keys and scalar bounds`() {
    val codec = codec()
    for (value in listOf(null, "not a dict", mutableListOf<Any?>(), linkedMapOf<Any?, Any?>(null to 1), linkedMapOf<Any?, Any?>(1 to "value"), linkedMapOf<Any?, Any?>("data" to Any()),
      linkedMapOf<Any?, Any?>("data" to Double.NaN), linkedMapOf<Any?, Any?>("data" to Double.POSITIVE_INFINITY),
      linkedMapOf<Any?, Any?>("data" to 9_007_199_254_740_992.0), linkedMapOf<Any?, Any?>("data" to -9_007_199_254_740_992L),
      linkedMapOf<Any?, Any?>("data" to 9_007_199_254_740_992L), linkedMapOf<Any?, Any?>("data" to Long.MIN_VALUE),
      linkedMapOf<Any?, Any?>("data" to "x".repeat(2_000_001)),
    )) assertEquals("malformed_response", assertThrows(GarminWorkerException::class.java) { codec.resultMap(value) }.code)
    for (value in listOf(null, "not a list", mutableListOf<Any?>(null), mutableListOf<Any?>(1))) {
      assertThrows(GarminWorkerException::class.java) { codec.mapList(value) }
    }
    assertThrows(GarminWorkerException::class.java) { codec.stringMap(linkedMapOf<Any?, Any?>("code" to 1)) }
    assertThrows(GarminWorkerException::class.java) { codec.stringMap(linkedMapOf<Any?, Any?>("code" to null)) }
    val limits = linkedMapOf<Any?, Any?>("a" to 9_007_199_254_740_991L, "b" to -9_007_199_254_740_991.0, "c" to "x".repeat(1_000_000), "d" to -9_007_199_254_740_991L)
    assertEquals(limits, codec.resultMap(limits))
  }

  @Test
  fun `benchmark normalized JSON may expand beyond the bounded one MB input envelope`() {
    val normalized = "x".repeat(1_100_000)
    assertEquals(normalized, codec().resultMap(linkedMapOf<Any?, Any?>("normalizedJson" to normalized))["normalizedJson"])
  }

  @Test
  fun `integer conversion preserves runtime schema Int and larger signed JSON values`() {
    val converted = codec().resultMap(linkedMapOf<Any?, Any?>(
      "schemaVersion" to 1L, "pythonVersion" to "3.13", "clientVersion" to "0.3.17",
      "clientCommit" to "218e72ca5459e014435fc2d94fd18bd601fa0c14", "abi" to "arm64-v8a",
      "capabilities" to mutableListOf<Any?>("runtimeInfo"),
    ))
    assertTrue(converted["schemaVersion"] is Int)
    GarminRuntimeInfo.fromPython(converted)
    val bounds = codec().resultMap(linkedMapOf<Any?, Any?>(
      "min" to Int.MIN_VALUE.toLong(), "max" to Int.MAX_VALUE.toLong(),
      "below" to Int.MIN_VALUE.toLong() - 1, "above" to Int.MAX_VALUE.toLong() + 1,
    ))
    assertEquals(Int.MIN_VALUE, bounds["min"])
    assertEquals(Int.MAX_VALUE, bounds["max"])
    assertEquals(Int.MIN_VALUE.toLong() - 1, bounds["below"])
    assertEquals(Int.MAX_VALUE.toLong() + 1, bounds["above"])
  }

  @Test
  fun `conversion bounds reserve the envelope while worker enforces unchanged private data limits`() {
    val codec = codec()
    var value: Any? = null
    repeat(18) { value = mutableListOf(value) }
    codec.resultMap(linkedMapOf<Any?, Any?>("data" to value))
    value = mutableListOf(value)
    assertThrows(GarminWorkerException::class.java) { codec.resultMap(linkedMapOf<Any?, Any?>("data" to value)) }
    codec.resultMap(linkedMapOf<Any?, Any?>("data" to MutableList<Any?>(25_014) { null }))
    assertThrows(GarminWorkerException::class.java) { codec.resultMap(linkedMapOf<Any?, Any?>("data" to MutableList<Any?>(25_015) { null })) }
  }
}
