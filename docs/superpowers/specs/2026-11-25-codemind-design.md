# CodeMind — Design Spec

## Problem
Developers joining or changing an unfamiliar codebase can't easily answer
"if I change this module, what breaks?". CodeMind turns any GitHub repository
into a knowledge graph (via **Graphify**) and lets you ask questions about it in
chat. **Gemini** reasons over the graph, and every answer is shown in two ways:
written in the chat and highlighted on an interactive graph.

## User flow
1. Landing page: paste a public GitHub URL (`https://github.com/owner/repo` or `owner/repo`), or pick a demo repo.
2. CodeMind downloads the repo tarball and runs Graphify (AST extraction, no LLM), which returns nodes, links and communities.
3. Workspace: the interactive graph is on the left and chat is on the right. A stats bar shows files, nodes, edges and communities.
4. Ask a question, e.g. "What happens if I change `db.connect`?". Gemini calls graph tools (search, impact, neighbors, path) and streams an answer. The nodes it touched are highlighted on the graph: the changed node in red and its impact radius in amber by depth.
5. Click a node to see its details and connections, plus a quick action to ask what depends on it.

## Architecture
- **Next.js 16 (App Router, TS)** for the UI and `/api/chat`, using AI SDK + `@ai-sdk/google`. The key is read from `process.env.Gemini`, with `GEMINI_API_KEY` as a fallback.
- **Python Vercel Function `api/graph.py`**: downloads `codeload.github.com/<o>/<r>/tar.gz/<ref>`, enforces limits, runs `python -m graphify update <dir> --force`, and returns `graph.json` trimmed to the fields the UI needs.
- **Graph engine (`lib/graph/*`, pure TS)** does the work itself, so it is testable without network or LLM: it normalises the graph, does fuzzy node search, reverse-dependency impact via BFS with depth, neighbours, and shortest path.
- Graph state lives client-side. Each chat request sends the graph, and the server rebuilds the engine per request. This keeps the app stateless, with no database.

## Constraints
- Repo tarball ≤ 60 MB; source files analysed ≤ 4000 (otherwise a clear error is shown).
- Public repos only; an optional `GITHUB_TOKEN` env var raises rate limits.
- Gemini model: `gemini-2.5-flash`.
- Must deploy on Vercel; Node 22+.
- Every user prompt for this build is logged in `PROMPTS.md`.
