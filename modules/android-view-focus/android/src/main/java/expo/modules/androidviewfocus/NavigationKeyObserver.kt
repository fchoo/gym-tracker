package expo.modules.androidviewfocus

import android.view.KeyEvent
import android.view.Window
import java.util.concurrent.atomic.AtomicLong

/** A count of navigation input, without recording characters or raw key data. */
internal object NavigationKeyEpoch {
  private val epoch = AtomicLong(0)

  fun current(): Double = epoch.get().toDouble()

  fun observe(event: KeyEvent) {
    if (event.action != KeyEvent.ACTION_DOWN) return
    when (event.keyCode) {
      KeyEvent.KEYCODE_TAB,
      KeyEvent.KEYCODE_DPAD_UP,
      KeyEvent.KEYCODE_DPAD_DOWN,
      KeyEvent.KEYCODE_DPAD_LEFT,
      KeyEvent.KEYCODE_DPAD_RIGHT,
      KeyEvent.KEYCODE_DPAD_CENTER,
      KeyEvent.KEYCODE_ESCAPE -> epoch.incrementAndGet()
    }
  }
}

/** Observe before normal dispatch can move focus; preserve the Escape contract. */
internal fun dispatchEscapeBoundaryKeyEvent(
  event: KeyEvent,
  onEscape: () -> Unit,
  dispatchNormal: (KeyEvent) -> Boolean,
): Boolean {
  NavigationKeyEpoch.observe(event)
  if (event.keyCode == KeyEvent.KEYCODE_ESCAPE) {
    if (event.action == KeyEvent.ACTION_UP) onEscape()
    return true
  }
  return dispatchNormal(event)
}

private class NavigationWindowCallback(
  val delegate: Window.Callback,
) : Window.Callback by delegate {
  private var observing = true

  fun stopObserving() { observing = false }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (observing) NavigationKeyEpoch.observe(event)
    return delegate.dispatchKeyEvent(event)
  }

  override fun dispatchKeyShortcutEvent(event: KeyEvent): Boolean {
    if (observing) NavigationKeyEpoch.observe(event)
    return delegate.dispatchKeyShortcutEvent(event)
  }
}

/** Called on the UI thread; never overwrites another owner's callback on detach. */
internal class NavigationKeyObserver {
  private var observedWindow: Window? = null
  private var observedCallback: NavigationWindowCallback? = null

  fun attach(window: Window) {
    if (observedWindow === window && window.callback === observedCallback) return
    detach()
    val delegate = window.callback ?: return
    val callback = NavigationWindowCallback(delegate)
    window.callback = callback
    observedWindow = window
    observedCallback = callback
  }

  fun detach() {
    val window = observedWindow
    val callback = observedCallback
    // A later wrapper may retain ours. Disable it even when it is no longer topmost.
    callback?.stopObserving()
    if (callback != null && window?.callback === callback) {
      window.callback = callback.delegate
    }
    observedWindow = null
    observedCallback = null
  }
}
