import { describe, expect, it } from "vitest";
import { GraphEngine, normalizeGraph } from "./engine";
import type { CMGraph } from "./types";

// Shape mirrors real Graphify output for:
//   src/db.py:    def connect()
//   src/users.py: class UserService; .get() calls connect()
//   src/api.py:   handler() calls UserService
const raw = {
  directed: true,
  nodes: [
    { id: "src_db", label: "db.py", source_file: "src/db.py", community: 0, community_name: "data" },
    { id: "src_db_connect", label: "connect()", source_file: "src/db.py", source_location: "L1", community: 0, community_name: "data", _callable: true },
    { id: "src_users", label: "users.py", source_file: "src/users.py", community: 0 },
    { id: "src_users_userservice", label: "UserService", source_file: "src/users.py", community: 1, _callable_class: true },
    { id: "src_users_userservice_get", label: ".get()", source_file: "src/users.py", community: 0, _callable: true },
    { id: "src_api", label: "api.py", source_file: "src/api.py", community: 1 },
    { id: "src_api_handler", label: "handler()", source_file: "src/api.py", community: 1, _callable: true },
  ],
  links: [
    { source: "src_users_userservice_get", target: "src_db_connect", relation: "calls" },
    { source: "src_api_handler", target: "src_users_userservice", relation: "calls" },
    { source: "src_users_userservice", target: "src_users_userservice_get", relation: "method" },
    { source: "src_users", target: "src_db", relation: "imports_from" },
    { source: "src_api", target: "src_users", relation: "imports_from" },
    { source: "src_db", target: "src_db_connect", relation: "contains" },
  ],
};

const sample = (): CMGraph => normalizeGraph(raw);

describe("normalizeGraph", () => {
  it("maps graphify fields onto CodeMind nodes", () => {
    const g = sample();
    const n = g.nodes.find((x) => x.id === "src_db_connect")!;
    expect(n.file).toBe("src/db.py");
    expect(n.location).toBe("L1");
    expect(n.communityName).toBe("data");
    expect(n.kind).toBe("function");
    expect(g.nodes.find((x) => x.id === "src_db")!.kind).toBe("file");
    expect(g.nodes.find((x) => x.id === "src_users_userservice")!.kind).toBe("class");
    expect(g.links).toHaveLength(6);
  });

  it("drops links that point at unknown nodes and accepts `edges`", () => {
    const g = normalizeGraph({
      nodes: [{ id: "a", label: "a" }],
      edges: [{ source: "a", target: "ghost", relation: "calls" }],
    });
    expect(g.links).toHaveLength(0);
  });

  it("throws a readable error on garbage", () => {
    expect(() => normalizeGraph(null)).toThrow(/graph/i);
  });
});

describe("GraphEngine.search", () => {
  it("ranks an exact label match first", () => {
    const e = new GraphEngine(sample());
    expect(e.search("connect")[0].id).toBe("src_db_connect");
    expect(e.search("UserService")[0].id).toBe("src_users_userservice");
  });

  it("matches on file path", () => {
    const e = new GraphEngine(sample());
    expect(e.search("src/api.py").map((n) => n.id)).toContain("src_api");
  });
});

describe("GraphEngine.impact", () => {
  it("walks dependents in reverse with depth", () => {
    const e = new GraphEngine(sample());
    const r = e.impact("connect()");
    expect(r.found).toBe(true);
    expect(r.target!.id).toBe("src_db_connect");
    const depth = Object.fromEntries(r.affected.map((a) => [a.node.id, a.depth]));
    expect(depth["src_users_userservice_get"]).toBe(1);
    expect(depth["src_users_userservice"]).toBe(2);
    expect(depth["src_api_handler"]).toBe(3);
    expect(r.files).toEqual(expect.arrayContaining(["src/users.py", "src/api.py"]));
  });

  it("ignores structural `contains` edges so a file doesn't count as a dependent", () => {
    const e = new GraphEngine(sample());
    const r = e.impact("connect()");
    expect(r.affected.map((a) => a.node.id)).not.toContain("src_db");
  });

  it("respects maxDepth", () => {
    const e = new GraphEngine(sample());
    const r = e.impact("connect()", 1);
    expect(r.affected.map((a) => a.node.id)).toEqual(["src_users_userservice_get"]);
  });

  it("terminates on cycles and keeps the minimum depth", () => {
    const e = new GraphEngine(
      normalizeGraph({
        nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }, { id: "c", label: "c" }],
        links: [
          { source: "b", target: "a", relation: "imports" },
          { source: "a", target: "b", relation: "imports" },
          { source: "c", target: "a", relation: "calls" },
          { source: "c", target: "b", relation: "calls" },
        ],
      }),
    );
    const r = e.impact("a");
    const depth = Object.fromEntries(r.affected.map((x) => [x.node.id, x.depth]));
    expect(depth).toEqual({ b: 1, c: 1 });
  });

  it("returns suggestions instead of throwing for unknown names", () => {
    const e = new GraphEngine(sample());
    const r = e.impact("conect");
    expect(r.found).toBe(false);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });
});

describe("GraphEngine.neighbors / path / stats", () => {
  it("lists incoming and outgoing edges", () => {
    const e = new GraphEngine(sample());
    const n = e.neighbors("UserService")!;
    expect(n.incoming.map((x) => x.node.id)).toContain("src_api_handler");
    expect(n.outgoing.map((x) => x.node.id)).toContain("src_users_userservice_get");
  });

  it("finds a shortest path ignoring direction", () => {
    const e = new GraphEngine(sample());
    expect(e.path("handler()", "connect()")).toEqual([
      "src_api_handler",
      "src_users_userservice",
      "src_users_userservice_get",
      "src_db_connect",
    ]);
    expect(e.path("handler()", "nope-nothing")).toBeNull();
  });

  it("reports stats including top hubs", () => {
    const s = new GraphEngine(sample()).stats();
    expect(s.nodes).toBe(7);
    expect(s.links).toBe(6);
    expect(s.files).toBe(3);
    expect(s.communities).toBe(2);
    expect(s.hubs.map((h) => h.id)).toContain("src_users_userservice");
    expect(s.hubs[0].degree).toBeGreaterThanOrEqual(s.hubs[s.hubs.length - 1].degree);
  });
});
