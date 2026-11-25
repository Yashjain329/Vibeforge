import { describe, expect, it } from "vitest";
import { DEFAULT_OPENROUTER_MODELS, resolveAiConfig } from "./model";

describe("resolveAiConfig", () => {
  it("prefers OpenRouter when its key is set, with free-model fallbacks", () => {
    const c = resolveAiConfig({ OPENROUTER_API_KEY: "or", Gemini: "g" });
    expect(c).toEqual({ provider: "openrouter", apiKey: "or", models: DEFAULT_OPENROUTER_MODELS });
    expect(DEFAULT_OPENROUTER_MODELS[0]).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(DEFAULT_OPENROUTER_MODELS.length).toBeGreaterThan(1);
  });

  it("also accepts the key under the variable name `OpenRouter`", () => {
    expect(resolveAiConfig({ OpenRouter: "or2", Gemini: "g" })).toMatchObject({ provider: "openrouter", apiKey: "or2" });
  });

  it("reads a comma-separated OPENROUTER_MODEL list (first = primary)", () => {
    const c = resolveAiConfig({ OPENROUTER_API_KEY: "or", OPENROUTER_MODEL: " a/b , c/d " });
    expect(c).toMatchObject({ provider: "openrouter", models: ["a/b", "c/d"] });
  });

  it("falls back to Gemini when only a Gemini key exists", () => {
    expect(resolveAiConfig({ Gemini: "g", GEMINI_MODEL: "gemini-x" })).toEqual({
      provider: "gemini",
      apiKey: "g",
      models: ["gemini-x"],
    });
    expect(resolveAiConfig({ GEMINI_API_KEY: "g2" })).toMatchObject({ provider: "gemini", apiKey: "g2" });
  });

  it("returns null when no key is configured (ignoring blank values)", () => {
    expect(resolveAiConfig({ OPENROUTER_API_KEY: "  ", Gemini: "" })).toBeNull();
  });
});
