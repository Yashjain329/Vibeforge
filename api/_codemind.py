"""CodeMind core: fetch a GitHub repo, run Graphify on it, shape the result for the UI.

Kept free of HTTP concerns so it can be unit-tested (tests/test_codemind.py).
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath

MAX_TARBALL_BYTES = 60 * 1024 * 1024
MAX_SOURCE_FILES = 4000
GRAPHIFY_TIMEOUT_S = 240

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", ".next", "out", "vendor", "__pycache__",
    ".venv", "venv", "target", "coverage", ".turbo", ".cache", "bower_components",
}
SOURCE_EXT = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".kt", ".kts",
    ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".rb", ".php", ".swift", ".scala", ".lua",
    ".zig", ".ex", ".exs", ".groovy", ".ps1", ".md", ".vue", ".svelte",
}

_NAME = r"[A-Za-z0-9_.-]+"
_REPO_RE = re.compile(
    rf"^(?:(?:https?://)?(?:www\.)?github\.com/)?(?P<owner>{_NAME})/(?P<repo>{_NAME}?)(?:\.git)?"
    rf"(?:/tree/(?P<ref>[A-Za-z0-9_./-]+?))?/?$"
)


def parse_repo(value: object) -> tuple[str, str, str | None]:
    """Accept `owner/repo` or any github.com URL form; return (owner, repo, ref)."""
    if not isinstance(value, str):
        raise ValueError("Repository must be a string like owner/repo")
    s = value.strip()
    m = _REPO_RE.match(s)
    if not m or (s.count("/") > 1 and "github.com" not in s):
        raise ValueError(f"Not a GitHub repository: {value!r}")
    owner, repo, ref = m.group("owner"), m.group("repo"), m.group("ref")
    if owner in {".", ".."} or repo in {".", ".."} or not repo:
        raise ValueError(f"Not a GitHub repository: {value!r}")
    return owner, repo, ref


def safe_extract(data: bytes, dest: Path) -> Path:
    """Extract a GitHub tarball into `dest`, dropping the top folder, vendor dirs and unsafe paths."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    root = dest.resolve()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            parts = PurePosixPath(member.name).parts[1:]
            if not parts or any(p in ("..", "") or p.startswith("/") for p in parts):
                continue
            if any(p in SKIP_DIRS for p in parts[:-1]):
                continue
            target = (root / Path(*parts)).resolve()
            if root not in target.parents:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            src = tar.extractfile(member)
            if src is None:
                continue
            with open(target, "wb") as fh:
                shutil.copyfileobj(src, fh)
    return root


def _kind(n: dict) -> str:
    label = n.get("label") or ""
    src = n.get("source_file") or ""
    if n.get("file_type") == "document":
        return "doc"
    if n.get("type") == "external" or n.get("file_type") == "concept":
        return "external"
    if n.get("_callable_class"):
        return "class"
    if n.get("_callable"):
        return "function"
    if src and src.split("/")[-1] == label:
        return "file"
    return "symbol"


MAX_NODES = 9000
_KIND_PRIORITY = {"file": 0, "class": 0, "function": 0, "symbol": 1, "external": 2, "doc": 3}


def trim_graph(raw: dict, max_nodes: int = MAX_NODES) -> dict:
    """Keep only what the UI and engine need; drop Graphify's rationale (docstring) nodes.

    Large graphs are capped at `max_nodes`, keeping code before external symbols and docs,
    so the response stays well under Vercel's 4.5 MB body limit.
    """
    candidates = [
        n for n in raw.get("nodes", [])
        if n.get("file_type") != "rationale" and "id" in n
    ]
    truncated = len(candidates) > max_nodes
    if truncated:
        ranked = sorted(range(len(candidates)), key=lambda i: (_KIND_PRIORITY[_kind(candidates[i])], i))
        chosen = set(ranked[:max_nodes])
        candidates = [n for i, n in enumerate(candidates) if i in chosen]
    nodes, keep = [], set()
    for n in candidates:
        keep.add(n["id"])
        out = {"id": n["id"], "label": n.get("label") or n["id"], "kind": _kind(n)}
        for src, dst in (("source_file", "file"), ("source_location", "location"),
                         ("community", "community"), ("community_name", "communityName")):
            if n.get(src) is not None:
                out[dst] = n[src]
        nodes.append(out)
    links = [
        {"source": l["source"], "target": l["target"], "relation": l.get("relation", "related")}
        for l in raw.get("links", raw.get("edges", []))
        if l.get("source") in keep and l.get("target") in keep
    ]
    return {"nodes": nodes, "links": links, "truncated": truncated}


def _section(report: str, title: str) -> str:
    m = re.search(rf"^## {re.escape(title)}.*?$(.*?)(?=^## |\Z)", report, re.S | re.M)
    return m.group(1) if m else ""


def parse_report(report: str) -> dict:
    """Pull the highlights out of Graphify's GRAPH_REPORT.md."""
    gods = [
        {"label": m.group(1), "edges": int(m.group(2))}
        for m in re.finditer(r"^\d+\.\s+`(.+?)`\s+-\s+(\d+) edges", _section(report, "God Nodes"), re.M)
    ]
    surprises = list(dict.fromkeys(
        m.group(1).strip()
        for m in re.finditer(r"^- (`.+?` --\S+--> `.+?`)", _section(report, "Surprising Connections"), re.M)
    ))
    questions = [
        m.group(1).strip()
        for m in re.finditer(r"^- \*\*(.+?)\*\*\s*$", _section(report, "Suggested Questions"), re.M)
    ]
    return {"godNodes": gods[:10], "surprises": surprises[:8], "questions": questions[:6]}


def download_tarball(owner: str, repo: str, ref: str | None) -> bytes:
    url = f"https://codeload.github.com/{owner}/{repo}/tar.gz/{ref or 'HEAD'}"
    headers = {"User-Agent": "codemind"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read(MAX_TARBALL_BYTES + 1)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError(f"Repository {owner}/{repo} not found (is it public?)") from e
        raise RuntimeError(f"GitHub returned HTTP {e.code}") from e
    if len(data) > MAX_TARBALL_BYTES:
        raise ValueError("Repository is too large for CodeMind (over 60 MB compressed)")
    return data


def count_sources(root: Path) -> int:
    return sum(1 for p in root.rglob("*") if p.is_file() and p.suffix.lower() in SOURCE_EXT)


def run_graphify(root: Path) -> tuple[dict, str]:
    """Run the Graphify CLI (AST extraction + clustering, no LLM) and read its outputs."""
    env = {
        k: v for k, v in os.environ.items()
        if not re.search(r"GEMINI|GOOGLE|OPENAI|ANTHROPIC", k, re.I)
    }
    env["HOME"] = tempfile.gettempdir()
    env["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    env["GRAPHIFY_FORCE"] = "1"
    proc = subprocess.run(
        [sys.executable, "-m", "graphify", "update", str(root), "--force"],
        cwd=root, env=env, capture_output=True, text=True, timeout=GRAPHIFY_TIMEOUT_S,
    )
    out = root / "graphify-out"
    graph_file = out / "graph.json"
    if not graph_file.exists():
        tail = (proc.stderr or proc.stdout or "")[-600:]
        raise RuntimeError(f"Graphify did not produce a graph. {tail}")
    report_file = out / "GRAPH_REPORT.md"
    report = report_file.read_text(encoding="utf-8", errors="replace") if report_file.exists() else ""
    return json.loads(graph_file.read_text(encoding="utf-8")), report


def analyze(repo_input: str) -> dict:
    owner, repo, ref = parse_repo(repo_input)
    data = download_tarball(owner, repo, ref)
    return analyze_tarball(data, f"{owner}/{repo}" + (f"@{ref}" if ref else ""))


def analyze_tarball(data: bytes, name: str) -> dict:
    with tempfile.TemporaryDirectory(prefix="codemind-") as tmp:
        root = safe_extract(data, Path(tmp) / "src")
        n = count_sources(root)
        if n == 0:
            raise ValueError("No supported source files found in this repository")
        if n > MAX_SOURCE_FILES:
            raise ValueError(f"Repository has {n} source files; CodeMind's limit is {MAX_SOURCE_FILES}")
        raw, report = run_graphify(root)
    graph = trim_graph(raw)
    return {
        "repo": name,
        "graph": graph,
        "report": parse_report(report),
        "sourceFiles": n,
    }
