"""Focused NON_NATIVE_HOST_ONLY checks; uses cached compiler jars, no Gradle/APK."""
from pathlib import Path
import os
import subprocess
import tempfile

HOST = Path(__file__).resolve().parent
SOURCE = HOST.parents[1]
CACHE = Path.home() / '.gradle/caches/modules-2/files-2.1'


def jar(group, artifact, version):
    matches = list((CACHE / group / artifact / version).glob(f'*/{artifact}-{version}.jar'))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one cached {artifact} {version}')
    return matches[0]


java_home = Path(subprocess.check_output(['/usr/libexec/java_home', '-v', '17'], text=True).strip())
java = java_home / 'bin/java'
stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20')
annotations = jar('org.jetbrains', 'annotations', '13.0')
compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'), stdlib,
            jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
            jar('org.jetbrains.kotlin', 'kotlin-reflect', '2.1.20'), annotations,
            jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
            jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.9.0')]

with tempfile.TemporaryDirectory(prefix='gym-navigation-key-host-') as temporary:
    output = Path(temporary)
    fake_api = output / 'AndroidNavigationApi.kt'
    fake_api.write_text('''package android.view
class KeyEvent(val action: Int, val keyCode: Int) {
  companion object {
    const val ACTION_DOWN = 0; const val ACTION_UP = 1
    const val KEYCODE_TAB = 61; const val KEYCODE_ESCAPE = 111
    const val KEYCODE_DPAD_UP = 19; const val KEYCODE_DPAD_DOWN = 20
    const val KEYCODE_DPAD_LEFT = 21; const val KEYCODE_DPAD_RIGHT = 22
    const val KEYCODE_DPAD_CENTER = 23
  }
}
class Window(var callback: Callback?) {
  interface Callback {
    fun dispatchKeyEvent(event: KeyEvent): Boolean
    fun dispatchKeyShortcutEvent(event: KeyEvent): Boolean
  }
}
''')
    classes = output / 'classes'
    subprocess.run([str(java), '-cp', os.pathsep.join(map(str, compiler)),
                    'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect',
                    '-jvm-target', '17', '-classpath', os.pathsep.join(map(str, [stdlib, annotations])),
                    '-d', str(classes), str(fake_api),
                    str(SOURCE / 'main/java/expo/modules/androidviewfocus/NavigationKeyObserver.kt'),
                    str(HOST / 'NavigationKeyObserverHostTest.kt')], check=True)
    subprocess.run([str(java), '-cp', os.pathsep.join(map(str, [classes, stdlib])),
                    'expo.modules.androidviewfocus.NavigationKeyObserverHostTestKt'], check=True)
