#!/bin/sh

set -eu

expected_node='v24.19.0'
expected_npm='11.17.0'
actual_npm='12.0.2'
expected_java='17.0.20'
expected_maestro='2.8.0'
default_android_home='/opt/homebrew/share/android-commandlinetools'
phase20_mode=0

case "$#" in
  0) ;;
  1) [ "$1" = '--phase20' ] && phase20_mode=1 || {
    printf 'doctor-android: error=arguments_invalid\n' >&2
    exit 1
  } ;;
  *)
    printf 'doctor-android: error=arguments_invalid\n' >&2
    exit 1
    ;;
esac

fail() {
  code=$1
  message=$2
  remediation=$3
  if [ "$phase20_mode" -eq 1 ]; then
    printf 'doctor-android: error=%s\n' "$code" >&2
  else
    printf 'doctor-android: %s\n' "$message" >&2
    printf 'remediation: %s\n' "$remediation" >&2
  fi
  exit 1
}

case "$(uname -m)" in
  arm64 | aarch64) system_image_abi='arm64-v8a' ;;
  x86_64 | amd64) system_image_abi='x86_64' ;;
  *)
    fail 'host_architecture_unsupported' 'Host architecture is unsupported.' 'Use an arm64/aarch64 or x86_64/amd64 host.'
    ;;
esac

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
  fail 'node_missing' 'Node.js is missing.' 'Run: source /opt/homebrew/opt/nvm/libexec/nvm.sh && nvm install 24.19.0 && nvm use 24.19.0'
[ "$(node --version)" = "$expected_node" ] ||
  fail 'node_version_invalid' "Node.js must be $expected_node; found $(node --version)." 'Run: source /opt/homebrew/opt/nvm/libexec/nvm.sh && nvm use 24.19.0'

command -v npm >/dev/null 2>&1 ||
  fail 'npm_missing' 'npm is missing.' 'Run: npm install --global npm@11.17.0'
npm_version=$(npm --version)
if [ "$npm_version" != "$expected_npm" ]; then
  if [ "$phase20_mode" -eq 1 ] || [ "${GYM_TRACKER_ALLOW_DEVTEST_NPM_12:-}" != 'true' ]; then
    fail 'npm_version_invalid' "npm must be $expected_npm; found $npm_version." 'Run: npm install --global npm@11.17.0'
  fi
  if [ "$npm_version" != "$actual_npm" ]; then
    fail 'npm_version_invalid' "npm must be $expected_npm; found $npm_version." 'Run: npm install --global npm@11.17.0'
  fi
fi

[ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ] ||
  fail 'java_missing' 'Temurin Java 17 is missing.' 'Install Temurin 17.0.20+8, then export JAVA_HOME=$(/usr/libexec/java_home -v 17).'
java_report=$("$JAVA_HOME/bin/java" -version 2>&1)
java_version=$(printf '%s\n' "$java_report" | awk -F'"' '/version/ { print $2; exit }')
[ "$java_version" = "$expected_java" ] && printf '%s\n' "$java_report" | grep -F 'Temurin-17.0.20+8' >/dev/null ||
  fail 'java_version_invalid' "Java must be Temurin $expected_java; found ${java_version:-unknown}." 'Install Temurin 17.0.20+8 and export JAVA_HOME=$(/usr/libexec/java_home -v 17).'

[ -d "$ANDROID_HOME" ] ||
  fail 'android_sdk_missing' "Android SDK root is missing at $ANDROID_HOME." "Export ANDROID_HOME=$default_android_home."
[ "$ANDROID_SDK_ROOT" = "$ANDROID_HOME" ] ||
  fail 'android_sdk_roots_mismatch' 'ANDROID_HOME and ANDROID_SDK_ROOT must match.' "Export both variables to $ANDROID_HOME."

for executable in sdkmanager adb emulator; do
  command -v "$executable" >/dev/null 2>&1 ||
    fail 'android_tool_missing' "$executable is missing from the Android SDK." "Install it with sdkmanager under $ANDROID_HOME and keep the SDK paths on PATH."
done

for path in \
  'platform-tools/adb' \
  'platforms/android-36/android.jar' \
  'build-tools/36.0.0/apksigner' \
  'build-tools/36.0.0/zipalign' \
  'ndk/27.1.12297006/source.properties' \
  'cmake/3.22.1/bin/cmake' \
  'emulator/emulator' \
  "system-images/android-36/google_apis/$system_image_abi/package.xml"; do
  [ -e "$ANDROID_HOME/$path" ] ||
    fail 'android_component_missing' "Android SDK component is missing: $path." 'Run the pinned sdkmanager command from 01-01-PLAN.md; do not create a second SDK root.'
done

avdmanager list avd 2>/dev/null | grep -q 'Name: gym-tracker-api36' ||
  fail 'avd_missing' 'AVD gym-tracker-api36 is missing.' "Run: echo no | avdmanager create avd --name gym-tracker-api36 --package \"system-images;android-36;google_apis;$system_image_abi\" --device \"pixel_7\""

command -v maestro >/dev/null 2>&1 ||
  fail 'maestro_missing' 'Maestro is missing.' 'Run: sh scripts/install-maestro.sh'
maestro_version=$(maestro --version 2>/dev/null | tail -n 1)
[ "$maestro_version" = "$expected_maestro" ] ||
  fail 'maestro_version_invalid' "Maestro must be $expected_maestro; found ${maestro_version:-unknown}." 'Run: sh scripts/install-maestro.sh'

adb_version=$(adb version 2>/dev/null | awk '/Android Debug Bridge version/ { print $5; exit }')
[ -n "$adb_version" ] ||
  fail 'adb_version_invalid' 'ADB version could not be read.' 'Reinstall the pinned Android platform tools.'

device_serial=${GYM_TRACKER_ANDROID_SERIAL:-}
if [ -z "$device_serial" ]; then
  device_serial=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
fi
[ -n "$device_serial" ] ||
  fail 'device_missing' 'No Android device is connected.' 'Start the existing gym-tracker-api36 AVD, then wait for adb shell getprop sys.boot_completed to return 1.'
device_state=$(adb -s "$device_serial" get-state 2>/dev/null || true)
[ "$device_state" = 'device' ] ||
  fail 'device_not_ready' "Android device $device_serial is not ready." 'Start the existing gym-tracker-api36 AVD and wait for adb shell getprop sys.boot_completed to return 1.'
boot_completed=$(adb -s "$device_serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
[ "$boot_completed" = '1' ] ||
  fail 'device_boot_incomplete' "Android device $device_serial has not completed boot." 'Wait until adb shell getprop sys.boot_completed returns 1.'

device_api=$(adb -s "$device_serial" shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r' || true)
device_abi=$(adb -s "$device_serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r' || true)
device_model=$(adb -s "$device_serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)
case "$device_api:$device_abi:$device_model" in
  *[!A-Za-z0-9._:+\ -]* | :: | :*) fail 'device_identity_invalid' 'Android device identity is invalid.' 'Reconnect the selected device and retry.' ;;
esac
device_identity_sha256=$(
  printf '%s\n' "$device_serial" "$device_abi" "$device_api" "$device_model" |
    node scripts/phase18-device-identity.mjs 2>/dev/null || true
)
[ "${#device_identity_sha256}" -eq 64 ] ||
  fail 'device_identity_invalid' 'Android device identity could not be hashed.' 'Reconnect the selected device and retry.'

if [ "$phase20_mode" -eq 1 ]; then
  printf 'doctor-android: ok node=%s npm=%s java=%s android_api=36 build_tools=36.0.0 ndk=27.1.12297006 adb=%s maestro=%s device_identity_sha256=%s\n' \
    "$expected_node" "$npm_version" '17.0.20+8' "$adb_version" "$expected_maestro" "$device_identity_sha256"
else
  printf 'doctor-android: ok node=%s npm=%s java=%s sdk=%s maestro=%s%s\n' \
    "$expected_node" "$npm_version" "$expected_java" "$ANDROID_HOME" "$expected_maestro" \
    "${device_serial:+ device=$device_serial}"
fi
