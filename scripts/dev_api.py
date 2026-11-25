"""Local dev server for the Python Graphify function: python scripts/dev_api.py (port 8000)."""
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
from graph import handler  # noqa: E402

if __name__ == "__main__":
    print("CodeMind graph API on http://127.0.0.1:8000/api/graph")
    ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()
