"""POST /api/graph  {"repo": "owner/repo"}  ->  Graphify knowledge graph for that repo."""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _codemind import analyze  # noqa: E402

MAX_BODY = 4096


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        try:
            length = min(int(self.headers.get("Content-Length") or 0), MAX_BODY)
            body = json.loads(self.rfile.read(length) or b"{}")
            started = time.time()
            result = analyze(body.get("repo"))
            result["elapsedMs"] = int((time.time() - started) * 1000)
            self._send(200, result)
        except (ValueError, json.JSONDecodeError) as e:
            self._send(400, {"error": str(e)})
        except LookupError as e:
            self._send(404, {"error": str(e)})
        except Exception as e:  # surfaced to the UI as a readable message
            self._send(500, {"error": f"Graph build failed: {e}"})

    def do_GET(self):  # noqa: N802
        self._send(200, {"ok": True, "usage": "POST {\"repo\": \"owner/repo\"}"})
