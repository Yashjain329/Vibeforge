"""Pre-build a demo graph with Graphify: python scripts/build_demo.py <dir> <id> <repo-label>

Writes public/demo/<id>.json in the same shape /api/graph returns.
"""
import io
import json
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
from _codemind import SKIP_DIRS, analyze_tarball  # noqa: E402


def tar_dir(src: Path) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in sorted(src.rglob("*")):
            rel = p.relative_to(src)
            if p.is_file() and not any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts):
                if "demo" in rel.parts and "public" in rel.parts:
                    continue
                tar.add(p, arcname=f"repo/{rel.as_posix()}")
    return buf.getvalue()


if __name__ == "__main__":
    src, demo_id, label = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    result = analyze_tarball(tar_dir(src), label)
    out = ROOT / "public" / "demo" / f"{demo_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, separators=(",", ":")))
    g = result["graph"]
    print(f"{out.name}: {len(g['nodes'])} nodes, {len(g['links'])} links, {out.stat().st_size // 1024} KB")
