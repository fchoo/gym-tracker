#!/bin/sh

set -eu

version='2.8.0'
archive_sha256='b3e561161904fb391875ca5834d5b22cf0b01c052dd1b408ad83e30d8f8951b3'
checksums_sha256='154a540080c5bc7ab5b1debec658e799f8259b77d167b33a1a9c3db261320914'
release_url="https://github.com/mobile-dev-inc/Maestro/releases/download/cli-$version"
install_root=${MAESTRO_INSTALL_ROOT:-"$HOME/.maestro"}
temporary_directory=$(mktemp -d)

case "$install_root" in
  "$HOME"/*) ;;
  *)
    printf 'install-maestro: install root must be inside HOME: %s\n' "$install_root" >&2
    exit 1
    ;;
esac

cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT HUP INT TERM

fail() {
  printf 'install-maestro: %s\n' "$1" >&2
  exit 1
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    fail 'sha256sum or shasum is required.'
  fi
}

command -v curl >/dev/null 2>&1 || fail 'curl is required.'
command -v unzip >/dev/null 2>&1 || fail 'unzip is required.'

curl --fail --location --silent --show-error \
  "$release_url/checksums_sha256.txt" \
  --output "$temporary_directory/checksums_sha256.txt"

actual_checksums_sha256=$(hash_file "$temporary_directory/checksums_sha256.txt")
[ "$actual_checksums_sha256" = "$checksums_sha256" ] ||
  fail "checksum manifest digest mismatch: expected $checksums_sha256, found $actual_checksums_sha256."

published_archive_sha256=$(
  awk '$2 == "maestro.zip" { print $1 }' "$temporary_directory/checksums_sha256.txt"
)
[ "$published_archive_sha256" = "$archive_sha256" ] ||
  fail "published archive digest mismatch: expected $archive_sha256, found ${published_archive_sha256:-missing}."

curl --fail --location --silent --show-error \
  "$release_url/maestro.zip" \
  --output "$temporary_directory/maestro.zip"

actual_archive_sha256=$(hash_file "$temporary_directory/maestro.zip")
[ "$actual_archive_sha256" = "$archive_sha256" ] ||
  fail "archive digest mismatch: expected $archive_sha256, found $actual_archive_sha256."

unzip -q "$temporary_directory/maestro.zip" -d "$temporary_directory/extracted"
[ -x "$temporary_directory/extracted/maestro/bin/maestro" ] ||
  fail 'verified archive does not contain maestro/bin/maestro.'

rm -rf "$temporary_directory/install"
mkdir -p "$temporary_directory/install"
mv "$temporary_directory/extracted/maestro" "$temporary_directory/install/current"
mkdir -p "$(dirname "$install_root")"
previous_install="${install_root}.previous.$$"
rm -rf "$previous_install"
if [ -e "$install_root" ]; then
  mv "$install_root" "$previous_install"
fi
if ! mv "$temporary_directory/install/current" "$install_root"; then
  [ ! -e "$previous_install" ] || mv "$previous_install" "$install_root"
  fail 'could not activate the verified Maestro installation.'
fi

installed_version=$("$install_root/bin/maestro" --version 2>/dev/null | tail -n 1)
[ "$installed_version" = "$version" ] ||
  fail "installed binary reports ${installed_version:-unknown}, expected $version."
rm -rf "$previous_install"

printf 'install-maestro: installed %s at %s\n' "$version" "$install_root"
printf 'install-maestro: add %s/bin to PATH\n' "$install_root"
