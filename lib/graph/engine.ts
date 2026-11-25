import type {
  AffectedNode,
  CMGraph,
  CMLink,
  CMNode,
  GraphStats,
  ImpactResult,
  Neighbor,
  NodeKind,
} from "./types";

/** Edges that describe structure/annotation, not a runtime or build dependency. */
const NON_DEPENDENCY = new Set(["contains", "rationale_for", "cites"]);

type RawNode = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function kindOf(n: RawNode): NodeKind {
  const label = str(n.label) ?? "";
  const file = str(n.source_file);
  if (n.file_type === "document") return "doc";
  if (n.type === "external" || n.file_type === "concept") return "external";
  if (n._callable_class) return "class";
  if (n._callable) return "function";
  if (file && file.split("/").pop() === label) return "file";
  return "symbol";
}

/** Convert Graphify's networkx node-link JSON into CodeMind's compact graph. */
export function normalizeGraph(raw: unknown): CMGraph {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as RawNode).nodes)) {
    throw new Error("Invalid graph: expected an object with a `nodes` array");
  }
  const r = raw as { nodes: RawNode[]; links?: RawNode[]; edges?: RawNode[] };
  const nodes: CMNode[] = [];
  const ids = new Set<string>();
  for (const n of r.nodes) {
    const id = str(n.id);
    if (!id || ids.has(id) || n.file_type === "rationale") continue;
    ids.add(id);
    nodes.push({
      id,
      label: str(n.label) ?? id,
      kind: (str(n.kind) as NodeKind | undefined) ?? kindOf(n),
      file: str(n.file) ?? str(n.source_file),
      location: str(n.location) ?? str(n.source_location),
      community: typeof n.community === "number" ? n.community : undefined,
      communityName: str(n.communityName) ?? str(n.community_name),
    });
  }
  const links: CMLink[] = [];
  for (const l of r.links ?? r.edges ?? []) {
    const source = typeof l.source === "object" ? str((l.source as RawNode)?.id) : str(l.source);
    const target = typeof l.target === "object" ? str((l.target as RawNode)?.id) : str(l.target);
    if (!source || !target || !ids.has(source) || !ids.has(target)) continue;
    links.push({ source, target, relation: str(l.relation) ?? "related" });
  }
  return { nodes, links };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\(\)$/, "").replace(/^\./, "");
}

/** Cheap edit distance for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export class GraphEngine {
  readonly byId = new Map<string, CMNode>();
  private out = new Map<string, Neighbor[]>();
  private inc = new Map<string, Neighbor[]>();

  constructor(readonly graph: CMGraph) {
    for (const n of graph.nodes) {
      this.byId.set(n.id, n);
      this.out.set(n.id, []);
      this.inc.set(n.id, []);
    }
    for (const l of graph.links) {
      const s = this.byId.get(l.source);
      const t = this.byId.get(l.target);
      if (!s || !t) continue;
      this.out.get(s.id)!.push({ node: t, relation: l.relation });
      this.inc.get(t.id)!.push({ node: s, relation: l.relation });
    }
  }

  private score(n: CMNode, q: string): number {
    const nq = norm(q);
    const label = norm(n.label);
    if (n.id === q || n.label === q) return 100;
    if (label === nq) return 90 - (n.kind === "external" ? 20 : 0);
    if (n.file && (n.file === q || n.file.endsWith("/" + q))) return 80;
    if (label.startsWith(nq)) return 60;
    if (label.includes(nq)) return 45;
    if (n.id.toLowerCase().includes(nq.replace(/[^a-z0-9]+/g, "_"))) return 35;
    if (n.file?.toLowerCase().includes(nq)) return 25;
    return 0;
  }

  search(q: string, limit = 8): CMNode[] {
    const query = q.trim();
    if (!query) return [];
    return this.graph.nodes
      .map((n) => ({ n, s: this.score(n, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || this.degree(b.n.id) - this.degree(a.n.id))
      .slice(0, limit)
      .map((x) => x.n);
  }

  /** Best single match, or undefined. */
  resolve(q: string): CMNode | undefined {
    return this.byId.get(q) ?? this.search(q, 1)[0];
  }

  suggest(q: string, limit = 5): CMNode[] {
    const nq = norm(q);
    return this.graph.nodes
      .map((n) => ({ n, d: distance(norm(n.label), nq) }))
      .filter((x) => x.d <= 3)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map((x) => x.n);
  }

  degree(id: string): number {
    return (this.out.get(id)?.length ?? 0) + (this.inc.get(id)?.length ?? 0);
  }

  /** Everything that (transitively) depends on `q`: reverse BFS over dependency edges. */
  impact(q: string, maxDepth = 4): ImpactResult {
    const target = this.resolve(q);
    if (!target) return { found: false, affected: [], files: [], suggestions: this.suggest(q) };
    const seen = new Set([target.id]);
    const affected: AffectedNode[] = [];
    let frontier = [target.id];
    for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const { node, relation } of this.inc.get(id) ?? []) {
          if (NON_DEPENDENCY.has(relation) || seen.has(node.id)) continue;
          seen.add(node.id);
          affected.push({ node, depth, via: relation, dependsOn: id });
          next.push(node.id);
        }
      }
      frontier = next;
    }
    const files = [
      ...new Set(affected.map((a) => a.node.file).filter((f): f is string => !!f && f !== target.file)),
    ];
    return { found: true, target, affected, files, suggestions: [] };
  }

  neighbors(q: string): { node: CMNode; incoming: Neighbor[]; outgoing: Neighbor[] } | null {
    const node = this.resolve(q);
    if (!node) return null;
    return { node, incoming: this.inc.get(node.id)!, outgoing: this.out.get(node.id)! };
  }

  /** Shortest path between two nodes, ignoring edge direction. */
  path(a: string, b: string): string[] | null {
    const from = this.resolve(a);
    const to = this.resolve(b);
    if (!from || !to) return null;
    const prev = new Map<string, string | null>([[from.id, null]]);
    const queue = [from.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === to.id) break;
      for (const { node } of [...this.out.get(id)!, ...this.inc.get(id)!]) {
        if (prev.has(node.id)) continue;
        prev.set(node.id, id);
        queue.push(node.id);
      }
    }
    if (!prev.has(to.id)) return null;
    const out: string[] = [];
    for (let cur: string | null = to.id; cur; cur = prev.get(cur) ?? null) out.unshift(cur);
    return out;
  }

  stats(): GraphStats {
    const hubs = this.graph.nodes
      .filter((n) => n.kind !== "file" && n.kind !== "external")
      .map((n) => ({ id: n.id, label: n.label, degree: this.degree(n.id) }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 8);
    return {
      nodes: this.graph.nodes.length,
      links: this.graph.links.length,
      files: new Set(this.graph.nodes.map((n) => n.file).filter(Boolean)).size,
      communities: new Set(this.graph.nodes.map((n) => n.community).filter((c) => c !== undefined)).size,
      hubs,
    };
  }
}
