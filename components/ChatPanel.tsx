"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Status = "submitted" | "streaming" | "ready" | "error";

const TOOL_VERB: Record<string, string> = {
  searchNodes: "Searched the graph",
  analyzeImpact: "Traced the blast radius",
  getNeighbors: "Looked up connections",
  findPath: "Found the path",
};

function toolSummary(tool: string, input: Record<string, unknown> | undefined, output: unknown): string {
  const o = output as Record<string, unknown> | unknown[] | undefined;
  const subject = String(input?.node ?? input?.query ?? (input?.from ? `${input.from} → ${input.to}` : ""));
  if (!o) return `${TOOL_VERB[tool] ?? tool}: ${subject}`;
  if (!Array.isArray(o) && o.error) return `No match for ${subject}`;
  if (tool === "analyzeImpact" && !Array.isArray(o)) return `${(o.target as { label: string }).label}: ${o.total} dependents, ${o.risk} risk`;
  if (tool === "findPath" && !Array.isArray(o)) return `${(o.path as string[]).length - 1} hops: ${subject}`;
  if (tool === "searchNodes" && Array.isArray(o)) return `${o.length} matches for “${subject}”`;
  if (tool === "getNeighbors" && !Array.isArray(o)) return `${subject}: ${o.incomingTotal} in, ${o.outgoingTotal} out`;
  return `${TOOL_VERB[tool] ?? tool}: ${subject}`;
}

/** render `backtick` spans in short strings as code */
function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-paper/[0.07] px-1 font-mono text-[0.85em] text-ripple-3">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function ChatPanel({
  messages,
  status,
  error,
  starters,
  onSend,
  onRetry,
  onShowMessage,
  activeMessageId,
}: {
  messages: UIMessage[];
  status: Status;
  error: Error | undefined;
  starters: string[];
  onSend: (text: string) => void;
  onRetry: () => void;
  onShowMessage: (m: UIMessage) => void;
  activeMessageId: string | null;
}) {
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setInput("");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-ink" aria-label="Chat with CodeMind">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="pt-2">
            <h2 className="font-display text-xl font-bold">Ask about a change</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-paper/70">
              Name a function, class or file. CodeMind traces what depends on it through the graph and explains the
              risk. Click any node on the graph to start from there.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-md border border-paper/15 bg-paper/[0.03] px-3 py-2 text-left text-sm text-paper/90 transition-colors hover:border-ripple-1 hover:text-paper"
                >
                  <InlineCode text={s} />
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="flex flex-col gap-5">
          {messages.map((m) => {
            if (m.role === "user") {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              return (
                <li key={m.id} className="ml-8 self-end rounded-lg rounded-br-sm bg-prussian px-3.5 py-2.5 text-[0.9375rem]">
                  <InlineCode text={text} />
                </li>
              );
            }
            const tools = m.parts.filter(isToolUIPart);
            const hasGraph = tools.some((p) => p.state === "output-available");
            return (
              <li key={m.id} className="min-w-0">
                {tools.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-1">
                    {tools.map((p) => {
                      const name = getToolName(p);
                      return (
                        <li key={p.toolCallId} className="flex items-center gap-2 text-xs text-faded">
                          <span
                            aria-hidden
                            className={`size-1.5 shrink-0 rounded-full ${p.state === "output-available" ? "bg-ripple-1" : "animate-pulse bg-faded"}`}
                          />
                          <span className="truncate">
                            {toolSummary(name, p.input as Record<string, unknown>, p.state === "output-available" ? p.output : undefined)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="answer text-paper/90">
                  {m.parts.map((p, i) =>
                    p.type === "text" ? (
                      <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                        {p.text}
                      </ReactMarkdown>
                    ) : null,
                  )}
                </div>
                {hasGraph && (
                  <button
                    onClick={() => onShowMessage(m)}
                    className={`mt-2 rounded px-2 py-1 text-xs transition-colors ${
                      activeMessageId === m.id ? "bg-ripple-1/15 text-ripple-2" : "text-faded hover:text-paper"
                    }`}
                  >
                    {activeMessageId === m.id ? "Shown on graph" : "Show on graph"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {status === "submitted" && <p className="mt-4 animate-pulse text-sm text-faded">Reading the graph…</p>}
        {error && (
          <div role="alert" className="mt-4 rounded-md border border-signal/50 bg-signal/10 p-3 text-sm text-[#FFD1CE]">
            <p>The AI didn&apos;t finish this answer: {error.message || "unknown error"}</p>
            <button onClick={onRetry} className="mt-2 font-semibold text-paper underline underline-offset-4">
              Try again
            </button>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="border-t border-paper/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Ask about the codebase
        </label>
        <div className="flex items-end gap-2 rounded-lg border border-paper/20 bg-ink-2 p-1.5 focus-within:border-ripple-1">
          <textarea
            id="ask"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            placeholder="What breaks if I change…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] text-paper placeholder:text-faded/70 focus:outline-none focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-9 rounded-md bg-signal px-4 text-sm font-semibold text-ink hover:bg-[#ff7a74] disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </form>
    </section>
  );
}
