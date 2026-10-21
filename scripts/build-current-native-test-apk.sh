#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
temporary_directory=$(mktemp -d)
suite='sqlite-kernel'
single_build=0
device_serial=${GYM_TRACKER_ANDROID_SERIAL:-}
package_name='com.fchoo.gymtracker.devtest'
native_build_lock="$project_root/.native-build.lock"
native_build_lock_acquired=0
native_build_lock_owner=''
single_build_claim_acquired=0
single_build_claim_completed=0
single_build_claim_directory=''
single_build_claim_nonce=''
single_build_claim_birth=''
single_build_claim_scope_sha256=''

fail() {
  printf 'build-current-native-test-apk: %s\n' "$1" >&2
  exit 1
}

process_birth_sha256() {
  claim_pid=$1
  claim_birth=$(/bin/ps -o lstart= -p "$claim_pid" 2>/dev/null | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//' || true)
  [ -n "$claim_birth" ] || return 1
  printf '%s' "$claim_birth" | shasum -a 256 | awk '{ print $1 }'
}

acquire_native_build_lock() {
  lock_nonce=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  lock_birth=$(process_birth_sha256 "$$") || fail 'could not bind the native build lock to this process birth.'
  native_build_lock_owner=$(printf '{"schema_version":1,"pid":%s,"process_birth_sha256":"%s","nonce":"%s"}\n' "$$" "$lock_birth" "$lock_nonce")
  lock_attempt=0
  while [ "$lock_attempt" -lt 8 ]; do
    if mkdir "$native_build_lock" 2>/dev/null; then
      printf '%s' "$native_build_lock_owner" >"$native_build_lock/owner.json"
      native_build_lock_acquired=1
      return 0
    fi
    [ ! -L "$native_build_lock" ] && [ -f "$native_build_lock/owner.json" ] && [ ! -L "$native_build_lock/owner.json" ] ||
      fail "another generated-native operation holds an invalid $native_build_lock."
    lock_fields=$(LOCK_OWNER="$native_build_lock/owner.json" "$node_executable" <<'NODE'
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(process.env.LOCK_OWNER, "utf8"));
const keys = ["schema_version", "pid", "process_birth_sha256", "nonce"];
if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
  || value.schema_version !== 1 || !Number.isSafeInteger(value.pid) || value.pid < 1
  || !/^[a-f0-9]{64}$/u.test(value.process_birth_sha256) || !/^[a-f0-9]{32}$/u.test(value.nonce)) {
  throw new Error("native_build_lock_invalid");
}
process.stdout.write(`${value.pid} ${value.process_birth_sha256} ${value.nonce}\n`);
NODE
) || fail "another generated-native operation holds an invalid $native_build_lock."
    set -- $lock_fields
    existing_pid=$1; existing_birth=$2; existing_nonce=$3
    observed_birth=$(process_birth_sha256 "$existing_pid" || true)
    if kill -0 "$existing_pid" 2>/dev/null && { [ -z "$observed_birth" ] || [ "$observed_birth" = "$existing_birth" ]; }; then
      fail "another generated-native operation holds $native_build_lock."
    fi
    stale_lock_root="$project_root/artifacts/native/.stale-native-build-locks"
    [ ! -L "$project_root/artifacts" ] && [ ! -L "$project_root/artifacts/native" ] || fail 'native artifacts root must not be a symlink.'
    mkdir -p "$stale_lock_root"
    [ ! -L "$stale_lock_root" ] || fail 'native stale-lock root must not be a symlink.'
    stale_lock="$stale_lock_root/$existing_nonce-$lock_attempt.lock"
    [ ! -e "$stale_lock" ] || fail 'native build stale-lock destination already exists.'
    if mv "$native_build_lock" "$stale_lock" 2>/dev/null; then
      lock_attempt=$((lock_attempt + 1))
      continue
    fi
    lock_attempt=$((lock_attempt + 1))
  done
  fail 'native build lock could not be acquired.'
}

write_single_build_claim() {
  claim_state=$1
  claim_create=$2
  CLAIM_DIRECTORY="$single_build_claim_directory" \
    CLAIM_NONCE="$single_build_claim_nonce" \
    CLAIM_PROCESS_BIRTH="$single_build_claim_birth" \
    CLAIM_RUN_SCOPE_SHA256="$single_build_claim_scope_sha256" \
    CLAIM_SOURCE_HEAD="$base_head" \
    CLAIM_SOURCE_TREE_SHA256="$source_tree_sha256" \
    CLAIM_STATE="$claim_state" \
    CLAIM_SUITE="$suite" \
    CLAIM_CREATE="$claim_create" \
    "$node_executable" <<'NODE'
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const directory = process.env.CLAIM_DIRECTORY;
const ownerFile = path.join(directory, "owner.json");
const value = {
  schema_version: 1,
  suite: process.env.CLAIM_SUITE,
  source_head: process.env.CLAIM_SOURCE_HEAD,
  source_tree_sha256: process.env.CLAIM_SOURCE_TREE_SHA256,
  run_scope_sha256: process.env.CLAIM_RUN_SCOPE_SHA256,
  pid: process.ppid,
  process_birth_sha256: process.env.CLAIM_PROCESS_BIRTH,
  nonce: process.env.CLAIM_NONCE,
  state: process.env.CLAIM_STATE,
};
const bytes = `${JSON.stringify(value)}\n`;
if (process.env.CLAIM_CREATE === "1") {
  writeFileSync(ownerFile, bytes, { flag: "wx", mode: 0o600 });
  const descriptor = openSync(ownerFile, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
} else {
  const current = JSON.parse(readFileSync(ownerFile, "utf8"));
  if (current.nonce !== value.nonce || current.run_scope_sha256 !== value.run_scope_sha256 || current.state !== "active") {
    throw new Error("single_build_claim_owner_changed");
  }
  const temporary = path.join(directory, `.owner-${value.nonce}.tmp`);
  writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
  const descriptor = openSync(temporary, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, ownerFile);
}
const directoryDescriptor = openSync(directory, "r");
try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
NODE
}

read_single_build_claim() {
  CLAIM_DIRECTORY="$single_build_claim_directory" CLAIM_RUN_SCOPE_SHA256="$single_build_claim_scope_sha256" \
    CLAIM_SOURCE_HEAD="$base_head" CLAIM_SOURCE_TREE_SHA256="$source_tree_sha256" CLAIM_SUITE="$suite" \
    "$node_executable" <<'NODE'
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
const ownerFile = path.join(process.env.CLAIM_DIRECTORY, "owner.json");
const stat = lstatSync(ownerFile);
if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("single_build_claim_invalid");
const value = JSON.parse(readFileSync(ownerFile, "utf8"));
const keys = ["schema_version", "suite", "source_head", "source_tree_sha256", "run_scope_sha256", "pid", "process_birth_sha256", "nonce", "state"];
if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
  || value.schema_version !== 1 || value.suite !== process.env.CLAIM_SUITE
  || value.source_head !== process.env.CLAIM_SOURCE_HEAD || value.source_tree_sha256 !== process.env.CLAIM_SOURCE_TREE_SHA256
  || value.run_scope_sha256 !== process.env.CLAIM_RUN_SCOPE_SHA256 || !Number.isSafeInteger(value.pid) || value.pid < 1
  || !/^[a-f0-9]{64}$/u.test(value.process_birth_sha256) || !/^[a-f0-9]{32}$/u.test(value.nonce)
  || !["active", "completed", "failed"].includes(value.state)) throw new Error("single_build_claim_invalid");
process.stdout.write(`${value.pid} ${value.process_birth_sha256} ${value.nonce} ${value.state}\n`);
NODE
}

acquire_single_build_claim() {
  claims_root="$project_root/artifacts/native/.single-build-claims"
  [ ! -L "$project_root/artifacts" ] || fail 'artifacts root must not be a symlink.'
  [ ! -L "$project_root/artifacts/native" ] || fail 'native artifacts root must not be a symlink.'
  mkdir -p "$claims_root"
  [ ! -L "$project_root/artifacts/native" ] && [ ! -L "$claims_root" ] || fail 'native claim path must not be a symlink.'
  single_build_claim_scope_sha256=$(printf '%s\n%s\n%s\n' "$suite" "$base_head" "$source_tree_sha256" | shasum -a 256 | awk '{ print $1 }')
  single_build_claim_directory="$claims_root/$single_build_claim_scope_sha256.claim"
  single_build_claim_nonce=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  single_build_claim_birth=$(process_birth_sha256 "$$") || fail 'could not bind the single-build claim to this process birth.'
  claim_attempt=0
  while [ "$claim_attempt" -lt 8 ]; do
    if mkdir "$single_build_claim_directory" 2>/dev/null; then
      write_single_build_claim active 1
      single_build_claim_acquired=1
      return 0
    fi
    claim_fields=$(read_single_build_claim) || fail 'single-build claim is malformed.'
    set -- $claim_fields
    existing_pid=$1; existing_birth=$2; existing_nonce=$3; existing_state=$4
    [ "$existing_state" = active ] || fail "single-build claim was already consumed for this source/run scope ($existing_state)."
    observed_birth=$(process_birth_sha256 "$existing_pid" || true)
    if kill -0 "$existing_pid" 2>/dev/null && { [ -z "$observed_birth" ] || [ "$observed_birth" = "$existing_birth" ]; }; then
      fail 'single-build claim is held by a live process.'
    fi
    stale="$claims_root/$single_build_claim_scope_sha256.stale-$existing_nonce-$claim_attempt.claim"
    [ ! -e "$stale" ] || fail 'single-build stale claim destination already exists.'
    if mv "$single_build_claim_directory" "$stale" 2>/dev/null; then
      claim_attempt=$((claim_attempt + 1))
      continue
    fi
    claim_attempt=$((claim_attempt + 1))
  done
  fail 'single-build claim could not be acquired.'
}

on_exit() {
  exit_code=$?
  trap - EXIT
  if [ "$single_build_claim_acquired" -eq 1 ] && [ "$single_build_claim_completed" -eq 0 ]; then
    single_build_claim_acquired=0
    write_single_build_claim failed 0 >/dev/null 2>&1 || true
  fi
  if [ "$native_build_lock_acquired" -eq 1 ]; then
    rm -rf "$project_root/android" "$project_root/ios"
    if [ "$(cat "$native_build_lock/owner.json" 2>/dev/null || true)" = "$(printf '%s' "$native_build_lock_owner")" ]; then
      rm -f "$native_build_lock/owner.json"
      rmdir "$native_build_lock" 2>/dev/null || true
    fi
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
    --single-build)
      single_build=1
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
[ "$single_build" -eq 0 ] || [ "$suite" = 'v1.2-acceptance' ] ||
  fail '--single-build is reserved for v1.2-acceptance.'
case "$suite" in
  phase18-garmin-proof|phase18-garmin-acceptance|phase18-garmin-adversarial)
    fail 'Phase 18 suite-specific APKs are prohibited; use v1.2-acceptance.'
    ;;
esac

cd "$project_root"
node_executable=$(command -v node)
git_executable=$("$node_executable" scripts/v12-native-execution-origin.mjs --git-path)
git_attestation_source="$temporary_directory/git-execution-origin.json"
"$node_executable" scripts/v12-native-execution-origin.mjs --git-attestation >"$git_attestation_source"
V12_GIT_ATTESTATION_PATH="$git_attestation_source"
export V12_GIT_ATTESTATION_PATH
[ "$("$git_executable" rev-parse --show-toplevel)" = "$project_root" ] ||
  fail 'script must run from its own Git worktree root.'

if [ "$suite" = 'v1.2-acceptance' ]; then
  "$node_executable" scripts/validate-v12-prebuild-predecessors.mjs
fi

artifact_directory="artifacts/native/$suite"
build_manifest="$artifact_directory/build.json"
apk_path="$artifact_directory/gym-tracker-$suite-devtest.apk"
alignment_log="$artifact_directory/zipalign.txt"
[ ! -e "$artifact_directory" ] || fail "$artifact_directory already exists; existing artifact directories are never deleted or overwritten."

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

"$git_executable" check-ignore -q --no-index "$artifact_directory/probe" ||
  fail "$artifact_directory must be ignored."
[ -z "$("$git_executable" ls-files android ios)" ] ||
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

if [ "$suite" = 'v1.2-acceptance' ]; then
  sh scripts/doctor-android.sh --phase20
elif [ "$suite" = 'phase6-gesture-smoke' ]; then
  # This disposable Phase 6 development-test smoke alone accepts Node 24.19.0's bundled npm.
  GYM_TRACKER_ALLOW_DEVTEST_NPM_12=true sh scripts/doctor-android.sh
else
  sh scripts/doctor-android.sh
fi

base_head=$("$git_executable" rev-parse HEAD)
source_tree_sha256=$("$node_executable" scripts/source-tree-digest.mjs \
  --head "$base_head" --assert-clean)
[ "${#base_head}" -eq 40 ] || fail 'base_head is not a full Git SHA.'
[ "${#source_tree_sha256}" -eq 64 ] ||
  fail 'could not compute the current source-tree digest.'

if [ "$single_build" -eq 1 ]; then
  acquire_single_build_claim
fi
case "${V12_SINGLE_BUILD_CLAIM_TEST_ACTION:-}" in
  '') ;;
  kill)
    [ "$single_build" -eq 1 ] && [ "${NODE_TEST_CONTEXT:-}" = child-v8 ] || fail 'single-build claim test mode is forbidden.'
    kill -KILL "$$"
    ;;
  hold)
    [ "$single_build" -eq 1 ] && [ "${NODE_TEST_CONTEXT:-}" = child-v8 ] || fail 'single-build claim test mode is forbidden.'
    while :; do sleep 1; done
    ;;
  *) fail 'single-build claim test mode is invalid.' ;;
esac

acquire_native_build_lock

artifact_stage="$temporary_directory/artifact-$suite"
mkdir "$artifact_stage"
staged_build_manifest="$artifact_stage/build.json"
staged_apk_path="$artifact_stage/gym-tracker-$suite-devtest.apk"
staged_alignment_log="$artifact_stage/zipalign.txt"
git_attestation_path=''
staged_git_attestation_path=''
git_attestation_sha256=''
if [ "$suite" = 'v1.2-acceptance' ]; then
  git_attestation_path="$artifact_directory/git-execution-origin.json"
  staged_git_attestation_path="$artifact_stage/git-execution-origin.json"
  cp "$git_attestation_source" "$staged_git_attestation_path"
  git_attestation_sha256=$(sh scripts/hash-apk.sh "$staged_git_attestation_path")
fi
build_started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

rm -rf "$project_root/android" "$project_root/ios"
GYM_TRACKER_BUILD_PROFILE=development-test \
EXPO_PUBLIC_NATIVE_CONTRACT_SUITE="$suite" \
CI=1 \
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
if ! EXPO_PUBLIC_NATIVE_CONTRACT_SUITE="$suite" \
  "$project_root/scripts/validate-development-test-app-config.mjs" "$generated_apk"; then
  fail 'embedded development-test config is invalid.'
fi

zipalign_path="$ANDROID_HOME/build-tools/36.0.0/zipalign"
[ -x "$zipalign_path" ] ||
  fail "pinned zipalign is missing: $zipalign_path"
"$zipalign_path" -c -P 16 -v 4 "$generated_apk" >"$staged_alignment_log"

cp "$generated_apk" "$staged_apk_path.tmp"
mv "$staged_apk_path.tmp" "$staged_apk_path"
apk_sha256=$(sh scripts/hash-apk.sh "$staged_apk_path")
generated_apk_sha256=$(sh scripts/hash-apk.sh "$generated_apk")
[ "$generated_apk_sha256" = "$apk_sha256" ] ||
  fail 'retained APK bytes differ from the Gradle output.'
apk_size_bytes=$(wc -c <"$staged_apk_path" | tr -d ' ')

adb -s "$device_serial" install -r "$staged_apk_path"
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

certificate_sha256=''
signature_sha256=''
settings_sha256=''
restoration_sha256=''
if [ "$suite" = 'v1.2-acceptance' ]; then
  apksigner_path="$ANDROID_HOME/build-tools/36.0.0/apksigner"
  [ -x "$apksigner_path" ] || fail "pinned apksigner is missing: $apksigner_path"
  signature_report="$temporary_directory/apksigner-v12.txt"
  "$apksigner_path" verify --verbose --print-certs "$staged_apk_path" >"$signature_report"
  grep -F 'Verified using v2 scheme (APK Signature Scheme v2): true' "$signature_report" >/dev/null ||
    fail 'APK v2 signature verification failed.'
  certificate_sha256=$(awk -F': ' '/certificate SHA-256 digest:/ { print $2; exit }' "$signature_report" | tr -d ':' | tr 'A-F' 'a-f')
  [ "${#certificate_sha256}" -eq 64 ] || fail 'could not read the APK signer certificate SHA-256.'
  signature_sha256=$(sh scripts/hash-apk.sh "$signature_report")
  settings_sha256=$(V12_DEVICE_SERIAL="$device_serial" node scripts/v12-device-settings-contract.mjs --read-digest)
  [ "${#settings_sha256}" -eq 64 ] || fail 'could not hash bounded device settings.'
  restoration_sha256=$settings_sha256
fi

launch_component=''
attempts=0
while [ "$attempts" -lt 15 ]; do
  launch_component=$(
    adb -s "$device_serial" shell cmd package resolve-activity --brief "$package_name" |
      tr -d '\r' |
      tail -n 1
  )
  case "$launch_component" in
    "$package_name"/*) break ;;
  esac
  attempts=$((attempts + 1))
  sleep 1
done
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
device_identity_sha256=$(
  printf '%s\n' "$device_serial" "$device_abi" "$device_api" "$device_model" |
    node scripts/phase18-device-identity.mjs
)
build_finished_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

BUILD_MANIFEST="$staged_build_manifest" \
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
  DEVICE_IDENTITY_SHA256="$device_identity_sha256" \
  INSTALLED_APK_PATH="$installed_apk_path" \
  INSTALLED_APK_SHA256="$installed_apk_sha256" \
  CERTIFICATE_SHA256="$certificate_sha256" \
  SIGNATURE_SHA256="$signature_sha256" \
  SETTINGS_SHA256="$settings_sha256" \
  RESTORATION_SHA256="$restoration_sha256" \
  GIT_ATTESTATION_PATH="$git_attestation_path" \
  GIT_ATTESTATION_SHA256="$git_attestation_sha256" \
  LAUNCH_COMPONENT="$launch_component" \
  BUILD_STARTED_AT="$build_started_at" \
  BUILD_FINISHED_AT="$build_finished_at" \
  NPM_VERSION="$(npm --version)" \
  node <<'NODE'
import { renameSync, writeFileSync } from 'node:fs';

const privacyBoundedManifest = /^(?:phase14(?:-|$)|v1\.2-acceptance$)/u.test(process.env.SUITE ?? '');
const v12EvidenceManifest = process.env.SUITE === 'v1.2-acceptance';
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
    ...(privacyBoundedManifest ? {} : { device_path: process.env.INSTALLED_APK_PATH }),
    sha256: process.env.INSTALLED_APK_SHA256,
    matches_retained_apk:
      process.env.INSTALLED_APK_SHA256 === process.env.APK_SHA256,
  },
  package_launch: {
    component: process.env.LAUNCH_COMPONENT,
    succeeded: true,
  },
  device: {
    role: 'automated-test-device',
    ...(privacyBoundedManifest ? {} : { serial: process.env.DEVICE_SERIAL }),
    api: Number(process.env.DEVICE_API),
    abi: process.env.DEVICE_ABI,
    model: process.env.DEVICE_MODEL,
    android_release: process.env.ANDROID_RELEASE,
    identity_sha256: process.env.DEVICE_IDENTITY_SHA256,
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
  ...(v12EvidenceManifest ? {
    v12_evidence_identity: {
      manifest_version: 2,
      retained_apk_sha256: process.env.APK_SHA256,
      installed_apk_sha256: process.env.INSTALLED_APK_SHA256,
      signature_sha256: process.env.SIGNATURE_SHA256,
      certificate_sha256: process.env.CERTIFICATE_SHA256,
      device_identity_sha256: process.env.DEVICE_IDENTITY_SHA256,
      settings_sha256: process.env.SETTINGS_SHA256,
      restoration_sha256: process.env.RESTORATION_SHA256,
      config_state_sha256: process.env.SETTINGS_SHA256,
      git_attestation: {
        path: process.env.GIT_ATTESTATION_PATH,
        sha256: process.env.GIT_ATTESTATION_SHA256,
      },
    },
  } : {}),
};

const temporaryPath = `${process.env.BUILD_MANIFEST}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
renameSync(temporaryPath, process.env.BUILD_MANIFEST);
NODE

[ -s "$staged_build_manifest" ] || fail 'build manifest was not staged.'
[ ! -e "$artifact_directory" ] || fail "$artifact_directory appeared during the build; refusing to clobber it."
mkdir -p "$(dirname "$artifact_directory")"
mkdir "$artifact_directory" || fail "$artifact_directory could not be claimed without clobbering."
ln "$staged_apk_path" "$apk_path" || fail 'retained APK could not be published without clobbering.'
ln "$staged_alignment_log" "$alignment_log" || fail 'alignment receipt could not be published without clobbering.'
if [ -n "$staged_git_attestation_path" ]; then
  ln "$staged_git_attestation_path" "$git_attestation_path" || fail 'Git attestation could not be published without clobbering.'
fi
ln "$staged_build_manifest" "$build_manifest" || fail 'build manifest could not be published last without clobbering.'
[ -s "$build_manifest" ] || fail 'build manifest was not published.'
if [ "$single_build_claim_acquired" -eq 1 ]; then
  write_single_build_claim completed 0
  single_build_claim_completed=1
fi
printf 'build-current-native-test-apk: manifest=%s\n' "$build_manifest"
printf 'build-current-native-test-apk: apk=%s\n' "$apk_path"
printf 'build-current-native-test-apk: sha256=%s\n' "$apk_sha256"
case "$suite" in
  phase14 | phase14-* | v1.2-acceptance)
    printf 'build-current-native-test-apk: device_identity_sha256=%s api=%s abi=%s\n' \
      "$device_identity_sha256" "$device_api" "$device_abi"
    ;;
  *)
    printf 'build-current-native-test-apk: device=%s api=%s abi=%s\n' \
      "$device_serial" "$device_api" "$device_abi"
    ;;
esac
