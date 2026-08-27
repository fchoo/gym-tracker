#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
temporary_directory=$(mktemp -d)
suite='bootstrap'
device_serial=${GYM_TRACKER_ANDROID_SERIAL:-}
package_name='com.fchoo.gymtracker.devtest'
base_head=''
source_tree_sha256=''
artifact_directory=''
build_manifest=''
result_file=''
current_step='arguments'
completed=0
emulator_pid=''
native_build_lock="$project_root/.native-build.lock"
native_build_lock_acquired=0

fail() {
  printf 'build-bootstrap-native-test-apk: %s\n' "$1" >&2
  exit 1
}

write_failure_result() {
  exit_code=$1
  [ -n "$result_file" ] || return 0
  [ "$completed" -eq 0 ] || return 0

  mkdir -p "$artifact_directory"
  RESULT_FILE="$result_file" \
    BASE_HEAD="$base_head" \
    SOURCE_TREE_SHA256="$source_tree_sha256" \
    PACKAGE_NAME="$package_name" \
    DEVICE_SERIAL="$device_serial" \
    FAILURE_STEP="$current_step" \
    EXIT_CODE="$exit_code" \
    node <<'NODE'
import { renameSync, writeFileSync } from 'node:fs';

const result = {
  schema_version: 1,
  suite: process.env.RESULT_FILE.split('/').at(-2),
  status: 'failed',
  base_head: process.env.BASE_HEAD || null,
  source_tree_sha256: process.env.SOURCE_TREE_SHA256 || null,
  package: process.env.PACKAGE_NAME,
  device: {
    serial: process.env.DEVICE_SERIAL || null,
  },
  failure: {
    step: process.env.FAILURE_STEP,
    exit_code: Number(process.env.EXIT_CODE),
  },
  finished_at: new Date().toISOString(),
};

const temporaryPath = `${process.env.RESULT_FILE}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(result, null, 2)}\n`);
renameSync(temporaryPath, process.env.RESULT_FILE);
NODE
}

on_exit() {
  exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ]; then
    write_failure_result "$exit_code" || true
  fi
  if [ -n "$emulator_pid" ] && kill -0 "$emulator_pid" 2>/dev/null; then
    kill "$emulator_pid" 2>/dev/null || true
  fi
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
artifact_directory="artifacts/native/$suite"
build_manifest="$artifact_directory/build.json"
result_file="$artifact_directory/result.json"
apk_path="$artifact_directory/gym-tracker-$suite-devtest.apk"
alignment_log="$artifact_directory/zipalign.txt"

current_step='workspace-lock'
if ! mkdir "$native_build_lock" 2>/dev/null; then
  fail 'another generated-native operation is already running in this workspace.'
fi
native_build_lock_acquired=1

current_step='environment'
if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ]; then
  JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
fi
ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}
ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$ANDROID_HOME}
PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
export JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT PATH

git check-ignore -q --no-index "$artifact_directory/probe" ||
  fail "$artifact_directory must be ignored so evidence does not dirty source control."
[ -z "$(git ls-files android ios)" ] ||
  fail 'generated android/ or ios/ files must not be tracked.'

if [ -z "$device_serial" ]; then
  device_serial=$(
    adb devices |
      awk 'NR > 1 && $2 == "device" { print $1 }'
  )
  device_count=$(printf '%s\n' "$device_serial" | awk 'NF { count++ } END { print count + 0 }')
  [ "$device_count" -le 1 ] ||
    fail "at most one ready adb device is supported when --serial is omitted; found $device_count."
fi

if [ -z "$device_serial" ]; then
  current_step='start-emulator'
  emulator -avd gym-tracker-api36 \
    -no-audio \
    -no-boot-anim \
    -no-snapshot-save \
    -gpu swiftshader_indirect \
    >"$temporary_directory/emulator.log" 2>&1 &
  emulator_pid=$!

  attempts=0
  while [ "$attempts" -lt 60 ]; do
    device_serial=$(
      adb devices |
        awk 'NR > 1 && $1 ~ /^emulator-/ && $2 == "device" { print $1; exit }'
    )
    [ -n "$device_serial" ] && break
    attempts=$((attempts + 1))
    sleep 2
  done
  [ -n "$device_serial" ] ||
    fail 'gym-tracker-api36 did not register with adb within 120 seconds.'
fi

current_step='wait-for-device'
attempts=0
while [ "$attempts" -lt 180 ]; do
  boot_completed=$(
    adb -s "$device_serial" shell getprop sys.boot_completed 2>/dev/null |
      tr -d '\r' || true
  )
  [ "$boot_completed" = '1' ] && break
  attempts=$((attempts + 1))
  sleep 2
done
[ "${boot_completed:-}" = '1' ] ||
  fail "$device_serial did not complete boot within 360 seconds."
export GYM_TRACKER_ANDROID_SERIAL="$device_serial"

current_step='doctor'
sh scripts/doctor-android.sh

current_step='source-identity'
base_head=$(git rev-parse HEAD)
source_file_list="$temporary_directory/source-files"
git ls-files -z --cached --others --exclude-standard >"$source_file_list"
source_tree_sha256=$(
  SOURCE_FILE_LIST="$source_file_list" node <<'NODE'
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';

const excluded = /^(?:android|ios|node_modules|artifacts|\.expo|\.gradle|\.kotlin|\.cache|coverage|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;
const paths = readFileSync(process.env.SOURCE_FILE_LIST)
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .filter((filePath) => !excluded.test(filePath))
  .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));

const hash = createHash('sha256');
for (const filePath of paths) {
  const details = lstatSync(filePath);
  const type = details.isSymbolicLink() ? 'symlink' : details.isFile() ? 'file' : 'other';
  const contents = details.isSymbolicLink()
    ? Buffer.from(readlinkSync(filePath))
    : details.isFile()
      ? readFileSync(filePath)
      : Buffer.alloc(0);
  const pathBytes = Buffer.from(filePath);
  const header = Buffer.from(
    `${pathBytes.length}\0${type}\0${(details.mode & 0o777).toString(8)}\0${contents.length}\0`,
  );
  hash.update(header);
  hash.update(pathBytes);
  hash.update(Buffer.from('\0'));
  hash.update(contents);
  hash.update(Buffer.from('\0'));
}

process.stdout.write(hash.digest('hex'));
NODE
)
[ "${#source_tree_sha256}" -eq 64 ] ||
  fail 'could not compute the current nonignored source-tree digest.'

rm -rf "$artifact_directory"
mkdir -p "$artifact_directory"
build_started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

current_step='clean-prebuild'
rm -rf android ios
GYM_TRACKER_BUILD_PROFILE=development-test CI=1 \
  npx expo prebuild --clean --platform android --no-install

current_step='generated-contract'
node scripts/assert-generated-android.mjs android

current_step='gradle-build'
EXPO_PUBLIC_NATIVE_CONTRACT_SUITE="$suite" \
  ./android/gradlew --project-dir android --no-daemon --stacktrace :app:assembleRelease
generated_apk='android/app/build/outputs/apk/release/app-release.apk'
[ -f "$generated_apk" ] ||
  fail "Gradle did not produce the expected APK: $generated_apk"
unzip -Z1 "$generated_apk" | grep -qx 'assets/index.android.bundle' ||
  fail 'release development-test APK does not contain an embedded JS bundle.'

current_step='page-alignment'
zipalign_path="$ANDROID_HOME/build-tools/36.0.0/zipalign"
[ -x "$zipalign_path" ] ||
  fail "pinned zipalign is missing: $zipalign_path"
"$zipalign_path" -c -P 16 -v 4 "$generated_apk" >"$alignment_log"

current_step='retain-apk'
cp "$generated_apk" "$apk_path.tmp"
mv "$apk_path.tmp" "$apk_path"
apk_sha256=$(sh scripts/hash-apk.sh "$apk_path")
generated_apk_sha256=$(sh scripts/hash-apk.sh "$generated_apk")
[ "$generated_apk_sha256" = "$apk_sha256" ] ||
  fail 'retained APK bytes differ from the Gradle output.'
apk_size_bytes=$(wc -c <"$apk_path" | tr -d ' ')

current_step='install'
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
rm -f "$installed_apk_copy"
[ "$installed_apk_sha256" = "$apk_sha256" ] ||
  fail 'installed APK bytes do not match the retained APK.'

current_step='launch'
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

current_step='metadata'
BUILD_MANIFEST="$build_manifest" \
  RESULT_FILE="$result_file" \
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
  node <<'NODE'
import { renameSync, writeFileSync } from 'node:fs';

function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, filePath);
}

const identity = {
  base_head: process.env.BASE_HEAD,
  source_tree_sha256: process.env.SOURCE_TREE_SHA256,
};
const apk = {
  path: process.env.APK_PATH,
  sha256: process.env.APK_SHA256,
  size_bytes: Number(process.env.APK_SIZE_BYTES),
  page_alignment_kib: 16,
  page_alignment_verified: true,
};
const device = {
  serial: process.env.DEVICE_SERIAL,
  api: Number(process.env.DEVICE_API),
  abi: process.env.DEVICE_ABI,
  model: process.env.DEVICE_MODEL,
  android_release: process.env.ANDROID_RELEASE,
};

writeJson(process.env.BUILD_MANIFEST, {
  schema_version: 1,
  suite: process.env.SUITE,
  profile: 'development-test',
  build_variant: 'release',
  js_bundle: {
    embedded: true,
  },
  ...identity,
  package: process.env.PACKAGE_NAME,
  apk,
  device,
  toolchain: {
    node: '24.19.0',
    npm: '11.17.0',
    java: '17.0.20+8',
    android_api: 36,
    build_tools: '36.0.0',
    ndk: '27.1.12297006',
  },
  started_at: process.env.BUILD_STARTED_AT,
  finished_at: process.env.BUILD_FINISHED_AT,
});

writeJson(process.env.RESULT_FILE, {
  schema_version: 1,
  suite: process.env.SUITE,
  status: 'passed',
  build_manifest: process.env.BUILD_MANIFEST,
  ...identity,
  package: process.env.PACKAGE_NAME,
  apk,
  installed_apk: {
    device_path: process.env.INSTALLED_APK_PATH,
    sha256: process.env.INSTALLED_APK_SHA256,
    matches_retained_apk: process.env.INSTALLED_APK_SHA256 === process.env.APK_SHA256,
  },
  device,
  launch: {
    component: process.env.LAUNCH_COMPONENT,
    succeeded: true,
  },
  finished_at: process.env.BUILD_FINISHED_AT,
});
NODE

completed=1
printf 'build-bootstrap-native-test-apk: apk=%s\n' "$apk_path"
printf 'build-bootstrap-native-test-apk: sha256=%s\n' "$apk_sha256"
printf 'build-bootstrap-native-test-apk: result=%s\n' "$result_file"
