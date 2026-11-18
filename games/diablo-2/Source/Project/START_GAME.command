#!/bin/sh
set -eu

game_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
game_file="$game_dir/index.html"

if [ ! -f "$game_file" ]; then
    printf '%s\n' 'index.html was not found. Extract the complete game ZIP first.' >&2
    exit 1
fi

exec open "$game_file"
