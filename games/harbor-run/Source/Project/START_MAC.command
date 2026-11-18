#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py
else
  echo "Python 3 not found. Open index.html in your browser."
  open index.html
fi
