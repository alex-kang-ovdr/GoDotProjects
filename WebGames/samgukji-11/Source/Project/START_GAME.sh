#!/bin/sh
# No installation needed for normal PLAY.html use. This script opens the browser.
cd -- "$(dirname -- "$0")" || exit 1
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$PWD/PLAY.html"
elif command -v open >/dev/null 2>&1; then
  open "$PWD/PLAY.html"
else
  printf '%s\n' "Open PLAY.html in your browser, or use: node server.cjs"
fi
