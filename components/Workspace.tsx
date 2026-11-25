"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useMemo, useState } from "react";
import { runGraphTool } from "@/lib/ai/graph-tools";
import { emptyHighlight, highlightFromToolOutputs, type Highlight } from "@/lib/ai/highlight";
import type { ChatContext } from "@/lib/ai/prompt";
import type { AnalyzeResult } from "@/lib/client/analyze";
import { GraphEngine } from "@/lib/graph/engine";
import type { CMNode } from "@/lib/graph/types";
import ChatPanel from "./ChatPanel";
import GraphView from "./GraphView";
import NodePanel from "./NodePanel";

function highlightOf(m: UIMessage): Highlight {
  return highlightFromToolOutputs(
    m.parts
      .filter(isToolUIPart)
      .filter((p) => p.state === "output-available")
      .map((p) => ({ tool: getToolName(p), output: p.output })),
  );
}

function Legend({ hasDocs, showDocs, setShowDocs }: { hasDocs: boolean; showDocs: boolean; setShowDocs: (v: boolean) => void }) {
  const items: [string, string][] = [
    ["#FF5E57", "Changed"],
    ["#FFB23F", "Direct dependent"],
    ["#FFCF73", "2 hops"],
    ["#FFE7A8", "3+ hops"],
  ];
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md bg-ink/85 px-3 py-2 text-xs text-paper/80 backdrop-blur">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: c }} aria-hidden />
          {l}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 bg-faded" aria-hidden />
        File
      </span>
      {hasDocs && (
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showDocs} onChange={(e) => setShowDocs(e.target.checked)} className="accent-[#FFB23F]" />
          Show docs
        </label>
      )}
    </div>
  );
}

export default function Workspace({ result, onReset }: { result: AnalyzeResult; onReset: () => void }) {
  const engine = useMemo(() => new GraphEngine(result.graph), [result]);
  const stats = useMemo(() => engine.stats(), [engine]);
  const [selected, setSelected] = useState<CMNode | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [pin, setPin] = useState<{ id: string; latest: string | undefined } | null>(null);
  const [tab, setTab] = useState<"graph" | "chat">("graph");

  // context and engine are fixed for the lifetime of a Workspace (it is keyed by repo)
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { context: { repo: result.repo, stats, report: result.report } satisfies ChatContext },
      }),
  );

  const { messages, sendMessage, status, error, regenerate, addToolOutput } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Gemini asks; the browser answers from the Graphify graph it already holds.
    onToolCall({ toolCall }) {
      const output = runGraphTool(engine, toolCall.toolName, (toolCall.input ?? {}) as Record<string, unknown>);
      void addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
    },
  });

  const lastWithGraph = [...messages].reverse().find((m) => m.role === "assistant" && highlightOf(m).focus.size > 0);
  // a pinned older answer stays shown until a newer graph-backed answer arrives
  const activeId = (pin && pin.latest === lastWithGraph?.id ? pin.id : lastWithGraph?.id) ?? null;
  const active = messages.find((m) => m.id === activeId);
  const highlight = useMemo(() => (active ? highlightOf(active) : emptyHighlight()), [active]);

  const ask = (text: string) => {
    setTab("chat");
    void sendMessage({ text });
  };

  const starters = useMemo(() => {
    const code = stats.hubs.filter((h) => {
      const k = engine.byId.get(h.id)?.kind;
      return k === "function" || k === "class";
    });
    const hub = code[0]?.label;
    const second = code[1]?.label;
    const out: string[] = [];
    if (hub) out.push(`What happens if I change \`${hub}\`?`);
    if (hub && second) out.push(`How is \`${hub}\` connected to \`${second}\`?`);
    out.push(...result.report.questions.filter((q) => q.length < 110).slice(0, 1));
    out.push("Which parts of this codebase are the riskiest to modify?");
    return [...new Set(out)].slice(0, 5);
  }, [stats, result.report, engine]);

  const hasDocs = useMemo(() => engine.graph.nodes.some((n) => n.kind === "doc"), [engine]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-paper/10 bg-ink px-4 py-2.5">
        <button onClick={onReset} className="font-display text-lg font-extrabold tracking-tight hover:text-ripple-2">
          CodeMind
        </button>
        <span className="min-w-0 truncate font-mono text-sm text-paper">{result.repo}</span>
        <dl className="hidden items-center gap-4 text-xs text-faded md:flex">
          <div className="flex gap-1"><dt>Files</dt><dd className="text-paper">{stats.files.toLocaleString()}</dd></div>
          <div className="flex gap-1"><dt>Nodes</dt><dd className="text-paper">{stats.nodes.toLocaleString()}</dd></div>
          <div className="flex gap-1"><dt>Edges</dt><dd className="text-paper">{stats.links.toLocaleString()}</dd></div>
          <div className="flex gap-1"><dt>Communities</dt><dd className="text-paper">{stats.communities}</dd></div>
        </dl>
        <button onClick={onReset} className="ml-auto rounded-md border border-paper/20 px-3 py-1 text-sm hover:border-ripple-1">
          Map another repo
        </button>
      </header>

      <div className="flex border-b border-paper/10 bg-ink md:hidden" role="tablist">
        {(["graph", "chat"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-signal text-paper" : "text-faded"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`blueprint relative min-w-0 flex-1 overflow-hidden ${tab === "graph" ? "block" : "hidden"} md:block`}>
          <GraphView
            engine={engine}
            highlight={highlight}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            showDocs={showDocs}
          />
          {result.truncated && (
            <p className="absolute left-3 top-3 rounded bg-ink/85 px-2.5 py-1 text-xs text-ripple-3">
              Large repo: showing the {stats.nodes.toLocaleString()} most important nodes.
            </p>
          )}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-start gap-2">
            {selected && (
              <NodePanel
                node={selected}
                engine={engine}
                onAsk={ask}
                onSelect={setSelected}
                onClose={() => setSelected(null)}
              />
            )}
            <Legend hasDocs={hasDocs} showDocs={showDocs} setShowDocs={setShowDocs} />
          </div>
        </div>

        <div className={`min-h-0 w-full border-l border-paper/10 md:block md:w-[420px] md:shrink-0 ${tab === "chat" ? "block" : "hidden"}`}>
          <ChatPanel
            messages={messages}
            status={status}
            error={error}
            starters={starters}
            onSend={ask}
            onRetry={() => void regenerate()}
            onShowMessage={(m) => {
              setPin({ id: m.id, latest: lastWithGraph?.id });
              setTab("graph");
            }}
            activeMessageId={activeId}
          />
        </div>
      </div>
    </div>
  );
}
