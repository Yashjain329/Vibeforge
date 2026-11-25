import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { graphToolSchemas } from "@/lib/ai/graph-tools";
import { buildSystemPrompt, type ChatContext } from "@/lib/ai/prompt";

export const maxDuration = 120;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export async function POST(req: Request) {
  const apiKey = process.env.Gemini || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "No Gemini API key configured. Set the `Gemini` (or GEMINI_API_KEY) environment variable." },
      { status: 500 },
    );
  }

  let body: { messages?: UIMessage[]; context?: ChatContext };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "`messages` must be an array" }, { status: 400 });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  // Tools have no `execute`: the browser runs them against the Graphify graph it holds
  // and posts results back, so the (potentially multi-MB) graph never needs to be uploaded.
  const result = streamText({
    model: google(MODEL),
    system: buildSystemPrompt(body.context),
    messages: await convertToModelMessages(body.messages),
    tools: graphToolSchemas,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, onError: (e) => (e instanceof Error ? e.message : String(e)) }),
  });
}
