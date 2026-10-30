package expo.modules.networkclassifier

import org.junit.Assert.assertEquals
import org.junit.Test

class NetworkClassifierModuleTest {
  @Test
  fun `returns only bounded network classes`() {
    assertEquals(NETWORK_UNAVAILABLE, classifyNetworkForTest(false, false, false, false, false))
    assertEquals(NETWORK_UNAVAILABLE, classifyNetworkForTest(true, false, true, false, false))
    assertEquals(NETWORK_WIFI, classifyNetworkForTest(true, true, true, false, false))
    assertEquals(NETWORK_CELLULAR_OR_METERED, classifyNetworkForTest(true, true, false, true, false))
    assertEquals(NETWORK_CELLULAR_OR_METERED, classifyNetworkForTest(true, true, true, false, true))
    assertEquals(NETWORK_UNKNOWN, classifyNetworkForTest(true, true, false, false, false))
  }
}
