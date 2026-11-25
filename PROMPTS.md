# Prompt History — CodeMind (VibeForge 2026)

This file records every prompt the team gave the AI coding assistant (Claude Code) while building CodeMind, as the VibeForge rulebook (§3 "Development Record") requires. Prompts appear verbatim and in order, each followed by a short note of what the assistant did in response.

---

## Prompt 1 — Project kickoff

> Here is the event book that as been given as the event is an open innovation I'm thinking of building a project name "Codemind" that will work on any repository and will use Graphify to create it's knowledge graph and then the Gemini API key that I have added in the variable will come in place as it will work on the knowledge graph and If any one asks anything like if I change this module what will happen or something like that than we will represent it thorugh the graph as well as In chat as well
>
> Use /frontend-design:frontend-design for UI/UX as the design and Experience should be user friendly and easy to go thorugh
>
> Use /superpowers:writing-plans /superpowers:test-driven-development for the best working that we can provide
>
> use /vercel:deploy of vercel for deployment of the web platform
>
> update the full code on github repo along with a prompt history as well.
>
> show me in between when we achieve some steps in the work

**AI actions:**
- Inspected the Graphify CLI (`graphifyy` on PyPI) and ran it on a sample repo to learn its `graph.json` and `GRAPH_REPORT.md` formats.
- Wrote the design spec (`docs/superpowers/specs/`) and implementation plan (`docs/superpowers/plans/`).
- Scaffolded Next.js with `create-next-app`, then built the graph engine test-first.

## Prompt 2 — Rulebook + Graphify repo

> [attached: VibeForge-Participant_Rulebook.pdf] https://github.com/Graphify-Labs/graphify

**AI actions:**
- Read the rulebook and added requirements from it: keep this prompt history, disclose pre-existing code in the README, and target the "Best Use of Graphify" track.
- Confirmed that the `graphifyy` package is the Graphify-Labs/graphify project.
- Planned a deeper Graphify integration: `GRAPH_REPORT.md` god-nodes and suggested questions now feed the chat.

## Prompt 3 — Deploy

> Approved , Deploy it

**AI actions:**
- Confirmed Vercel team access.
- Tried to create a Git-connected Vercel project. Vercel couldn't see the repo because its GitHub App wasn't installed.
- Asked the user to choose a deploy path. The user chose: install the Vercel GitHub App, so every push auto-deploys.

## Prompt 4 — GitHub access for Vercel

> Access given

**AI actions:**
- Retried the Git-linked project. Vercel's API returned `401 github_response_error`, meaning the Vercel account's GitHub login connection was broken.
- Switched to deploying with the Vercel CLI, using a token stored as a proxy-injected network secret so it never appears in chat.

## Prompt 5 — Vercel token

> So I have created the token and named it Codemind

**AI actions:**
- Collected the token through the secure credential form and verified it (authenticated as the account owner).
- Ran `vercel link` to create project `codemind`.
- Set `Gemini`, `GEMINI_MODEL` and `VERCEL_SUPPORT_LARGE_FUNCTIONS`. The Gemini key was piped from the session environment and never printed.
- The first deploy failed because the Hobby plan caps function memory at 2048 MB. Lowered it in `vercel.json` and redeployed: **READY** at https://codemind-henna.vercel.app.
- Smoke-tested production:
  - The Graphify function mapped `pallets/itsdangerous` from GitHub in 1.8 s (323 nodes, 639 edges).
  - A browser end-to-end run had Gemini trace 45 dependents of `Signer`, with "high" risk shown both in chat and on the graph.
- Fixed a double focus outline on the chat box, which a global CSS rule was causing.

## Prompt 6 — Branches + ideas

> What if I want to see branches of a repo can we have that as well and also what else do you think we can add to the project for now

**AI actions:**
- Built the branch feature test-first:
  - `lib/github/branches.ts` (parse repo, list branches with the default first, rate-limit/404 errors) with 14 vitest tests.
  - `/api/branches` route with a 400-on-bad-input test.
  - Branch picker on the landing page, a branch switcher in the workspace header, and an error banner if a switch fails.
- Deployed and verified on production with `pallets/itsdangerous`:
  - The picker listed `main (default)` and `stable`.
  - Mapping `stable` produced a different graph from `main` (325 vs 323 nodes).
  - Switching from the header re-mapped `main`.
- Suggested next features: branch-diff impact, PR review, a shareable report, and an architecture tour.

## Prompt 7 — Reports, tour, deck, OpenRouter

> Build 3 and 4 and also  5 after 3 and 4  and also can we change the API key to openrouter as they current gemini one has reached it's limit

**AI actions:**
- **OpenRouter:**
  - Collected the key through the secure credential form and found it is a free-tier key (50 free-model requests a day).
  - Tested free models for tool calling. Nemotron 3 Ultra passed in 2.9 s; two others were rate-limited upstream.
  - Built `resolveAiConfig()` test-first: OpenRouter is preferred, with free-model fallbacks, and Gemini is the backup.
- **#3 Shareable impact report:**
  - `lib/report/report.ts` (build, gzip+base64url encode/decode, radial blast-radius layout) with 6 tests.
  - A `/report` page with Copy link and Save as PDF (print stylesheet), and a "Share report" button on every answer.
  - Verified in the browser, including print mode.
- **#4 Architecture tour:**
  - `lib/tour/tour.ts` (community summaries, AI-output parsing, graph-only fallback, highlight) with 6 tests, and `/api/tour` with 2 tests.
  - The tour panel steps through Graphify communities, highlighting each.
  - The free model took 89 s, so the tour now starts instantly from graph data and swaps in AI narration when it arrives.
- **#5 Presentation deck:** an 11-slide pitch deck built as a Slides artifact in CodeMind's visual style, with real screenshots and speaker notes.
- Deployed to production.

## Prompt 8 — OpenRouter key on Vercel

> Added the Openrouter key on Vercel

**AI actions:**
- Checked the Vercel project's env vars and found the key had been added under the name `OpenRouter`, not `OPENROUTER_API_KEY`.
- Added a failing test, then made `resolveAiConfig()` accept both names.
- Redeployed and verified on production:
  - A chat answer streamed through OpenRouter and "Share report" opened the report page.
  - The tour returned AI narration in 7.9 s.

## Prompt 9 — Free-tier limit hit mid-answer

> The AI didn't finish this answer: Failed after 3 attempts. Last error: AI_APICallError: Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day: https://openrouter.ai/settings/credits?utm_source=api&utm_campaign=free_daily_limit
>
> But it wasn't even able to provide me a full answer

## Prompt 10 — New key, no credit for testing

> I have changed the API key in vercel for open router so don't use the credit for testing this time

**AI actions (prompts 9–10):**
- Explained the 50-requests/day free cap; testing earlier that day had used about 25 of them.
- Built a graph-only fallback test-first: `lib/ai/graph-answer.ts`, with 5 tests.
  - If the AI fails for any reason (quota, rate limit, bad key, outage), CodeMind runs the impact analysis itself and writes the answer from the graph.
  - The graph highlight and "Share report" still work, and the stale error box is hidden.
  - Question names are matched case- and separator-blind, so `parseRepo` finds `parse_repo()`.
- The server now retries once instead of three times, since a daily quota won't clear on retry.
- Respected the no-credit request: tested only against the old, now-rejected key, which costs nothing, and made no AI calls against production.
- Found the new Vercel variable was named `Openrouter` (lowercase r). Made the key lookup case-insensitive, test-first.
- Added `GET /api/chat`, which reports the configured provider without exposing the key or calling the model, so a deployment can be checked for free.

## Prompt 11 — AI first, raw impact only as fallback

> make sure that until the key is there it answer using it and then it shifts to the raw impact

**AI actions:**
- Confirmed every question tries the AI first and falls back only when that request fails.
- Closed a gap: graph-only answers are now left out of the history sent to the AI (`lib/ai/history.ts`, 2 tests), so chat goes straight back to the AI once it's available again.
- Added `scripts/mock-openrouter.mjs`, a local stand-in for OpenRouter's streaming API that can return the real daily-limit error on chosen requests, plus an `OPENROUTER_BASE_URL` override for testing. No credit used.
- Verified in the browser:
  - Limit between questions: Q1 AI → Q2 raw impact → Q3 AI.
  - Limit mid-answer: the graph answer replaced the half-finished reply, then the AI handled the next questions.

---

## Build log (AI actions between prompts)

The following steps happened inside Prompt 1–2's session. They are recorded so the jury can follow the development process.

| Step | What the AI did | Evidence |
|---|---|---|
| Plan | Used `superpowers:writing-plans` to write a spec and a 5-task plan | `docs/superpowers/` |
| Engine (TDD) | Wrote 13 failing vitest tests, watched them fail, then implemented `GraphEngine` | `lib/graph/engine*.ts` |
| Graphify function (TDD) | Wrote 19 pytest tests (URL variants, tar path-traversal, trimming, report parsing), then implemented. Ran Graphify end to end on a real codebase: 3,932 nodes in 8.4 s | `api/_codemind.py` |
| Found & fixed by test | Duplicated "surprising connections" and an uncapped payload (Vercel 4.5 MB limit). Added 2 failing tests, then fixed | `tests/test_codemind.py` |
| Gemini | Probed the models available to the key: 3.8-flash was overloaded (503) and 2.5-flash is retired for new keys (404), so chose `gemini-3.5-flash`. Designed browser-executed tools so the graph is never uploaded | `app/api/chat/route.ts` |
| UI | Used `frontend-design`: a "blast radius on a cyanotype" concept, reviewed with Playwright screenshots on desktop and iPhone 13, then fixed headline wrapping, collapsed mobile input, noisy starters and a double focus ring | `components/` |
| Found & fixed by test | Gemini said "Medium" while the graph computed "high" risk. Added a failing prompt test, then fixed the prompt | `app/api/chat/route.test.ts` |
| Deploy | Used the `vercel:deploy` skill: Python function for Graphify (300 s, 3 GB), Next.js for UI + chat | `vercel.json` |
