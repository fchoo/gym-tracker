#!/bin/sh

set -eu

apk_path=${1:-}

if [ -z "$apk_path" ]; then
  printf 'usage: sh scripts/hash-apk.sh <apk-path>\n' >&2
  exit 2
fi

if [ ! -f "$apk_path" ]; then
  printf 'hash-apk: file not found: %s\n' "$apk_path" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$apk_path" | awk '{ print $1 }'
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$apk_path" | awk '{ print $1 }'
else
  printf 'hash-apk: sha256sum or shasum is required.\n' >&2
  exit 1
fi
