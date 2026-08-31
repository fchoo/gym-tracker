#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
temporary_directory=$(mktemp -d)
suite='sqlite-kernel'
device_serial=${GYM_TRACKER_ANDROID_SERIAL:-}
package_name='com.fchoo.gymtracker.devtest'
native_build_lock="$project_root/.native-build.lock"
native_build_lock_acquired=0

fail() {
  printf 'build-current-native-test-apk: %s\n' "$1" >&2
  exit 1
}

on_exit() {
  exit_code=$?
  trap - EXIT
  if [ "$native_build_lock_acquired" -eq 1 ]; then
    rm -rf "$project_root/android" "$project_root/ios"
    rmdir "$native_build_lock" 2>/dev/null || true
  fi
  rm -rf "$temporary_directory"
  exit "$exit_code"
}
trap on_exit EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --suite)
      [ "$#" -ge 2 ] || fail '--suite requires a value.'
      suite=$2
      shift 2
      ;;
    --suite=*)
      suite=${1#--suite=}
      shift
      ;;
    --serial)
      [ "$#" -ge 2 ] || fail '--serial requires a value.'
      device_serial=$2
      shift 2
      ;;
    --serial=*)
      device_serial=${1#--serial=}
      shift
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

case "$suite" in
  '' | *[!A-Za-z0-9._-]*)
    fail 'suite must contain only letters, numbers, dot, underscore, or hyphen.'
    ;;
esac

cd "$project_root"
[ "$(git rev-parse --show-toplevel)" = "$project_root" ] ||
  fail 'script must run from its own Git worktree root.'

artifact_directory="artifacts/native/$suite"
build_manifest="$artifact_directory/build.json"
apk_path="$artifact_directory/gym-tracker-$suite-devtest.apk"
alignment_log="$artifact_directory/zipalign.txt"

if ! mkdir "$native_build_lock" 2>/dev/null; then
  fail "another generated-native operation holds $native_build_lock."
fi
native_build_lock_acquired=1

[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  fail 'tracked worktree must be clean before the exact-HEAD native build.'

if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ]; then
  JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
fi
ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}
ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$ANDROID_HOME}
PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
for maestro_directory in "$HOME/.maestro/bin" "$HOME/.local/bin"; do
  [ -d "$maestro_directory" ] && PATH="$maestro_directory:$PATH"
done
export JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT PATH

git check-ignore -q --no-index "$artifact_directory/probe" ||
  fail "$artifact_directory must be ignored."
[ -z "$(git ls-files android ios)" ] ||
  fail 'generated android/ or ios/ files must not be tracked.'

if [ -z "$device_serial" ]; then
  device_serial=$(
    adb devices |
      awk 'NR > 1 && $2 == "device" { print $1 }'
  )
  device_count=$(printf '%s\n' "$device_serial" | awk 'NF { count++ } END { print count + 0 }')
  [ "$device_count" -le 1 ] ||
    fail "at most one ready adb device is supported; found $device_count."
fi
[ -n "$device_serial" ] || fail 'no ready adb device is available.'
export GYM_TRACKER_ANDROID_SERIAL="$device_serial"

attempts=0
boot_completed=''
while [ "$attempts" -lt 180 ]; do
  boot_completed=$(
    adb -s "$device_serial" shell getprop sys.boot_completed 2>/dev/null |
      tr -d '\r' || true
  )
  [ "$boot_completed" = '1' ] && break
  attempts=$((attempts + 1))
  sleep 2
done
[ "$boot_completed" = '1' ] ||
  fail "$device_serial did not complete boot within 360 seconds."

if [ "$suite" = 'phase6-gesture-smoke' ]; then
  # This disposable Phase 6 development-test smoke alone accepts Node 24.19.0's bundled npm.
  GYM_TRACKER_ALLOW_DEVTEST_NPM_12=true sh scripts/doctor-android.sh
else
  sh scripts/doctor-android.sh
fi

base_head=$(git rev-parse HEAD)
source_tree_sha256=$(node scripts/source-tree-digest.mjs --assert-no-untracked)
[ "${#base_head}" -eq 40 ] || fail 'base_head is not a full Git SHA.'
[ "${#source_tree_sha256}" -eq 64 ] ||
  fail 'could not compute the current source-tree digest.'

rm -rf "$artifact_directory"
mkdir -p "$artifact_directory"
build_started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

rm -rf "$project_root/android" "$project_root/ios"
GYM_TRACKER_BUILD_PROFILE=development-test CI=1 \
  npx expo prebuild --clean --platform android --no-install
node scripts/assert-generated-android.mjs "$project_root/android"

GYM_TRACKER_BUILD_PROFILE=development-test \
EXPO_PUBLIC_NATIVE_CONTRACT_SUITE="$suite" \
"$project_root/android/gradlew" \
  --project-dir "$project_root/android" \
  --no-daemon \
  --stacktrace \
  '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8' \
  :app:assembleRelease
generated_apk="$project_root/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$generated_apk" ] ||
  fail "Gradle did not produce $generated_apk."
# Validates assets/index.android.bundle, assets/app.config, and dev-test identity.
if ! "$project_root/scripts/validate-development-test-app-config.mjs" "$generated_apk"; then
  fail 'embedded development-test config is invalid.'
fi

zipalign_path="$ANDROID_HOME/build-tools/36.0.0/zipalign"
[ -x "$zipalign_path" ] ||
  fail "pinned zipalign is missing: $zipalign_path"
"$zipalign_path" -c -P 16 -v 4 "$generated_apk" >"$alignment_log"

cp "$generated_apk" "$apk_path.tmp"
mv "$apk_path.tmp" "$apk_path"
apk_sha256=$(sh scripts/hash-apk.sh "$apk_path")
generated_apk_sha256=$(sh scripts/hash-apk.sh "$generated_apk")
[ "$generated_apk_sha256" = "$apk_sha256" ] ||
  fail 'retained APK bytes differ from the Gradle output.'
apk_size_bytes=$(wc -c <"$apk_path" | tr -d ' ')

adb -s "$device_serial" install -r "$apk_path"
installed_apk_path=$(
  adb -s "$device_serial" shell pm path "$package_name" |
    tr -d '\r' |
    awk -F: '/^package:/ { print $2; exit }'
)
[ -n "$installed_apk_path" ] ||
  fail "installed package was not found: $package_name"
installed_apk_copy="$temporary_directory/installed.apk"
adb -s "$device_serial" pull "$installed_apk_path" "$installed_apk_copy" >/dev/null
installed_apk_sha256=$(sh scripts/hash-apk.sh "$installed_apk_copy")
[ "$installed_apk_sha256" = "$apk_sha256" ] ||
  fail 'installed APK bytes do not match the retained APK.'

launch_component=$(
  adb -s "$device_serial" shell cmd package resolve-activity --brief "$package_name" |
    tr -d '\r' |
    tail -n 1
)
case "$launch_component" in
  "$package_name"/*) ;;
  *) fail "could not resolve the launcher activity for $package_name." ;;
esac
adb -s "$device_serial" shell am force-stop "$package_name"
adb -s "$device_serial" shell am start -W -n "$launch_component" >/dev/null

device_api=$(adb -s "$device_serial" shell getprop ro.build.version.sdk | tr -d '\r')
device_abi=$(adb -s "$device_serial" shell getprop ro.product.cpu.abi | tr -d '\r')
device_model=$(adb -s "$device_serial" shell getprop ro.product.model | tr -d '\r')
android_release=$(adb -s "$device_serial" shell getprop ro.build.version.release | tr -d '\r')
build_finished_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

BUILD_MANIFEST="$build_manifest" \
  SUITE="$suite" \
  BASE_HEAD="$base_head" \
  SOURCE_TREE_SHA256="$source_tree_sha256" \
  APK_PATH="$apk_path" \
  APK_SHA256="$apk_sha256" \
  APK_SIZE_BYTES="$apk_size_bytes" \
  PACKAGE_NAME="$package_name" \
  DEVICE_SERIAL="$device_serial" \
  DEVICE_API="$device_api" \
  DEVICE_ABI="$device_abi" \
  DEVICE_MODEL="$device_model" \
  ANDROID_RELEASE="$android_release" \
  INSTALLED_APK_PATH="$installed_apk_path" \
  INSTALLED_APK_SHA256="$installed_apk_sha256" \
  LAUNCH_COMPONENT="$launch_component" \
  BUILD_STARTED_AT="$build_started_at" \
  BUILD_FINISHED_AT="$build_finished_at" \
  NPM_VERSION="$(npm --version)" \
  node <<'NODE'
import { renameSync, writeFileSync } from 'node:fs';

const manifest = {
  schema_version: 1,
  suite: process.env.SUITE,
  profile: 'development-test',
  build_variant: 'release',
  js_bundle: {
    embedded: true,
  },
  base_head: process.env.BASE_HEAD,
  source_tree_sha256: process.env.SOURCE_TREE_SHA256,
  package: process.env.PACKAGE_NAME,
  apk: {
    path: process.env.APK_PATH,
    sha256: process.env.APK_SHA256,
    size_bytes: Number(process.env.APK_SIZE_BYTES),
    page_alignment_kib: 16,
    page_alignment_verified: true,
  },
  installed_apk: {
    device_path: process.env.INSTALLED_APK_PATH,
    sha256: process.env.INSTALLED_APK_SHA256,
    matches_retained_apk:
      process.env.INSTALLED_APK_SHA256 === process.env.APK_SHA256,
  },
  package_launch: {
    component: process.env.LAUNCH_COMPONENT,
    succeeded: true,
  },
  device: {
    serial: process.env.DEVICE_SERIAL,
    api: Number(process.env.DEVICE_API),
    abi: process.env.DEVICE_ABI,
    model: process.env.DEVICE_MODEL,
    android_release: process.env.ANDROID_RELEASE,
  },
  toolchain: {
    node: '24.19.0',
    npm: process.env.NPM_VERSION,
    java: '17.0.20+8',
    android_api: 36,
    build_tools: '36.0.0',
    ndk: '27.1.12297006',
  },
  started_at: process.env.BUILD_STARTED_AT,
  finished_at: process.env.BUILD_FINISHED_AT,
};

const temporaryPath = `${process.env.BUILD_MANIFEST}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
renameSync(temporaryPath, process.env.BUILD_MANIFEST);
NODE

printf 'build-current-native-test-apk: manifest=%s\n' "$build_manifest"
printf 'build-current-native-test-apk: apk=%s\n' "$apk_path"
printf 'build-current-native-test-apk: sha256=%s\n' "$apk_sha256"
printf 'build-current-native-test-apk: device=%s api=%s abi=%s\n' \
  "$device_serial" "$device_api" "$device_abi"
