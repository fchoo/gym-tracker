#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
temporary_directory=$(mktemp -d)
first_snapshot="$temporary_directory/first"
second_snapshot="$temporary_directory/second"
native_build_lock="$project_root/.native-build.lock"
native_build_lock_acquired=0

cleanup() {
  if [ "$native_build_lock_acquired" -eq 1 ]; then
    rm -rf "$project_root/android" "$project_root/ios"
    rmdir "$native_build_lock" 2>/dev/null || true
  fi
  rm -rf "$temporary_directory"
}
trap cleanup EXIT HUP INT TERM

fail() {
  printf 'check-cng-reproducible: %s\n' "$1" >&2
  exit 1
}

snapshot_android() {
  destination=$1
  mkdir -p "$destination"

  find android -type f \
    ! -path 'android/local.properties' \
    ! -path 'android/.gradle/*' \
    ! -path 'android/.kotlin/*' \
    ! -path 'android/.cxx/*' \
    ! -path 'android/*/build/*' \
    -print |
    LC_ALL=C sort |
    while IFS= read -r source_path; do
      relative_path=${source_path#android/}
      destination_path="$destination/$relative_path"
      mkdir -p "$(dirname "$destination_path")"

      if LC_ALL=C grep -Iq . "$source_path"; then
        PROJECT_ROOT="$project_root" SOURCE_PATH="$source_path" DESTINATION_PATH="$destination_path" \
          node <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const contents = readFileSync(process.env.SOURCE_PATH, 'utf8');
const normalized = contents
  .replaceAll(process.env.PROJECT_ROOT, '<PROJECT_ROOT>')
  .replaceAll(process.env.PROJECT_ROOT.replaceAll('/', '\\/'), '<PROJECT_ROOT>');
writeFileSync(process.env.DESTINATION_PATH, normalized);
NODE
      else
        cp "$source_path" "$destination_path"
      fi
    done
}

run_generation() {
  snapshot_path=$1
  rm -rf android ios
  GYM_TRACKER_BUILD_PROFILE=development-test CI=1 \
    npx expo prebuild --clean --platform android --no-install
  node scripts/assert-generated-android.mjs android
  snapshot_android "$snapshot_path"
}

cd "$project_root"

if ! mkdir "$native_build_lock" 2>/dev/null; then
  fail 'another generated-native operation is already running in this workspace.'
fi
native_build_lock_acquired=1

git check-ignore -q --no-index android/probe ||
  fail 'android/ must remain ignored before generated-native verification.'
git check-ignore -q --no-index ios/probe ||
  fail 'ios/ must remain ignored before generated-native verification.'
[ -z "$(git ls-files android ios)" ] ||
  fail 'generated android/ or ios/ files are tracked.'

run_generation "$first_snapshot"
run_generation "$second_snapshot"

if ! diff -ru "$first_snapshot" "$second_snapshot" >"$temporary_directory/cng.diff"; then
  printf 'check-cng-reproducible: two clean Android generations differ.\n' >&2
  sed -n '1,240p' "$temporary_directory/cng.diff" >&2
  exit 1
fi

printf 'check-cng-reproducible: two clean development-test generations match.\n'
