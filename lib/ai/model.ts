import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

/** Free, tool-calling models; OpenRouter tries them in order when one is rate-limited. */
export const DEFAULT_OPENROUTER_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
];

export interface AiConfig {
  provider: "openrouter" | "gemini";
  apiKey: string;
  models: string[];
}

type Env = Record<string, string | undefined>;

const val = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Pick the AI provider from the environment: OpenRouter if configured, else Gemini, else null. */
export function resolveAiConfig(env: Env): AiConfig | null {
  // the key's name is matched case-insensitively: OPENROUTER_API_KEY, OpenRouter, Openrouter, …
  const orName = Object.keys(env).find((k) => /^openrouter(_api_key)?$/i.test(k) && val(env[k]));
  const or = orName ? val(env[orName]) : undefined;
  if (or) {
    const list = val(env.OPENROUTER_MODEL)?.split(",").map((s) => s.trim()).filter(Boolean);
    return { provider: "openrouter", apiKey: or, models: list?.length ? list : DEFAULT_OPENROUTER_MODELS };
  }
  const gem = val(env.Gemini) ?? val(env.GEMINI_API_KEY) ?? val(env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (gem) return { provider: "gemini", apiKey: gem, models: [val(env.GEMINI_MODEL) ?? "gemini-3.5-flash"] };
  return null;
}

export function createModel(c: AiConfig): LanguageModel {
  if (c.provider === "openrouter") {
    const openrouter = createOpenRouter({ apiKey: c.apiKey, appName: "CodeMind", appUrl: "https://codemind-henna.vercel.app" });
    const [primary, ...fallbacks] = c.models;
    return openrouter.chat(primary, fallbacks.length ? { models: c.models } : {});
  }
  return createGoogleGenerativeAI({ apiKey: c.apiKey })(c.models[0]);
}

/** Provider-specific knobs (Gemini: keep thinking short for latency). */
export function providerOptions(c: AiConfig) {
  return c.provider === "gemini" ? { google: { thinkingConfig: { thinkingLevel: "low" as const } } } : undefined;
}

export const NO_KEY_MESSAGE =
  "No AI API key configured. Set OPENROUTER_API_KEY (or `OpenRouter`, or the `Gemini` / GEMINI_API_KEY variable) on the server.";
