package expo.modules.androidviewfocus

import android.view.KeyEvent
import android.view.Window

private class Delegate : Window.Callback {
  var onDispatch: (KeyEvent) -> Boolean = { false }
  override fun dispatchKeyEvent(event: KeyEvent): Boolean = onDispatch(event)
  override fun dispatchKeyShortcutEvent(event: KeyEvent): Boolean = onDispatch(event)
}

private fun case(name: String, test: () -> Unit) {
  test()
  println("PASS $name")
}

fun main() {
  case("Activity Tab advances before normal focus dispatch and preserves its result") {
    val observer = NavigationKeyObserver()
    val delegate = Delegate()
    val window = Window(delegate)
    observer.attach(window)
    val before = NavigationKeyEpoch.current()
    val tab = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_TAB)
    delegate.onDispatch = {
      check(it === tab)
      check(NavigationKeyEpoch.current() > before)
      false
    }
    check(window.callback?.dispatchKeyEvent(tab) == false)
    observer.detach()
    check(window.callback === delegate)
  }

  case("Modal D-pad advances before normal dispatch without consuming navigation") {
    val before = NavigationKeyEpoch.current()
    val event = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_DOWN)
    check(dispatchEscapeBoundaryKeyEvent(event, { error("Unexpected Escape") }) {
      check(it === event)
      check(NavigationKeyEpoch.current() > before)
      true
    })
  }

  case("Escape is consumed on both edges and emits once on release") {
    var escapeCalls = 0
    var normalCalls = 0
    val before = NavigationKeyEpoch.current()
    for (action in listOf(KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP)) {
      check(dispatchEscapeBoundaryKeyEvent(KeyEvent(action, KeyEvent.KEYCODE_ESCAPE), {
        escapeCalls += 1
      }) { normalCalls += 1; false })
    }
    check(escapeCalls == 1 && normalCalls == 0)
    check(NavigationKeyEpoch.current() == before + 1)
  }

  case("Only navigation downs advance; characters and releases retain normal dispatch") {
    val before = NavigationKeyEpoch.current()
    NavigationKeyEpoch.observe(KeyEvent(KeyEvent.ACTION_DOWN, 29))
    NavigationKeyEpoch.observe(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_TAB))
    check(NavigationKeyEpoch.current() == before)
    val keys = listOf(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
      KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_CENTER)
    keys.forEach { NavigationKeyEpoch.observe(KeyEvent(KeyEvent.ACTION_DOWN, it)) }
    check(NavigationKeyEpoch.current() == before + keys.size)
  }

  case("Observer attach is idempotent and Activity replacement releases the old callback") {
    val observer = NavigationKeyObserver()
    val firstDelegate = Delegate()
    val first = Window(firstDelegate)
    observer.attach(first)
    val originalWrapper = first.callback
    observer.attach(first)
    check(first.callback === originalWrapper)
    val secondDelegate = Delegate()
    val second = Window(secondDelegate)
    observer.attach(second)
    check(first.callback === firstDelegate)
    val before = NavigationKeyEpoch.current()
    originalWrapper?.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_TAB))
    check(NavigationKeyEpoch.current() == before)
    observer.detach()
    check(second.callback === secondDelegate)
  }

  case("Detach preserves later callback owners and disables retained wrappers") {
    val observer = NavigationKeyObserver()
    val window = Window(Delegate())
    observer.attach(window)
    val installed = checkNotNull(window.callback)
    val laterOwner = object : Window.Callback by installed {}
    window.callback = laterOwner
    observer.detach()
    check(window.callback === laterOwner)
    val before = NavigationKeyEpoch.current()
    val tab = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_TAB)
    window.callback?.dispatchKeyEvent(tab)
    check(NavigationKeyEpoch.current() == before)
    observer.attach(window)
    window.callback?.dispatchKeyShortcutEvent(tab)
    check(NavigationKeyEpoch.current() == before + 1)
    observer.detach()
    check(window.callback === laterOwner)
  }
}
