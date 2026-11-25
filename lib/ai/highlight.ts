export interface Highlight {
  /** nodes the answer is about (red) */
  focus: Set<string>;
  /** impacted nodes keyed to their hop distance (amber → yellow) */
  depth: Map<string, number>;
  /** ordered node ids of a path to draw */
  path: string[];
}

export const emptyHighlight = (): Highlight => ({ focus: new Set(), depth: new Map(), path: [] });

type Out = Record<string, unknown> | undefined;

/** Turn the graph-tool results of an assistant turn into a graph highlight. Later outputs take precedence. */
export function highlightFromToolOutputs(items: { tool: string; output: unknown }[]): Highlight {
  let h = emptyHighlight();
  for (const { tool, output } of items) {
    const o = output as Out;
    if (!o || typeof o !== "object" || "error" in o) continue;
    if (tool === "analyzeImpact" && o.target) {
      h = emptyHighlight();
      h.focus.add((o.target as { id: string }).id);
      for (const a of (o.affected as { id: string; depth: number }[]) ?? []) h.depth.set(a.id, a.depth);
    } else if (tool === "findPath" && Array.isArray(o.path)) {
      h = { ...h, focus: new Set(o.path as string[]), path: o.path as string[] };
    } else if (tool === "getNeighbors" && o.node) {
      h = emptyHighlight();
      h.focus.add((o.node as { id: string }).id);
      for (const n of [...((o.incoming as { id: string }[]) ?? []), ...((o.outgoing as { id: string }[]) ?? [])])
        h.depth.set(n.id, 1);
    }
  }
  return h;
}
