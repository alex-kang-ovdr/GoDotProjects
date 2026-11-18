#!/bin/sh
set -eu

game_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
game_file="$game_dir/index.html"

if [ ! -f "$game_file" ]; then
    printf '%s\n' 'index.html was not found. Extract the complete game ZIP first.' >&2
    exit 1
fi

if ! command -v xdg-open >/dev/null 2>&1; then
    printf '%s\n' 'No desktop file opener was found. Open index.html in your browser.' >&2
    exit 1
fi

exec xdg-open "$game_file"
