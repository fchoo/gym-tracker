#!/bin/sh

set -eu

fail() {
  printf 'install-pinned-android-sdk: %s\n' "$1" >&2
  exit 1
}

[ -n "${ANDROID_HOME:-}" ] || fail 'ANDROID_HOME is required.'
[ -n "${ANDROID_SDK_ROOT:-}" ] || fail 'ANDROID_SDK_ROOT is required.'
[ "$ANDROID_HOME" = "$ANDROID_SDK_ROOT" ] ||
  fail 'ANDROID_HOME and ANDROID_SDK_ROOT must match.'
[ -n "${ANDROID_API_LEVEL:-}" ] || fail 'ANDROID_API_LEVEL is required.'
[ -n "${ANDROID_BUILD_TOOLS:-}" ] || fail 'ANDROID_BUILD_TOOLS is required.'
[ -n "${ANDROID_NDK:-}" ] || fail 'ANDROID_NDK is required.'

android_cmake='3.22.1'
sdkmanager="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
[ -x "$sdkmanager" ] || fail "sdkmanager is missing at $sdkmanager."

yes | "$sdkmanager" --sdk_root="$ANDROID_SDK_ROOT" --licenses >/dev/null || true
"$sdkmanager" --sdk_root="$ANDROID_SDK_ROOT" \
  'platform-tools' \
  "platforms;android-$ANDROID_API_LEVEL" \
  "build-tools;$ANDROID_BUILD_TOOLS" \
  "ndk;$ANDROID_NDK" \
  "cmake;$android_cmake"

for path in \
  'platform-tools/adb' \
  "platforms/android-$ANDROID_API_LEVEL/android.jar" \
  "build-tools/$ANDROID_BUILD_TOOLS/zipalign" \
  "ndk/$ANDROID_NDK/source.properties" \
  "cmake/$android_cmake/bin/cmake"; do
  [ -e "$ANDROID_SDK_ROOT/$path" ] ||
    fail "Android SDK component is missing after install: $path."
done

printf 'install-pinned-android-sdk: ok api=%s build-tools=%s ndk=%s cmake=%s\n' \
  "$ANDROID_API_LEVEL" "$ANDROID_BUILD_TOOLS" "$ANDROID_NDK" "$android_cmake"
