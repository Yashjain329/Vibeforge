import type { GraphEngine } from "../graph/engine";
import { emptyHighlight, type Highlight } from "../ai/highlight";

export interface CommunityLink {
  id: number;
  name: string;
  edges: number;
}

export interface CommunitySummary {
  id: number;
  name: string;
  size: number;
  keyNodes: string[];
  files: string[];
  dependsOn: CommunityLink[];
  usedBy: CommunityLink[];
  /** node ids in this community (code only); kept client-side, not sent to the model */
  nodeIds: string[];
  hubId: string;
}

export interface TourStep {
  communityId: number;
  title: string;
  summary: string;
}

export interface Tour {
  intro: string;
  steps: TourStep[];
}

const MIN_SIZE = 3;
const STRUCTURAL = new Set(["contains", "rationale_for", "cites"]);

/** The largest Graphify communities, described well enough for a model (or a fallback) to narrate. */
export function summarizeCommunities(engine: GraphEngine, limit = 7): CommunitySummary[] {
  const groups = new Map<number, string[]>();
  for (const n of engine.graph.nodes) {
    if (n.community === undefined || n.kind === "doc" || n.kind === "external") continue;
    groups.set(n.community, [...(groups.get(n.community) ?? []), n.id]);
  }
  const communityOf = new Map<string, number>();
  for (const [c, ids] of groups) for (const id of ids) communityOf.set(id, c);
  const nameOf = (c: number) => {
    const ids = groups.get(c) ?? [];
    return engine.byId.get(ids[0])?.communityName ?? `Community ${c}`;
  };

  // cross-community dependency edges: source community depends on target community
  const cross = new Map<string, number>();
  for (const l of engine.graph.links) {
    if (STRUCTURAL.has(l.relation)) continue;
    const a = communityOf.get(l.source);
    const b = communityOf.get(l.target);
    if (a === undefined || b === undefined || a === b) continue;
    cross.set(`${a}>${b}`, (cross.get(`${a}>${b}`) ?? 0) + 1);
  }
  const linksFor = (c: number, dir: "out" | "in"): CommunityLink[] =>
    [...cross.entries()]
      .map(([k, edges]) => {
        const [a, b] = k.split(">").map(Number);
        return dir === "out" ? (a === c ? { id: b, edges } : null) : b === c ? { id: a, edges } : null;
      })
      .filter((x): x is { id: number; edges: number } => !!x && groups.has(x.id) && (groups.get(x.id)?.length ?? 0) >= MIN_SIZE)
      .sort((x, y) => y.edges - x.edges)
      .slice(0, 3)
      .map((x) => ({ id: x.id, name: nameOf(x.id), edges: x.edges }));

  return [...groups.entries()]
    .filter(([, ids]) => ids.length >= MIN_SIZE)
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
    .slice(0, limit)
    .map(([id, ids]) => {
      const byDegree = [...ids].sort((a, b) => engine.degree(b) - engine.degree(a));
      const fileCount = new Map<string, number>();
      for (const nid of ids) {
        const f = engine.byId.get(nid)?.file;
        if (f) fileCount.set(f, (fileCount.get(f) ?? 0) + 1);
      }
      return {
        id,
        name: nameOf(id),
        size: ids.length,
        keyNodes: byDegree.slice(0, 5).map((nid) => engine.byId.get(nid)!.label),
        files: [...fileCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f),
        dependsOn: linksFor(id, "out"),
        usedBy: linksFor(id, "in"),
        nodeIds: ids,
        hubId: byDegree[0],
      };
    });
}

/** Pull a tour out of model text (tolerates prose and code fences); null if unusable. */
export function parseTour(text: string, communities: CommunitySummary[]): Tour | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: { intro?: unknown; steps?: unknown };
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const known = new Set(communities.map((c) => c.id));
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s: Record<string, unknown>) => ({
      communityId: Number(s.communityId),
      title: String(s.title ?? "").trim(),
      summary: String(s.summary ?? "").trim(),
    }))
    .filter((s) => known.has(s.communityId) && s.title && s.summary);
  if (!steps.length) return null;
  return { intro: String(raw.intro ?? "").trim(), steps };
}

const list = (xs: string[]) => xs.map((x) => `\`${x}\``).join(", ");

/** A tour built from graph structure alone, used when the model is unavailable. */
export function fallbackTour(repo: string, communities: CommunitySummary[]): Tour {
  return {
    intro: `${repo} splits into ${communities.length} main areas that Graphify found by clustering the code graph. Here they are, largest first.`,
    steps: communities.map((c) => {
      const parts = [
        `${c.size} pieces of code, centred on ${list(c.keyNodes.slice(0, 3))}.`,
        c.files.length ? `Lives mostly in ${list(c.files.slice(0, 2))}.` : "",
        c.dependsOn.length ? `Depends on ${c.dependsOn.map((d) => d.name).join(", ")}.` : "",
        c.usedBy.length ? `Used by ${c.usedBy.map((d) => d.name).join(", ")}.` : "",
      ];
      return { communityId: c.id, title: c.name, summary: parts.filter(Boolean).join(" ") };
    }),
  };
}

/** Graph highlight for one tour stop: the hub in red, the rest of the community in amber. */
export function tourHighlight(c: CommunitySummary, engine: GraphEngine): Highlight {
  const h = emptyHighlight();
  if (engine.byId.has(c.hubId)) h.focus.add(c.hubId);
  for (const id of c.nodeIds) if (id !== c.hubId) h.depth.set(id, 1);
  return h;
}
