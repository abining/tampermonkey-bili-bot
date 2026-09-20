#!/usr/bin/env python3
"""仅在 127.0.0.1 上提供单个 userscript，并附带 CORS 与禁用缓存响应头。"""

from argparse import ArgumentParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args():
    parser = ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--port", type=int, default=5510)
    return parser.parse_args()


def main():
    args = parse_args()
    artifact = args.artifact.resolve()
    if not artifact.is_file() or not artifact.name.endswith(".user.js"):
        raise SystemExit(f"无效的 userscript 文件: {artifact}")

    payload = artifact.read_bytes()
    route = f"/{artifact.name}"

    class Handler(BaseHTTPRequestHandler):
        def send_userscript_headers(self):
            if self.path.split("?", 1)[0] != route:
                self.send_error(404)
                return False
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.end_headers()
            return True

        def do_HEAD(self):
            self.send_userscript_headers()

        def do_GET(self):
            if self.send_userscript_headers():
                self.wfile.write(payload)

        def log_message(self, format, *values):
            print(f"[userscript-server] {self.address_string()} - {format % values}", flush=True)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"USERSCRIPT_URL=http://127.0.0.1:{args.port}{route}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
