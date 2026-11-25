import { describe, expect, it } from "vitest";
import { forModel, isGraphAnswer } from "./history";

const user = (id: string, text: string) => ({ id, role: "user" as const, parts: [{ type: "text" as const, text }] });
const ai = (id: string, text: string) => ({ id, role: "assistant" as const, parts: [{ type: "text" as const, text }] });

describe("forModel", () => {
  it("keeps the conversation but drops graph-only answers, so the AI is asked fresh once it is back", () => {
    const msgs = [user("1", "q1"), ai("a1", "AI answer"), user("2", "q2"), ai("graph-123", "graph answer"), user("3", "q3")];
    expect(forModel(msgs).map((m) => m.id)).toEqual(["1", "a1", "2", "3"]);
  });

  it("isGraphAnswer recognises fallback messages by id", () => {
    expect(isGraphAnswer({ id: "graph-9" })).toBe(true);
    expect(isGraphAnswer({ id: "abc" })).toBe(false);
  });
});
