import { describe, expect, it } from "vitest";
import { GraphEngine, normalizeGraph } from "../graph/engine";
import { candidateNames, graphOnlyAnswer, isAiUnavailable } from "./graph-answer";

const engine = new GraphEngine(
  normalizeGraph({
    nodes: [
      { id: "db_connect", label: "connect()", source_file: "src/db.py", _callable: true },
      { id: "users_get", label: ".get()", source_file: "src/users.py", _callable: true },
      { id: "api_handler", label: "handler()", source_file: "src/api.py", _callable: true },
      { id: "svc", label: "UserService", source_file: "src/users.py", _callable_class: true },
    ],
    links: [
      { source: "users_get", target: "db_connect", relation: "calls" },
      { source: "api_handler", target: "users_get", relation: "calls" },
      { source: "svc", target: "users_get", relation: "method" },
    ],
  }),
);

describe("candidateNames", () => {
  it("prefers backticked names, then code-looking words", () => {
    expect(candidateNames("What happens if I change `connect()` in src/db.py?")[0]).toBe("connect()");
    expect(candidateNames("what breaks if I change UserService")).toContain("UserService");
    expect(candidateNames("If I change parse_repo, what breaks?")).toContain("parse_repo");
  });
});

describe("graphOnlyAnswer", () => {
  it("runs the impact analysis and writes a grounded answer", () => {
    const a = graphOnlyAnswer(engine, "What happens if I change connect()?");
    expect(a.tool?.name).toBe("analyzeImpact");
    expect((a.tool?.output as { target: { id: string } }).target.id).toBe("db_connect");
    expect(a.text).toMatch(/low risk/i);
    expect(a.text).toContain("`.get()`");
    expect(a.text).toContain("src/users.py");
    expect(a.text).toMatch(/from the graph/i);
  });

  it("matches camelCase questions to snake_case code (parseRepo → parse_repo())", () => {
    const e = new GraphEngine(normalizeGraph({
      nodes: [{ id: "pr", label: "parse_repo()", source_file: "api/x.py", _callable: true }, { id: "an", label: "analyze()", source_file: "api/x.py", _callable: true }],
      links: [{ source: "an", target: "pr", relation: "calls" }],
    }));
    expect((graphOnlyAnswer(e, "What happens if I change parseRepo?").tool?.output as { target: { id: string } }).target.id).toBe("pr");
  });

  it("asks for a name when nothing in the question matches the graph", () => {
    const a = graphOnlyAnswer(engine, "how is the weather today");
    expect(a.tool).toBeUndefined();
    expect(a.text).toMatch(/name a function, class or file/i);
  });
});

describe("isAiUnavailable", () => {
  it("recognises quota, rate-limit, key and provider errors", () => {
    expect(isAiUnavailable("Rate limit exceeded: free-models-per-day")).toBe(true);
    expect(isAiUnavailable("No AI API key configured")).toBe(true);
    expect(isAiUnavailable("Failed after 3 attempts. Last error: 429")).toBe(true);
    expect(isAiUnavailable("quota exceeded for this model")).toBe(true);
    expect(isAiUnavailable("User not found.")).toBe(true);
    expect(isAiUnavailable("some brand-new provider error")).toBe(true);
    expect(isAiUnavailable("Request body must be JSON")).toBe(false);
    expect(isAiUnavailable("`messages` must be an array")).toBe(false);
  });
});
