#!/bin/sh
# Install this starter into the project directory from which this command is run.

set -eu

starter_root=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
installer="$starter_root/.starter/install.py"
dry_run=false
help_requested=false

for argument in "$@"; do
    case "$argument" in
        --dry-run)
            dry_run=true
            ;;
        -h|--help)
            help_requested=true
            ;;
    esac
done

if [ ! -f "$installer" ]; then
    echo "error: starter installer is missing: $installer" >&2
    exit 1
fi

python3 "$installer" "$@"

if [ "$help_requested" = true ]; then
    exit 0
fi

if [ "$dry_run" = true ]; then
    printf '\nDry run complete: no files were changed.\n'
else
    printf '\nNext: reopen this project in Codex and start using the agents and skills.\n'
fi
