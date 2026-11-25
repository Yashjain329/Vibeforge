import { listBranches, parseRepo } from "@/lib/github/branches";

export async function GET(req: Request) {
  const input = new URL(req.url).searchParams.get("repo") ?? "";
  const id = parseRepo(input);
  if (!id) return Response.json({ error: "Enter a GitHub repository like owner/repo" }, { status: 400 });
  try {
    const list = await listBranches(id.owner, id.repo, { token: process.env.GITHUB_TOKEN });
    return Response.json(list, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg }, { status: /not found/i.test(msg) ? 404 : 502 });
  }
}
