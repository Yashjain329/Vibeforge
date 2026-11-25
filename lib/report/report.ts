export interface ReportNode {
  id: string;
  label: string;
  file?: string;
  depth: number;
  dependsOn: string;
}

export interface ReportImpact {
  target: { id: string; label: string; kind?: string; file?: string };
  risk: "low" | "medium" | "high";
  total: number;
  fileCount: number;
  files: string[];
  affected: ReportNode[];
}

export interface Report {
  v: 1;
  repo: string;
  question: string;
  answer: string;
  createdAt: string;
  model?: string;
  impact?: ReportImpact;
}

type Part = { type: string; state?: string; text?: string; output?: unknown };

const MAX_NODES = 40;

/** Assemble a shareable report from one assistant message's parts. */
export function buildReport(args: { repo: string; question: string; parts: Part[]; model?: string }): Report {
  const answer = args.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n\n")
    .trim();
  const impactPart = [...args.parts]
    .reverse()
    .find((p) => p.type === "tool-analyzeImpact" && p.state === "output-available" && p.output && !("error" in (p.output as object)));
  let impact: ReportImpact | undefined;
  if (impactPart) {
    const o = impactPart.output as Record<string, unknown>;
    const t = o.target as ReportImpact["target"];
    impact = {
      target: { id: t.id, label: t.label, kind: t.kind, file: t.file },
      risk: o.risk as ReportImpact["risk"],
      total: Number(o.total ?? 0),
      fileCount: Number(o.fileCount ?? 0),
      files: ((o.files as string[]) ?? []).slice(0, 30),
      affected: ((o.affected as ReportNode[]) ?? []).slice(0, MAX_NODES).map((a) => ({
        id: a.id,
        label: a.label,
        file: a.file,
        depth: a.depth,
        dependsOn: a.dependsOn,
      })),
    };
  }
  return {
    v: 1,
    repo: args.repo,
    question: args.question,
    answer,
    createdAt: new Date().toISOString(),
    ...(args.model ? { model: args.model } : {}),
    ...(impact ? { impact } : {}),
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** gzip + base64url, so the whole report fits in a link's #fragment (never sent to a server). */
export async function encodeReport(r: Report): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(r));
  return toBase64Url(await pipe(json, new CompressionStream("gzip")));
}

export async function decodeReport(s: string): Promise<Report> {
  try {
    const json = await pipe(fromBase64Url(s), new DecompressionStream("gzip"));
    const r = JSON.parse(new TextDecoder().decode(json)) as Report;
    if (r.v !== 1 || typeof r.repo !== "string") throw new Error("bad version");
    return r;
  } catch {
    throw new Error("This report link is incomplete or damaged. Ask the sender to copy it again.");
  }
}

export interface LaidOutNode extends ReportNode {
  x: number;
  y: number;
}

/** Concentric rings by hop distance: the blast radius as a diagram. */
export function radialLayout(impact: ReportImpact, size: number) {
  const c = size / 2;
  const maxDepth = Math.max(1, ...impact.affected.map((a) => a.depth));
  const ringGap = (c - 28) / maxDepth;
  const nodes: LaidOutNode[] = [{ id: impact.target.id, label: impact.target.label, file: impact.target.file, depth: 0, dependsOn: "", x: c, y: c }];
  const angleOf = new Map<string, number>([[impact.target.id, 0]]);
  for (let d = 1; d <= maxDepth; d++) {
    // order each ring by its parent's angle so edges fan outward instead of crossing
    const ring = impact.affected
      .filter((a) => a.depth === d)
      .sort((a, b) => (angleOf.get(a.dependsOn) ?? 0) - (angleOf.get(b.dependsOn) ?? 0));
    const offset = d % 2 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / Math.max(ring.length, 1);
    ring.forEach((a, i) => {
      const angle = offset + (2 * Math.PI * i) / ring.length;
      angleOf.set(a.id, angle);
      nodes.push({ ...a, x: c + Math.cos(angle) * ringGap * d, y: c + Math.sin(angle) * ringGap * d });
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = impact.affected.filter((a) => ids.has(a.dependsOn)).map((a) => ({ from: a.id, to: a.dependsOn }));
  return { nodes, edges, rings: maxDepth, ringGap };
}
