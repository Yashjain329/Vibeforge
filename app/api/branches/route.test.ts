import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/branches", () => {
  it("rejects a missing or invalid repo with 400", async () => {
    expect((await GET(new Request("http://x/api/branches"))).status).toBe(400);
    const res = await GET(new Request("http://x/api/branches?repo=not%20a%20repo"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/GitHub repository/i);
  });
});
