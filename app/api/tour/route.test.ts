import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

const communities = [
  { id: 0, name: "api", size: 4, keyNodes: ["a1()"], files: ["src/api.py"], dependsOn: [], usedBy: [] },
  { id: 1, name: "db", size: 3, keyNodes: ["d1()"], files: ["src/db.py"], dependsOn: [], usedBy: [] },
];
const req = (body: unknown) => new Request("http://x/api/tour", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/tour", () => {
  it("rejects a body without communities", async () => {
    expect((await POST(req({ repo: "a/b" }))).status).toBe(400);
    expect((await POST(new Request("http://x", { method: "POST", body: "nope" }))).status).toBe(400);
  });

  it("returns a graph-only tour when no AI key is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("Gemini", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await POST(req({ repo: "a/b", communities }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("graph");
    expect(body.tour.steps.map((s: { communityId: number }) => s.communityId)).toEqual([0, 1]);
  });
});
