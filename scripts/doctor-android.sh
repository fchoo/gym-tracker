#!/bin/sh

set -eu

expected_node='v24.19.0'
expected_npm='11.17.0'
expected_java='17.0.20'
expected_maestro='2.8.0'
default_android_home='/opt/homebrew/share/android-commandlinetools'

case "$(uname -m)" in
  arm64 | aarch64) system_image_abi='arm64-v8a' ;;
  x86_64 | amd64) system_image_abi='x86_64' ;;
  *)
    printf 'doctor-android: unsupported host architecture: %s\n' "$(uname -m)" >&2
    exit 1
    ;;
esac

fail() {
  printf 'doctor-android: %s\n' "$1" >&2
  printf 'remediation: %s\n' "$2" >&2
  exit 1
}

if [ -z "${JAVA_HOME:-}" ] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
  JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
fi
ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$default_android_home}}
ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$ANDROID_HOME}
PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
for maestro_directory in "$HOME/.maestro/bin" "$HOME/.local/bin"; do
  [ -d "$maestro_directory" ] && PATH="$maestro_directory:$PATH"
done
export JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT PATH

command -v node >/dev/null 2>&1 ||
  fail 'Node.js is missing.' 'Run: source /opt/homebrew/opt/nvm/libexec/nvm.sh && nvm install 24.19.0 && nvm use 24.19.0'
[ "$(node --version)" = "$expected_node" ] ||
  fail "Node.js must be $expected_node; found $(node --version)." 'Run: source /opt/homebrew/opt/nvm/libexec/nvm.sh && nvm use 24.19.0'

command -v npm >/dev/null 2>&1 ||
  fail 'npm is missing.' 'Run: npm install --global npm@11.17.0'
[ "$(npm --version)" = "$expected_npm" ] ||
  fail "npm must be $expected_npm; found $(npm --version)." 'Run: npm install --global npm@11.17.0'

[ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ] ||
  fail 'Temurin Java 17 is missing.' 'Install Temurin 17.0.20+8, then export JAVA_HOME=$(/usr/libexec/java_home -v 17).'
java_version=$("$JAVA_HOME/bin/java" -version 2>&1 | awk -F'"' '/version/ { print $2; exit }')
[ "$java_version" = "$expected_java" ] ||
  fail "Java must be Temurin $expected_java; found ${java_version:-unknown}." 'Install Temurin 17.0.20+8 and export JAVA_HOME=$(/usr/libexec/java_home -v 17).'

[ -d "$ANDROID_HOME" ] ||
  fail "Android SDK root is missing at $ANDROID_HOME." "Export ANDROID_HOME=$default_android_home."
[ "$ANDROID_SDK_ROOT" = "$ANDROID_HOME" ] ||
  fail 'ANDROID_HOME and ANDROID_SDK_ROOT must match.' "Export both variables to $ANDROID_HOME."

for executable in sdkmanager adb emulator; do
  command -v "$executable" >/dev/null 2>&1 ||
    fail "$executable is missing from the Android SDK." "Install it with sdkmanager under $ANDROID_HOME and keep the SDK paths on PATH."
done

for path in \
  'platform-tools/adb' \
  'platforms/android-36/android.jar' \
  'build-tools/36.0.0/zipalign' \
  'ndk/27.1.12297006/source.properties' \
  'cmake/3.22.1/bin/cmake' \
  'emulator/emulator' \
  "system-images/android-36/google_apis/$system_image_abi/package.xml"; do
  [ -e "$ANDROID_HOME/$path" ] ||
    fail "Android SDK component is missing: $path." 'Run the pinned sdkmanager command from 01-01-PLAN.md; do not create a second SDK root.'
done

avdmanager list avd 2>/dev/null | grep -q 'Name: gym-tracker-api36' ||
  fail 'AVD gym-tracker-api36 is missing.' "Run: echo no | avdmanager create avd --name gym-tracker-api36 --package \"system-images;android-36;google_apis;$system_image_abi\" --device \"pixel_7\""

command -v maestro >/dev/null 2>&1 ||
  fail 'Maestro is missing.' 'Run: sh scripts/install-maestro.sh'
maestro_version=$(maestro --version 2>/dev/null | tail -n 1)
[ "$maestro_version" = "$expected_maestro" ] ||
  fail "Maestro must be $expected_maestro; found ${maestro_version:-unknown}." 'Run: sh scripts/install-maestro.sh'

device_serial=${GYM_TRACKER_ANDROID_SERIAL:-}
if [ -z "$device_serial" ]; then
  device_serial=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
fi
[ -n "$device_serial" ] ||
  fail 'No Android device is connected.' 'Start the existing gym-tracker-api36 AVD, then wait for adb shell getprop sys.boot_completed to return 1.'
device_state=$(adb -s "$device_serial" get-state 2>/dev/null || true)
[ "$device_state" = 'device' ] ||
  fail "Android device $device_serial is not ready." 'Start the existing gym-tracker-api36 AVD and wait for adb shell getprop sys.boot_completed to return 1.'
boot_completed=$(adb -s "$device_serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
[ "$boot_completed" = '1' ] ||
  fail "Android device $device_serial has not completed boot." 'Wait until adb shell getprop sys.boot_completed returns 1.'

printf 'doctor-android: ok node=%s npm=%s java=%s sdk=%s maestro=%s%s\n' \
  "$expected_node" "$expected_npm" "$expected_java" "$ANDROID_HOME" "$expected_maestro" \
  "${device_serial:+ device=$device_serial}"
