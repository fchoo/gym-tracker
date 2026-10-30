package expo.modules.networkclassifier

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal const val NETWORK_WIFI = "wifi"
internal const val NETWORK_CELLULAR_OR_METERED = "cellular_or_metered"
internal const val NETWORK_UNAVAILABLE = "unavailable"
internal const val NETWORK_UNKNOWN = "unknown"

internal fun classifyNetworkForTest(
  available: Boolean,
  validated: Boolean,
  wifi: Boolean,
  cellular: Boolean,
  metered: Boolean
): String {
  if (!available || !validated) return NETWORK_UNAVAILABLE
  if (wifi && !metered) return NETWORK_WIFI
  if (cellular || metered) return NETWORK_CELLULAR_OR_METERED
  return NETWORK_UNKNOWN
}

private fun currentNetworkClass(context: Context?): String {
  if (context == null) return NETWORK_UNKNOWN
  return try {
    val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: return NETWORK_UNKNOWN
    val network = connectivity.activeNetwork ?: return NETWORK_UNAVAILABLE
    val capabilities = connectivity.getNetworkCapabilities(network) ?: return NETWORK_UNAVAILABLE
    classifyNetworkForTest(
      available = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
      validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
      wifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
      cellular = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
      metered = connectivity.isActiveNetworkMetered
    )
  } catch (_: SecurityException) {
    NETWORK_UNKNOWN
  } catch (_: RuntimeException) {
    NETWORK_UNKNOWN
  }
}

class NetworkClassifierModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NetworkClassifier")
    AsyncFunction("current") {
      currentNetworkClass(appContext.reactContext)
    }
  }
}
