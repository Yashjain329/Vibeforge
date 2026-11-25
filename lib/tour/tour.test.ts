import { describe, expect, it } from "vitest";
import { GraphEngine, normalizeGraph } from "../graph/engine";
import { fallbackTour, parseTour, summarizeCommunities, tourHighlight } from "./tour";

const fn = (id: string, c: number, file: string) => ({ id, label: `${id}()`, source_file: file, community: c, community_name: `c${c}`, _callable: true });
const engine = new GraphEngine(
  normalizeGraph({
    nodes: [
      fn("a1", 0, "src/api.py"), fn("a2", 0, "src/api.py"), fn("a3", 0, "src/routes.py"), fn("a4", 0, "src/api.py"),
      fn("d1", 1, "src/db.py"), fn("d2", 1, "src/db.py"), fn("d3", 1, "src/db.py"),
      fn("x1", 2, "src/misc.py"), // tiny community: skipped
      { id: "doc", label: "Intro", file_type: "document", community: 0 },
    ],
    links: [
      { source: "a1", target: "a2", relation: "calls" }, { source: "a1", target: "a3", relation: "calls" },
      { source: "a1", target: "d1", relation: "calls" }, { source: "a2", target: "d1", relation: "calls" },
      { source: "d1", target: "d2", relation: "calls" },
    ],
  }),
);

describe("summarizeCommunities", () => {
  it("summarises the largest code communities with key nodes, files and links", () => {
    const s = summarizeCommunities(engine);
    expect(s.map((c) => c.id)).toEqual([0, 1]);
    const api = s[0];
    expect(api).toMatchObject({ name: "c0", size: 4 });
    expect(api.keyNodes[0]).toBe("a1()");
    expect(api.files[0]).toBe("src/api.py");
    expect(api.nodeIds).not.toContain("doc");
    expect(api.dependsOn).toEqual([{ id: 1, name: "c1", edges: 2 }]);
    expect(s[1].usedBy).toEqual([{ id: 0, name: "c0", edges: 2 }]);
  });

  it("respects the limit", () => {
    expect(summarizeCommunities(engine, 1)).toHaveLength(1);
  });
});

describe("parseTour", () => {
  const s = summarizeCommunities(engine);
  it("accepts JSON wrapped in prose or code fences, dropping unknown communities", () => {
    const text =
      'Here you go:\n```json\n{"intro":"Two layers.","steps":[{"communityId":0,"title":"HTTP API","summary":"Routes."},{"communityId":99,"title":"x","summary":"y"},{"communityId":1,"title":"Database","summary":"Storage."}]}\n```';
    expect(parseTour(text, s)).toEqual({
      intro: "Two layers.",
      steps: [
        { communityId: 0, title: "HTTP API", summary: "Routes." },
        { communityId: 1, title: "Database", summary: "Storage." },
      ],
    });
  });

  it("returns null for unusable output", () => {
    expect(parseTour("sorry, I can't", s)).toBeNull();
    expect(parseTour('{"intro":"x","steps":[]}', s)).toBeNull();
  });
});

describe("fallbackTour", () => {
  it("builds a readable tour from graph data alone", () => {
    const t = fallbackTour("acme/api", summarizeCommunities(engine));
    expect(t.steps).toHaveLength(2);
    expect(t.steps[0].title).toBe("c0");
    expect(t.steps[0].summary).toContain("a1()");
    expect(t.intro).toContain("acme/api");
  });
});

describe("tourHighlight", () => {
  it("focuses the key nodes and lights up the whole community", () => {
    const c = summarizeCommunities(engine)[1];
    const h = tourHighlight(c, engine);
    expect(h.focus.has("d1")).toBe(true);
    expect([...h.depth.keys()].sort()).toEqual(["d2", "d3"]);
  });
});
