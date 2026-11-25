import io
import tarfile

import pytest

from api._codemind import parse_repo, safe_extract, trim_graph, parse_report


@pytest.mark.parametrize(
    "inp,expected",
    [
        ("owner/repo", ("owner", "repo", None)),
        ("https://github.com/owner/repo", ("owner", "repo", None)),
        ("https://github.com/owner/repo/", ("owner", "repo", None)),
        ("https://github.com/owner/repo.git", ("owner", "repo", None)),
        ("github.com/Owner-1/my.repo", ("Owner-1", "my.repo", None)),
        ("https://github.com/owner/repo/tree/dev", ("owner", "repo", "dev")),
        ("https://github.com/owner/repo/tree/feature/x", ("owner", "repo", "feature/x")),
        ("  owner/repo  ", ("owner", "repo", None)),
    ],
)
def test_parse_repo_variants(inp, expected):
    assert parse_repo(inp) == expected


@pytest.mark.parametrize("bad", ["", "nope", "https://gitlab.com/a/b", "a/b/c/d", "owner/../etc", None])
def test_parse_repo_rejects_garbage(bad):
    with pytest.raises(ValueError):
        parse_repo(bad)


def _tar(members):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, data in members:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    buf.seek(0)
    return buf.read()


def test_safe_extract_strips_top_dir(tmp_path):
    root = safe_extract(_tar([("repo-main/src/a.py", b"x=1"), ("repo-main/README.md", b"hi")]), tmp_path)
    assert (root / "src" / "a.py").read_text() == "x=1"


def test_safe_extract_blocks_path_traversal(tmp_path):
    safe_extract(_tar([("repo-main/../../evil.py", b"bad"), ("repo-main/ok.py", b"ok")]), tmp_path / "out")
    assert not (tmp_path / "evil.py").exists()
    assert (tmp_path / "out" / "ok.py").exists()


def test_safe_extract_skips_vendor_dirs(tmp_path):
    root = safe_extract(_tar([("r/node_modules/x/index.js", b"1"), ("r/app.js", b"2")]), tmp_path)
    assert not (root / "node_modules").exists()
    assert (root / "app.js").exists()


def test_trim_graph_keeps_ui_fields_and_drops_rationale():
    raw = {
        "nodes": [
            {"id": "a", "label": "a()", "source_file": "a.py", "source_location": "L1", "community": 0,
             "community_name": "core", "_callable": True, "metadata": {"big": "x" * 100}, "norm_label": "a()"},
            {"id": "r", "label": "docstring", "file_type": "rationale"},
            {"id": "b", "label": "b.py", "source_file": "b.py"},
        ],
        "links": [
            {"source": "b", "target": "a", "relation": "calls", "confidence": "EXTRACTED", "weight": 1.0},
            {"source": "r", "target": "a", "relation": "rationale_for"},
        ],
    }
    g = trim_graph(raw)
    assert [n["id"] for n in g["nodes"]] == ["a", "b"]
    assert g["nodes"][0] == {"id": "a", "label": "a()", "kind": "function", "file": "a.py",
                             "location": "L1", "community": 0, "communityName": "core"}
    assert g["nodes"][1]["kind"] == "file"
    assert g["links"] == [{"source": "b", "target": "a", "relation": "calls"}]


def test_parse_report_extracts_god_nodes_and_questions():
    report = """# Graph Report
## God Nodes (most connected - your core abstractions)
1. `UserService` - 4 edges
2. `connect()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `handler()` --calls--> `UserService`  [EXTRACTED]
  src/api.py → src/users.py

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UserService` connect `UserService` to `users.py`?**
  _High betweenness._
- **What breaks if `connect()` changes?**
"""
    r = parse_report(report)
    assert r["godNodes"] == [{"label": "UserService", "edges": 4}, {"label": "connect()", "edges": 3}]
    assert r["surprises"] == ["`handler()` --calls--> `UserService`"]
    assert r["questions"] == [
        "Why does `UserService` connect `UserService` to `users.py`?",
        "What breaks if `connect()` changes?",
    ]


def test_parse_report_dedupes_surprises():
    report = "## Surprising Connections\n- `a` --calls--> `b`  [X]\n- `a` --calls--> `b`  [X]\n"
    assert parse_report(report)["surprises"] == ["`a` --calls--> `b`"]


def test_trim_graph_caps_size_preferring_code_over_docs():
    raw = {
        "nodes": [{"id": f"d{i}", "label": "h", "file_type": "document"} for i in range(5)]
        + [{"id": f"c{i}", "label": "f()", "_callable": True} for i in range(5)],
        "links": [{"source": "c0", "target": "d0", "relation": "references"},
                  {"source": "c0", "target": "c1", "relation": "calls"}],
    }
    g = trim_graph(raw, max_nodes=6)
    ids = [n["id"] for n in g["nodes"]]
    assert len(ids) == 6
    assert all(f"c{i}" in ids for i in range(5))
    assert g["truncated"] is True
    assert {"source": "c0", "target": "c1", "relation": "calls"} in g["links"]
