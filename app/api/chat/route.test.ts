import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { buildSystemPrompt } from "@/lib/ai/prompt";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/chat", () => {
  it("returns a readable 500 when no AI key is configured", async () => {
    vi.stubEnv("Gemini", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ messages: [] }) }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/OPENROUTER_API_KEY/);
  });

  it("rejects a malformed body with 400", async () => {
    vi.stubEnv("Gemini", "k");
    const res = await POST(new Request("http://x/api/chat", { method: "POST", body: "nope" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/chat (status)", () => {
  it("reports the configured provider without exposing the key", async () => {
    vi.stubEnv("Openrouter", "secret-key");
    const body = await (await GET()).json();
    expect(body.provider).toBe("openrouter");
    expect(JSON.stringify(body)).not.toContain("secret-key");
  });
});

describe("buildSystemPrompt", () => {
  it("grounds the model in the repo's Graphify report", () => {
    const p = buildSystemPrompt({
      repo: "acme/api",
      stats: { nodes: 10, links: 20, files: 3, communities: 2, hubs: [{ id: "x", label: "UserService", degree: 9 }] },
      report: { godNodes: [{ label: "connect()", edges: 7 }], surprises: ["`a` --calls--> `b`"], questions: [] },
    });
    expect(p).toContain("acme/api");
    expect(p).toContain("UserService");
    expect(p).toContain("connect()");
    expect(p).toContain("analyzeImpact");
  });

  it("tells the model to report the risk level computed by the graph, not its own guess", () => {
    expect(buildSystemPrompt(undefined)).toMatch(/use the `risk` value returned by analyzeImpact/i);
  });

  it("works with no context", () => {
    expect(buildSystemPrompt(undefined)).toContain("CodeMind");
  });
});
