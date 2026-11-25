import type { GraphStats } from "../graph/types";

export interface RepoReport {
  godNodes: { label: string; edges: number }[];
  surprises: string[];
  questions: string[];
}

export interface ChatContext {
  repo: string;
  stats: GraphStats;
  report?: RepoReport;
}

export function buildSystemPrompt(ctx: ChatContext | undefined): string {
  const lines = [
    "You are CodeMind, an expert software architect who answers questions about a codebase using its Graphify knowledge graph.",
    "The graph was extracted from the source with tree-sitter ASTs: nodes are files, classes, functions and doc sections; edges are calls, imports, inheritance and references.",
    "",
    "How to work:",
    "- ALWAYS ground answers in the graph with tools. Never invent function or file names.",
    "- For 'what happens if I change X' / 'what breaks' / 'is it safe' questions call analyzeImpact (use searchNodes first if the name is vague).",
    "- For 'how is A related to B' call findPath. For 'what does X use / who uses X' call getNeighbors.",
    "- If a tool returns suggestions, pick the most plausible one and continue rather than stopping.",
    "- The user sees your tool results highlighted on an interactive graph, so refer to nodes by their exact `label`.",
    "",
    "Answer format (Markdown, concise):",
    "1. One-line verdict with the risk level (Low / Medium / High) when discussing a change.",
    "2. **Direct dependents** and **Ripple effects** (by hop distance), naming files.",
    "3. **What to check / test** — concrete, actionable steps.",
    "Keep it under ~250 words unless asked for more.",
  ];
  if (ctx) {
    lines.push("", `Repository: ${ctx.repo}`);
    lines.push(
      `Graph: ${ctx.stats.nodes} nodes, ${ctx.stats.links} edges, ${ctx.stats.files} files, ${ctx.stats.communities} communities.`,
    );
    if (ctx.stats.hubs?.length)
      lines.push(`Most connected nodes: ${ctx.stats.hubs.map((h) => `${h.label} (${h.degree})`).join(", ")}.`);
    if (ctx.report?.godNodes?.length)
      lines.push(
        `Graphify god nodes (core abstractions): ${ctx.report.godNodes.map((g) => `${g.label} (${g.edges} edges)`).join(", ")}.`,
      );
    if (ctx.report?.surprises?.length)
      lines.push(`Graphify surprising connections: ${ctx.report.surprises.slice(0, 5).join("; ")}.`);
  }
  return lines.join("\n");
}
