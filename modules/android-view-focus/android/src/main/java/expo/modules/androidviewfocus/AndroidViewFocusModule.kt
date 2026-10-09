package expo.modules.androidviewfocus

import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private fun findNativeId(root: View, nativeId: String, tagKey: Int): View? {
  if (root.getTag(tagKey) == nativeId) return root
  if (root is ViewGroup) {
    for (index in 0 until root.childCount) {
      val match = findNativeId(root.getChildAt(index), nativeId, tagKey)
      if (match != null) return match
    }
  }
  return null
}

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
            val tagKey = activity.resources.getIdentifier(
              "view_tag_native_id",
              "id",
              activity.packageName,
            )
            val target = if (root == null || tagKey == 0) {
              null
            } else {
              findNativeId(root, nativeId, tagKey)
            }
            if (target == null) {
              false
            } else {
              target.isFocusable = true
              target.isFocusableInTouchMode = true
              target.requestFocus()
            }
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
