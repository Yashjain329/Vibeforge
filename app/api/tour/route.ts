import { generateText } from "ai";
import { createModel, providerOptions, resolveAiConfig } from "@/lib/ai/model";
import { fallbackTour, parseTour, type CommunitySummary } from "@/lib/tour/tour";

export const maxDuration = 60;

type Community = Omit<CommunitySummary, "nodeIds" | "hubId">;

function prompt(repo: string, communities: Community[]) {
  return [
    `You are giving a newcomer a guided tour of the codebase ${repo}.`,
    "Graphify clustered its code graph into these communities (JSON):",
    JSON.stringify(communities.map(({ id, name, size, keyNodes, files, dependsOn, usedBy }) => ({
      id, name, size, keyNodes, files,
      dependsOn: dependsOn.map((d) => d.name),
      usedBy: usedBy.map((d) => d.name),
    }))),
    "",
    "Write the tour as JSON only, no prose, in exactly this shape:",
    '{"intro":"1-2 sentences on what the system does overall","steps":[{"communityId":<id>,"title":"2-4 word human name for the area","summary":"2-3 sentences: what it does, its key pieces in `backticks`, and how it connects to other areas"}]}',
    "Include every community once, ordered so the story flows (entry points first, foundations last). Infer purpose from names and files; do not invent names that are not listed.",
  ].join("\n");
}

export async function POST(req: Request) {
  let body: { repo?: string; communities?: Community[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.communities) || body.communities.length === 0) {
    return Response.json({ error: "`communities` must be a non-empty array" }, { status: 400 });
  }
  const repo = String(body.repo ?? "this repository");
  const communities = body.communities.slice(0, 8) as CommunitySummary[];
  const fallback = () => Response.json({ source: "graph", tour: fallbackTour(repo, communities) });

  const ai = resolveAiConfig(process.env);
  if (!ai) return fallback();
  try {
    const { text } = await generateText({
      model: createModel(ai),
      prompt: prompt(repo, communities),
      providerOptions: providerOptions(ai),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(45_000),
    });
    const tour = parseTour(text, communities);
    return tour ? Response.json({ source: "ai", tour }) : fallback();
  } catch {
    return fallback();
  }
}
