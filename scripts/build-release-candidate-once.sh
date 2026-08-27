#!/bin/sh

set -eu

output_directory=''

fail() {
  printf 'build-release-candidate-once: %s\n' "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-dir)
      [ "$#" -ge 2 ] || fail '--output-dir requires a value.'
      output_directory=$2
      shift 2
      ;;
    --output-dir=*)
      output_directory=${1#--output-dir=}
      shift
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[ -n "$output_directory" ] || fail '--output-dir is required.'
[ "${GYM_TRACKER_BUILD_PROFILE:-}" = 'production' ] ||
  fail 'GYM_TRACKER_BUILD_PROFILE must be production.'
[ -n "${RELEASE_KEYSTORE_PATH:-}" ] || fail 'RELEASE_KEYSTORE_PATH is required.'
[ -n "${RELEASE_KEYSTORE_PASSWORD:-}" ] || fail 'RELEASE_KEYSTORE_PASSWORD is required.'
[ -n "${RELEASE_KEY_ALIAS:-}" ] || fail 'RELEASE_KEY_ALIAS is required.'
[ -n "${RELEASE_KEY_PASSWORD:-}" ] || fail 'RELEASE_KEY_PASSWORD is required.'
[ -f "$RELEASE_KEYSTORE_PATH" ] || fail 'RELEASE_KEYSTORE_PATH does not exist.'

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$project_root"
[ "$(git rev-parse --show-toplevel)" = "$project_root" ] ||
  fail 'script must run from the repository root.'
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  fail 'tracked worktree must be clean before a release candidate build.'

case "$output_directory" in
  artifacts/release-candidate) ;;
  *) fail 'output directory must be artifacts/release-candidate.' ;;
esac

rm -rf android ios "$output_directory"
mkdir -p "$output_directory"
trap 'rm -rf android ios' EXIT

GYM_TRACKER_BUILD_PROFILE=production CI=1 \
  npx expo prebuild --clean --platform android --no-install
node scripts/assert-generated-production-android.mjs android

cat >> android/gradle.properties <<EOF
RELEASE_STORE_FILE=$RELEASE_KEYSTORE_PATH
RELEASE_STORE_PASSWORD=$RELEASE_KEYSTORE_PASSWORD
RELEASE_KEY_ALIAS=$RELEASE_KEY_ALIAS
RELEASE_KEY_PASSWORD=$RELEASE_KEY_PASSWORD
EOF

node scripts/configure-release-signing.mjs --build-gradle android/app/build.gradle

./android/gradlew \
  --project-dir "$project_root/android" \
  --no-daemon \
  '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8' \
  :app:assembleRelease \
  :app:bundleRelease

apk_source=android/app/build/outputs/apk/release/app-release.apk
aab_source=android/app/build/outputs/bundle/release/app-release.aab
[ -f "$apk_source" ] || fail 'Gradle did not produce a release APK.'
[ -f "$aab_source" ] || fail 'Gradle did not produce a release AAB.'

cp "$apk_source" "$output_directory/gym-tracker-release.apk"
cp "$aab_source" "$output_directory/gym-tracker-release.aab"
CI=1 npx expo config --type public --json > "$output_directory/release-config.json"
node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], JSON.stringify({node:process.version.slice(1), npm:process.env.npm_config_user_agent?.match(/npm\/(\S+)/)?.[1] ?? "unknown", java:"17.0.20+8", android_api:36, build_tools:"36.0.0", ndk:"27.1.12297006"}, null, 2)+"\n")' "$output_directory/release-toolchain.json"

printf 'build-release-candidate-once: output=%s\n' "$output_directory"
