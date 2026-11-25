import { normalizeGraph } from "../graph/engine";
import type { CMGraph } from "../graph/types";
import type { RepoReport } from "../ai/prompt";

export interface AnalyzeResult {
  repo: string;
  graph: CMGraph;
  truncated: boolean;
  report: RepoReport;
  sourceFiles: number;
  elapsedMs?: number;
}

export const DEMOS = [
  { id: "codemind", label: "CodeMind itself", hint: "this app, mapped by Graphify" },
  { id: "graphify", label: "Graphify-Labs/graphify", hint: "the engine behind the graphs" },
] as const;

function toResult(raw: Record<string, unknown>): AnalyzeResult {
  const g = raw.graph as Record<string, unknown>;
  return {
    repo: String(raw.repo),
    graph: normalizeGraph(g),
    truncated: Boolean(g?.truncated),
    report: (raw.report as RepoReport) ?? { godNodes: [], surprises: [], questions: [] },
    sourceFiles: Number(raw.sourceFiles ?? 0),
    elapsedMs: typeof raw.elapsedMs === "number" ? raw.elapsedMs : undefined,
  };
}

export async function loadDemo(id: string): Promise<AnalyzeResult> {
  const res = await fetch(`/demo/${id}.json`);
  if (!res.ok) throw new Error("Couldn't load the demo graph. Refresh the page and try again.");
  return toResult(await res.json());
}

export async function analyzeRepo(repo: string, signal?: AbortSignal): Promise<AnalyzeResult> {
  const res = await fetch("/api/graph", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo }),
    signal,
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      res.status === 504
        ? "Graphify took too long on this repository. Try a smaller repo or a specific branch."
        : `The graph service returned an unexpected response (HTTP ${res.status}).`,
    );
  }
  if (!res.ok) throw new Error(String(data.error ?? `Graph build failed (HTTP ${res.status})`));
  return toResult(data);
}
