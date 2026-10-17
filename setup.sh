#!/bin/sh
# Install the maxxy-me multi-agent team into the project you run this from.
# You pick Claude Code, Codex, or both with the arrow keys (or pass --agent).
# Run with --help for all options.

set -eu

starter_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
installer="$starter_root/.starter/install.py"

if [ ! -f "$installer" ]; then
    echo "error: starter installer is missing: $installer" >&2
    exit 1
fi

python=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 &&
        "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; then
        python=$candidate
        break
    fi
done

if [ -z "$python" ]; then
    echo "error: Python 3.8 or newer is required (python3 was not found on PATH)" >&2
    exit 1
fi

exec "$python" -I "$installer" "$@"
