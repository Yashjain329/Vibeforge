import { describe, expect, it } from "vitest";
import { listBranches, parseRepo, repoRef } from "./branches";

describe("parseRepo", () => {
  it.each([
    ["owner/repo", { owner: "owner", repo: "repo", ref: undefined }],
    ["https://github.com/owner/repo.git", { owner: "owner", repo: "repo", ref: undefined }],
    ["github.com/o-1/my.repo/", { owner: "o-1", repo: "my.repo", ref: undefined }],
    ["https://github.com/owner/repo/tree/feature/x", { owner: "owner", repo: "repo", ref: "feature/x" }],
  ])("parses %s", (input, expected) => {
    expect(parseRepo(input)).toEqual(expected);
  });

  it.each(["", "nope", "https://gitlab.com/a/b", "a/b/c/d", "owner/.."])("rejects %s", (bad) => {
    expect(parseRepo(bad)).toBeNull();
  });
});

describe("repoRef", () => {
  it("builds the string the graph API accepts", () => {
    expect(repoRef("o", "r")).toBe("o/r");
    expect(repoRef("o", "r", "feature/x")).toBe("https://github.com/o/r/tree/feature/x");
  });
});

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const fn = async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(routes[key].body), { status: routes[key].status ?? 200 });
  };
  return { fn: fn as typeof fetch, calls };
}

describe("listBranches", () => {
  it("returns the default branch first, then the rest alphabetically", async () => {
    const { fn } = fakeFetch({
      "/repos/o/r/branches": { body: [{ name: "zeta" }, { name: "main", protected: true }, { name: "dev" }] },
      "/repos/o/r": { body: { default_branch: "main" } },
    });
    const r = await listBranches("o", "r", { fetch: fn });
    expect(r.defaultBranch).toBe("main");
    expect(r.branches.map((b) => b.name)).toEqual(["main", "dev", "zeta"]);
    expect(r.branches[0].protected).toBe(true);
  });

  it("sends the GitHub token when one is configured", async () => {
    let auth: string | null = null;
    const fn = (async (_u: string, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
    }) as unknown as typeof fetch;
    await listBranches("o", "r", { fetch: fn, token: "t0k" });
    expect(auth).toBe("Bearer t0k");
  });

  it("throws a readable error for a missing repo", async () => {
    const { fn } = fakeFetch({ "/repos/o/r": { status: 404, body: { message: "Not Found" } } });
    await expect(listBranches("o", "r", { fetch: fn })).rejects.toThrow(/not found/i);
  });

  it("explains GitHub rate limits", async () => {
    const { fn } = fakeFetch({ "/repos/o/r": { status: 403, body: { message: "API rate limit exceeded" } } });
    await expect(listBranches("o", "r", { fetch: fn })).rejects.toThrow(/rate limit/i);
  });
});
