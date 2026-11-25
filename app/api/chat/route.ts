import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { graphToolSchemas } from "@/lib/ai/graph-tools";
import { createModel, NO_KEY_MESSAGE, providerOptions, resolveAiConfig } from "@/lib/ai/model";
import { buildSystemPrompt, type ChatContext } from "@/lib/ai/prompt";

export const maxDuration = 120;

export async function POST(req: Request) {
  const ai = resolveAiConfig(process.env);
  if (!ai) return Response.json({ error: NO_KEY_MESSAGE }, { status: 500 });

  let body: { messages?: UIMessage[]; context?: ChatContext };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "`messages` must be an array" }, { status: 400 });
  }

  // Tools have no `execute`: the browser runs them against the Graphify graph it holds
  // and posts results back, so the (potentially multi-MB) graph never needs to be uploaded.
  const result = streamText({
    model: createModel(ai),
    system: buildSystemPrompt(body.context),
    messages: await convertToModelMessages(body.messages),
    tools: graphToolSchemas,
    providerOptions: providerOptions(ai),
    // a daily quota won't clear on retry; fail fast so the browser can answer from the graph
    maxRetries: 1,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, onError: (e) => (e instanceof Error ? e.message : String(e)) }),
  });
}

/** Which AI provider is configured: lets you check a deployment without spending a model request. */
export function GET() {
  const ai = resolveAiConfig(process.env);
  return Response.json({ provider: ai?.provider ?? null, models: ai?.models ?? [] });
}
