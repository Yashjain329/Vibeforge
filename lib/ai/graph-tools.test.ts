import { describe, expect, it } from "vitest";
import { GraphEngine, normalizeGraph } from "../graph/engine";
import { runGraphTool } from "./graph-tools";
import { highlightFromToolOutputs } from "./highlight";

const engine = new GraphEngine(
  normalizeGraph({
    nodes: [
      { id: "db_connect", label: "connect()", source_file: "src/db.py", _callable: true },
      { id: "users_get", label: ".get()", source_file: "src/users.py", _callable: true },
      { id: "api_handler", label: "handler()", source_file: "src/api.py", _callable: true },
    ],
    links: [
      { source: "users_get", target: "db_connect", relation: "calls" },
      { source: "api_handler", target: "users_get", relation: "calls" },
    ],
  }),
);

describe("runGraphTool", () => {
  it("analyzeImpact returns compact affected list with risk level", () => {
    const out = runGraphTool(engine, "analyzeImpact", { node: "connect" }) as {
      target: { id: string };
      affected: { id: string; depth: number }[];
      risk: string;
    };
    expect(out.target.id).toBe("db_connect");
    expect(out.affected).toEqual([
      expect.objectContaining({ id: "users_get", depth: 1 }),
      expect.objectContaining({ id: "api_handler", depth: 2 }),
    ]);
    expect(out.risk).toBe("low");
  });

  it("analyzeImpact caps the list but reports the true total", () => {
    const many = new GraphEngine(
      normalizeGraph({
        nodes: [{ id: "t", label: "t" }, ...Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, label: `n${i}` }))],
        links: Array.from({ length: 100 }, (_, i) => ({ source: `n${i}`, target: "t", relation: "calls" })),
      }),
    );
    const out = runGraphTool(many, "analyzeImpact", { node: "t" }) as { affected: unknown[]; total: number; risk: string };
    expect(out.affected.length).toBeLessThanOrEqual(40);
    expect(out.total).toBe(100);
    expect(out.risk).toBe("high");
  });

  it("returns an error object (not a throw) for unknown nodes", () => {
    const out = runGraphTool(engine, "analyzeImpact", { node: "zzz-not-here" }) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it("searchNodes, getNeighbors and findPath work", () => {
    expect((runGraphTool(engine, "searchNodes", { query: "handler" }) as { id: string }[])[0].id).toBe("api_handler");
    const nb = runGraphTool(engine, "getNeighbors", { node: ".get()" }) as { incoming: { id: string }[] };
    expect(nb.incoming[0].id).toBe("api_handler");
    expect(runGraphTool(engine, "findPath", { from: "handler", to: "connect" })).toEqual({
      path: ["api_handler", "users_get", "db_connect"],
      labels: ["handler()", ".get()", "connect()"],
    });
  });

  it("rejects unknown tools", () => {
    expect(runGraphTool(engine, "rm -rf", {})).toEqual({ error: "Unknown tool: rm -rf" });
  });
});

describe("highlightFromToolOutputs", () => {
  it("marks the impact target as focus and affected nodes by depth", () => {
    const out = runGraphTool(engine, "analyzeImpact", { node: "connect" });
    const h = highlightFromToolOutputs([{ tool: "analyzeImpact", output: out }]);
    expect([...h.focus]).toEqual(["db_connect"]);
    expect(h.depth.get("users_get")).toBe(1);
    expect(h.depth.get("api_handler")).toBe(2);
  });

  it("highlights paths and neighbor lookups, later outputs win", () => {
    const h = highlightFromToolOutputs([
      { tool: "analyzeImpact", output: runGraphTool(engine, "analyzeImpact", { node: "connect" }) },
      { tool: "findPath", output: runGraphTool(engine, "findPath", { from: "handler", to: "connect" }) },
    ]);
    expect(h.path).toEqual(["api_handler", "users_get", "db_connect"]);
    expect(h.focus.has("api_handler")).toBe(true);
  });

  it("is empty for error outputs", () => {
    const h = highlightFromToolOutputs([{ tool: "analyzeImpact", output: { error: "x" } }]);
    expect(h.focus.size).toBe(0);
  });
});
