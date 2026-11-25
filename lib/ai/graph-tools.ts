import { z } from "zod";
import type { GraphEngine } from "../graph/engine";
import type { CMNode } from "../graph/types";

/**
 * Tool definitions shared by the server (schemas sent to Gemini) and the browser
 * (which executes them against the in-memory Graphify graph).
 */
export const graphToolSchemas = {
  searchNodes: {
    description:
      "Fuzzy-search the code knowledge graph for functions, classes, files or docs. Use this first when the user names something loosely.",
    inputSchema: z.object({ query: z.string().describe("name, partial name or file path") }),
  },
  analyzeImpact: {
    description:
      "Change-impact / blast-radius analysis: everything that directly or transitively depends on a node (callers, importers, subclasses). Use for 'what happens if I change X', 'what breaks', 'is it safe to modify'.",
    inputSchema: z.object({
      node: z.string().describe("node id, label or file path"),
      maxDepth: z.number().int().min(1).max(6).optional().describe("how many hops to follow (default 4)"),
    }),
  },
  getNeighbors: {
    description: "Direct connections of a node: what it calls/imports (outgoing) and what calls/imports it (incoming).",
    inputSchema: z.object({ node: z.string() }),
  },
  findPath: {
    description: "Shortest connection between two nodes in the graph, to explain how two parts of the code are related.",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
  },
} as const;

export type GraphToolName = keyof typeof graphToolSchemas;

const MAX_AFFECTED = 40;
const MAX_NEIGHBORS = 25;

const brief = (n: CMNode) => ({ id: n.id, label: n.label, kind: n.kind, file: n.file, location: n.location });

function notFound(engine: GraphEngine, q: string) {
  const suggestions = engine.suggest(q).concat(engine.search(q, 3)).slice(0, 5).map(brief);
  return { error: `Node "${q}" not found in the graph`, suggestions };
}

export function riskLevel(total: number, files: number): "low" | "medium" | "high" {
  if (total > 25 || files > 10) return "high";
  if (total > 6 || files > 3) return "medium";
  return "low";
}

/** Execute a graph tool against the engine. Never throws: errors come back as `{error}` for the model. */
export function runGraphTool(engine: GraphEngine, tool: string, input: Record<string, unknown>): unknown {
  const s = (k: string) => String(input[k] ?? "");
  switch (tool) {
    case "searchNodes":
      return engine.search(s("query"), 10).map(brief);
    case "analyzeImpact": {
      const maxDepth = typeof input.maxDepth === "number" ? input.maxDepth : 4;
      const r = engine.impact(s("node"), maxDepth);
      if (!r.found || !r.target) return notFound(engine, s("node"));
      const byDepth: Record<number, number> = {};
      for (const a of r.affected) byDepth[a.depth] = (byDepth[a.depth] ?? 0) + 1;
      return {
        target: brief(r.target),
        total: r.affected.length,
        byDepth,
        files: r.files.slice(0, 30),
        fileCount: r.files.length,
        risk: riskLevel(r.affected.length, r.files.length),
        affected: r.affected.slice(0, MAX_AFFECTED).map((a) => ({
          ...brief(a.node),
          depth: a.depth,
          via: a.via,
          dependsOn: a.dependsOn,
        })),
      };
    }
    case "getNeighbors": {
      const r = engine.neighbors(s("node"));
      if (!r) return notFound(engine, s("node"));
      const map = (xs: { node: CMNode; relation: string }[]) =>
        xs.slice(0, MAX_NEIGHBORS).map((x) => ({ ...brief(x.node), relation: x.relation }));
      return {
        node: brief(r.node),
        incomingTotal: r.incoming.length,
        outgoingTotal: r.outgoing.length,
        incoming: map(r.incoming),
        outgoing: map(r.outgoing),
      };
    }
    case "findPath": {
      const p = engine.path(s("from"), s("to"));
      if (!p) return { error: `No connection found between "${s("from")}" and "${s("to")}"` };
      return { path: p, labels: p.map((id) => engine.byId.get(id)!.label) };
    }
    default:
      return { error: `Unknown tool: ${tool}` };
  }
}
