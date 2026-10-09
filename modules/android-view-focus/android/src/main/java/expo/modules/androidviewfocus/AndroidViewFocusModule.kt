package expo.modules.androidviewfocus

import com.facebook.react.uimanager.util.ReactFindViewUtil
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AndroidViewFocusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidViewFocus")

    AsyncFunction("requestFocus") { nativeId: String, promise: Promise ->
      if (nativeId.isBlank()) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }

      try {
        activity.runOnUiThread {
          val focused = try {
            val root = activity.window?.decorView
            val target = root?.let { ReactFindViewUtil.findView(it, nativeId) }
            target?.requestFocus() == true
          } catch (_: RuntimeException) {
            false
          }
          promise.resolve(focused)
        }
      } catch (_: RuntimeException) {
        promise.resolve(false)
      }
    }
  }
}
