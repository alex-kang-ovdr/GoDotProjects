#!/usr/bin/env python3
"""Serve an exported Web build on loopback. No external services required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--port',type=int,default=8060)
a = p.parse_args()
web = ROOT/'build'/'web'
if not (web/'index.html').is_file():
    raise SystemExit('Web build not found. Run tools/export_game.py web after installing Godot export templates.')
print(f'Open http://127.0.0.1:{a.port}',flush=True)
ThreadingHTTPServer(('127.0.0.1',a.port),partial(SimpleHTTPRequestHandler,directory=str(web))).serve_forever()
