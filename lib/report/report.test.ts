import { describe, expect, it } from "vitest";
import { buildReport, decodeReport, encodeReport, radialLayout, type Report } from "./report";

const impactOutput = {
  target: { id: "db_connect", label: "connect()", kind: "function", file: "src/db.py" },
  total: 3,
  fileCount: 2,
  files: ["src/users.py", "src/api.py"],
  risk: "low",
  byDepth: { 1: 2, 2: 1 },
  affected: [
    { id: "users_get", label: ".get()", file: "src/users.py", depth: 1, via: "calls", dependsOn: "db_connect" },
    { id: "repo_save", label: "save()", file: "src/users.py", depth: 1, via: "calls", dependsOn: "db_connect" },
    { id: "api_handler", label: "handler()", file: "src/api.py", depth: 2, via: "calls", dependsOn: "users_get" },
  ],
};

const parts = [
  { type: "tool-searchNodes", state: "output-available", input: { query: "connect" }, output: [] },
  { type: "tool-analyzeImpact", state: "output-available", input: { node: "connect" }, output: impactOutput },
  { type: "text", text: "**Low risk.** Only two callers." },
];

describe("buildReport", () => {
  it("captures the question, answer text and the impact analysis", () => {
    const r = buildReport({ repo: "acme/api@dev", question: "What if I change connect?", parts, model: "m" });
    expect(r.repo).toBe("acme/api@dev");
    expect(r.question).toBe("What if I change connect?");
    expect(r.answer).toBe("**Low risk.** Only two callers.");
    expect(r.impact?.target.label).toBe("connect()");
    expect(r.impact?.risk).toBe("low");
    expect(r.impact?.affected).toHaveLength(3);
    expect(r.impact?.affected[2]).toEqual({ id: "api_handler", label: "handler()", file: "src/api.py", depth: 2, dependsOn: "users_get" });
  });

  it("works for answers without an impact analysis", () => {
    const r = buildReport({ repo: "a/b", question: "q", parts: [{ type: "text", text: "hi" }] });
    expect(r.impact).toBeUndefined();
    expect(r.answer).toBe("hi");
  });
});

describe("encode/decode", () => {
  it("round-trips a report through a URL-safe string", async () => {
    const r = buildReport({ repo: "acme/api", question: "q?", parts });
    const s = await encodeReport(r);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeReport(s)).toEqual(r);
  });

  it("compresses: a long answer produces a much shorter link", async () => {
    const r: Report = { ...buildReport({ repo: "a/b", question: "q", parts }), answer: "repeat ".repeat(2000) };
    expect((await encodeReport(r)).length).toBeLessThan(2000);
  });

  it("rejects garbage with a readable error", async () => {
    await expect(decodeReport("not-a-report")).rejects.toThrow(/report link/i);
  });
});

describe("radialLayout", () => {
  it("puts the target in the centre and each hop on a wider ring", () => {
    const r = buildReport({ repo: "a/b", question: "q", parts });
    const { nodes, edges } = radialLayout(r.impact!, 400);
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    const dist = (id: string) => Math.hypot(at(id).x - 200, at(id).y - 200);
    expect(at("db_connect")).toMatchObject({ x: 200, y: 200, depth: 0 });
    expect(dist("users_get")).toBeCloseTo(dist("repo_save"));
    expect(dist("api_handler")).toBeGreaterThan(dist("users_get"));
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(400);
    }
    expect(edges).toContainEqual({ from: "api_handler", to: "users_get" });
  });
});
