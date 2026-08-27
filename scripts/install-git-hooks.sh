#!/bin/sh

set -eu

repository_root=$(git rev-parse --show-toplevel)
git -C "$repository_root" config core.hooksPath .githooks
chmod +x "$repository_root/.githooks/commit-msg"

printf 'Git hooks installed from %s/.githooks\n' "$repository_root"
