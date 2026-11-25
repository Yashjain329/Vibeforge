import type { GraphEngine } from "../graph/engine";
import type { CMNode } from "../graph/types";
import { runGraphTool } from "./graph-tools";

/**
 * When the AI is unavailable (quota, rate limit, no key), CodeMind still answers
 * change-impact questions straight from the Graphify graph.
 */

const CODEY = /`([^`]+)`|([A-Za-z_][\w.]*\(\))|(\b[a-z0-9]+_[a-z0-9_]+\b)|(\b[A-Z][a-z0-9]+[A-Z]\w*\b)|(\b[\w-]+\/[\w./-]+\.\w+\b)|(\b\w+\.\w{1,4}\b)/g;
const STOP = new Set(
  "what when where which while would could should happens happen change changes changed break breaks broken modify module function class file this that with from into does there their about affect affected safe risky risk code".split(" "),
);

/** Names in a question that might be graph nodes, most specific first. */
export function candidateNames(question: string): string[] {
  const out: string[] = [];
  for (const m of question.matchAll(CODEY)) out.push((m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6]).trim());
  for (const w of question.split(/[^A-Za-z0-9_]+/)) if (w.length >= 4 && !STOP.has(w.toLowerCase())) out.push(w);
  return [...new Set(out.filter(Boolean))];
}

const norm = (s: string) => s.toLowerCase().replace(/\(\)$/, "").replace(/^\./, "");
/** case- and separator-blind key, so parseRepo, parse_repo and parse-repo() all match */
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function resolve(engine: GraphEngine, question: string): CMNode | undefined {
  const codey = new Set([...question.matchAll(CODEY)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6]).trim()));
  for (const c of candidateNames(question)) {
    const key = loose(c);
    const same = key.length >= 3 && engine.graph.nodes.find((n) => n.kind !== "external" && loose(n.label) === key);
    if (same) return same;
    const hit = engine.search(c, 1)[0];
    if (!hit) continue;
    // plain words must match a node's name exactly; code-looking names may match fuzzily
    if (codey.has(c) || norm(hit.label) === norm(c) || hit.file?.endsWith(c)) return hit;
  }
  return undefined;
}

export interface GraphAnswer {
  text: string;
  tool?: { name: "analyzeImpact"; input: { node: string }; output: unknown };
}

type Impact = {
  target: { label: string; file?: string };
  total: number;
  risk: "low" | "medium" | "high";
  fileCount: number;
  files: string[];
  byDepth: Record<number, number>;
  affected: { label: string; file?: string; depth: number; via: string }[];
};

const NOTE = "_Answered from the graph alone: the AI is unavailable right now, so this is the raw impact analysis without the AI’s write-up._";

export function graphOnlyAnswer(engine: GraphEngine, question: string): GraphAnswer {
  const node = resolve(engine, question);
  if (!node) {
    return {
      text: `The AI is unavailable right now, and I couldn’t find a node in the graph matching your question. Name a function, class or file exactly, for example \`${engine.stats().hubs[0]?.label ?? "main()"}\`, or click a node on the graph and choose “Ask what breaks if this changes”.`,
    };
  }
  const output = runGraphTool(engine, "analyzeImpact", { node: node.id });
  const o = output as Impact;
  const risk = { low: "Low", medium: "Medium", high: "High" }[o.risk];
  const direct = o.affected.filter((a) => a.depth === 1);
  const lines = [
    `**${risk} risk.** \`${o.target.label}\`${o.target.file ? ` (${o.target.file})` : ""} has ${o.total} dependent${o.total === 1 ? "" : "s"} across ${o.fileCount} other file${o.fileCount === 1 ? "" : "s"}.`,
  ];
  if (direct.length) {
    lines.push("", "**Direct dependents**");
    for (const a of direct.slice(0, 8)) lines.push(`- \`${a.label}\`${a.file ? ` in ${a.file}` : ""} (${a.via})`);
    if (direct.length > 8) lines.push(`- …and ${direct.length - 8} more`);
  } else {
    lines.push("", "Nothing in the graph depends on it, so a change should stay local.");
  }
  const deeper = Object.entries(o.byDepth).filter(([d]) => Number(d) > 1);
  if (deeper.length) {
    lines.push("", "**Ripple effects**");
    for (const [d, n] of deeper) lines.push(`- ${n} more at ${d} hops`);
  }
  if (o.files.length) {
    lines.push("", "**What to check**", `- Review and test: ${o.files.slice(0, 6).map((f) => `\`${f}\``).join(", ")}${o.files.length > 6 ? ", …" : ""}`);
  }
  lines.push("", NOTE);
  return { text: lines.join("\n"), tool: { name: "analyzeImpact", input: { node: node.label }, output } };
}

/**
 * Any failure to get an answer from the model (quota, rate limit, bad key, provider outage, a new error we have never
 * seen) means "answer from the graph instead". Only CodeMind's own request-validation errors are real bugs.
 */
export function isAiUnavailable(message: string): boolean {
  return !/Request body must be JSON|`messages` must be an array/.test(message);
}
