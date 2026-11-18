"""Optional local-only static server. Playing index.html directly needs no Python."""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main() -> int:
    parser = argparse.ArgumentParser(description='Serve Harbor Run on this computer only.')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as exc:
        print(f'Unable to start server: {exc}\nTry another port: python serve.py --port 8001')
        return 1
    url = f'http://127.0.0.1:{server.server_address[1]}/index.html'
    print(f'Harbor Run: {url}\nLocal access only. Press Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        timer = threading.Timer(0.3, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
