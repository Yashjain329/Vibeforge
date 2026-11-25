"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeRepo, loadDemo, type AnalyzeResult } from "@/lib/client/analyze";
import Landing from "./Landing";
import Workspace from "./Workspace";

const STAGES = [
  { after: 0, text: "Downloading the repository from GitHub" },
  { after: 3, text: "Graphify is parsing every file into syntax trees" },
  { after: 9, text: "Linking calls, imports and inheritance into a graph" },
  { after: 16, text: "Clustering the graph into communities" },
  { after: 30, text: "Still working: large repositories take a minute" },
];

function Building({ repo, onCancel }: { repo: string; onCancel: () => void }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const current = [...STAGES].reverse().find((s) => secs >= s.after)!;
  return (
    <main className="blueprint flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-md" role="status" aria-live="polite">
        <p className="font-mono text-sm text-faded">{repo}</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Mapping the codebase</h1>
        <ol className="mt-6 flex flex-col gap-2.5">
          {STAGES.slice(0, 4).map((s) => {
            const done = secs >= s.after && s !== current;
            const now = s === current;
            return (
              <li key={s.text} className={`flex items-center gap-3 text-sm ${now ? "text-paper" : done ? "text-paper/60" : "text-faded/60"}`}>
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${now ? "animate-pulse bg-signal" : done ? "bg-ripple-1" : "bg-faded/40"}`}
                />
                {s.text}
              </li>
            );
          })}
        </ol>
        {secs >= 30 && <p className="mt-4 text-sm text-ripple-3">{STAGES[4].text}</p>}
        <div className="mt-8 flex items-center justify-between text-sm">
          <span className="tabular-nums text-faded">{secs}s</span>
          <button onClick={onCancel} className="text-faded underline underline-offset-4 hover:text-paper">
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

export default function CodeMindApp() {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = async (label: string, load: (signal: AbortSignal) => Promise<AnalyzeResult>) => {
    setError(null);
    setBuilding(label);
    abort.current = new AbortController();
    try {
      setResult(await load(abort.current.signal));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBuilding(null);
    }
  };

  if (building) return <Building repo={building} onCancel={() => abort.current?.abort()} />;
  if (result) return <Workspace key={result.repo} result={result} onReset={() => setResult(null)} />;
  return (
    <Landing
      error={error}
      onAnalyze={(repo) => run(repo, (signal) => analyzeRepo(repo, signal))}
      onDemo={(id) => run(id === "codemind" ? "CodeMind (this app)" : "Graphify-Labs/graphify", () => loadDemo(id))}
    />
  );
}
