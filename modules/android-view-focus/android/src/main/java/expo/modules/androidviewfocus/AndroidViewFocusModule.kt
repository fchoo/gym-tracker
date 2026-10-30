package expo.modules.androidviewfocus

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.app.AlarmManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.util.Log
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

@SuppressLint("ViewConstructor")
class AndroidEscapeBoundaryView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val onEscape by EventDispatcher<Unit>()

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    return dispatchEscapeBoundaryKeyEvent(event, { onEscape(Unit) }) {
      super.dispatchKeyEvent(it)
    }
  }
}

private fun findNativeId(root: View, nativeId: String, tagKey: Int): View? {
  if (root.isShown && root.getTag(tagKey) == nativeId) return root
  if (root is ViewGroup) {
    for (index in 0 until root.childCount) {
      val match = findNativeId(root.getChildAt(index), nativeId, tagKey)
      if (match != null) return match
    }
  }
  return null
}

private fun findVisibleContentDescription(root: View, label: String): View? {
  if (root.isShown && root.contentDescription?.toString() == label) return root
  if (root is ViewGroup) {
    for (index in 0 until root.childCount) {
      val match = findVisibleContentDescription(root.getChildAt(index), label)
      if (match != null) return match
    }
  }
  return null
}

class AndroidViewFocusModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val navigationKeyObserver = NavigationKeyObserver()
  @Volatile private var destroyed = false

  private fun onMainThread(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action()
    else mainHandler.post { action() }
  }

  private fun observeActivityNavigation() {
    onMainThread {
      if (destroyed) return@onMainThread
      val activity = appContext.currentActivity ?: return@onMainThread
      if (!activity.isDestroyed && !activity.isFinishing) {
        navigationKeyObserver.attach(activity.window)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AndroidViewFocus")

    OnCreate { observeActivityNavigation() }
    OnActivityEntersForeground { observeActivityNavigation() }
    OnActivityDestroys { onMainThread { navigationKeyObserver.detach() } }
    OnDestroy {
      destroyed = true
      onMainThread { navigationKeyObserver.detach() }
    }

    Function("getNavigationKeyEpoch") { NavigationKeyEpoch.current() }

    Function("canScheduleExactRestAlarm") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) true
      else (appContext.reactContext?.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)
        ?.canScheduleExactAlarms() == true
    }

    AsyncFunction("openExactRestAlarmSettings") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        promise.resolve(false)
        return@AsyncFunction
      }
      onMainThread {
        val activity = appContext.currentActivity
        if (destroyed || activity == null || activity.isDestroyed || activity.isFinishing) {
          promise.resolve(false)
        } else {
          try {
            // Explicit user action only; Android owns granting this special access.
            // https://developer.android.com/develop/background-work/services/alarms#exact-permission
            activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
              data = Uri.parse("package:${activity.packageName}")
            })
            promise.resolve(true)
          } catch (_: RuntimeException) {
            promise.resolve(false)
          }
        }
      }
    }

    View(AndroidEscapeBoundaryView::class) {
      Events("onEscape")
    }

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
          val root = activity.window?.decorView
          val tagKey = activity.resources.getIdentifier(
            "view_tag_native_id",
            "id",
            activity.packageName,
          )
          var attempts = 0
          val focusAttempt = object : Runnable {
            override fun run() {
              attempts += 1
              val focused = try {
                val target = if (root == null) null else {
                  val byNativeId = if (tagKey == 0) null else findNativeId(root, nativeId, tagKey)
                  byNativeId ?: findVisibleContentDescription(root, "Open App Settings")
                }
                if (target == null) {
                  false
                } else {
                  target.isFocusable = true
                  target.isFocusableInTouchMode = true
                  target.requestFocusFromTouch() || target.requestFocus()
                }
              } catch (_: RuntimeException) {
                false
              }
              if (focused || attempts >= 10 || root == null) {
                Log.i("AndroidViewFocus", "requestFocus completed focused=$focused attempts=$attempts")
                promise.resolve(focused)
              } else {
                root.postDelayed(this, 100)
              }
            }
          }
          root?.post(focusAttempt) ?: promise.resolve(false)
        }
      } catch (_: RuntimeException) {
        promise.resolve(false)
      }
    }
  }
}
