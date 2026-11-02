#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --requirement requirements-dev.lock
.venv/bin/python -c 'import coverage; assert coverage.__version__ == "7.16.2"'
