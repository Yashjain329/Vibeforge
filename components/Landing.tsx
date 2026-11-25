"use client";

import { useState } from "react";
import { DEMOS } from "@/lib/client/analyze";
import { useBranches } from "@/lib/client/useBranches";
import { parseRepo, repoRef } from "@/lib/github/branches";
import BranchSelect from "./BranchSelect";

/** A tiny static constellation with one ripple: the product's idea in one picture. */
function RippleMark() {
  const nodes: [number, number, number][] = [
    [160, 150, 0], [112, 118, 1], [214, 112, 1], [196, 204, 1], [64, 88, 2], [92, 196, 2],
    [262, 70, 2], [270, 166, 2], [250, 248, 3], [30, 150, 3], [150, 262, 3], [306, 112, 3],
  ];
  const edges = [[1, 0], [2, 0], [3, 0], [4, 1], [5, 1], [6, 2], [7, 2], [8, 3], [9, 4], [10, 5], [11, 6], [7, 11]];
  const fill = ["#FF5E57", "#FFB23F", "#FFCF73", "#FFE7A8"];
  return (
    <svg viewBox="0 0 340 300" className="w-full max-w-[420px]" role="img" aria-label="A changed function in red sends ripples to the code that depends on it">
      {[0, 1, 2].map((k) => (
        <circle
          key={k}
          cx={160}
          cy={150}
          r={150}
          fill="none"
          stroke="#FF5E57"
          strokeWidth={1}
          className="ripple-ring"
          style={{ animationDelay: `${k * 1.05}s` }}
        />
      ))}
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="#FFB23F" strokeOpacity={0.55} strokeWidth={1.2} />
      ))}
      {nodes.map(([x, y, d], i) => (
        <circle key={i} cx={x} cy={y} r={d === 0 ? 9 : 6 - d} fill={fill[d]} stroke={d === 0 ? "#E9F0F7" : "none"} strokeWidth={1.5} />
      ))}
      <text x={160} y={128} textAnchor="middle" fill="#FFD1CE" fontSize={12} fontFamily="var(--font-plex-mono)">connect()</text>
    </svg>
  );
}

export default function Landing({
  onAnalyze,
  onDemo,
  error,
}: {
  onAnalyze: (repo: string) => void;
  onDemo: (id: string) => void;
  error: string | null;
}) {
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState<string | undefined>(undefined);
  const branches = useBranches(repo);

  return (
    <main className="blueprint min-h-full">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <span className="font-display text-xl font-extrabold tracking-tight">CodeMind</span>
          <a
            href="https://github.com/Graphify-Labs/graphify"
            className="text-sm text-faded underline-offset-4 hover:text-paper hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Built on Graphify
          </a>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h1 className="font-display text-[clamp(2.4rem,5vw,4.25rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Change one thing.
              <br />
              See everything it touches.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-paper/80">
              CodeMind maps any GitHub repository into a knowledge graph with Graphify. Ask Gemini what happens if you
              change a module, and watch the impact ripple across the graph while the answer explains it.
            </p>

            <form
              className="mt-9 max-w-[36rem]"
              onSubmit={(e) => {
                e.preventDefault();
                const id = parseRepo(repo);
                if (!id) return onAnalyze(repo.trim());
                const def = branches.status === "ready" ? branches.list.defaultBranch : undefined;
                const ref = branch ?? id.ref;
                onAnalyze(repoRef(id.owner, id.repo, ref && ref !== def ? ref : undefined));
              }}
            >
              <label htmlFor="repo" className="mb-2 block text-sm text-faded">
                Public GitHub repository
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="repo"
                  value={repo}
                  onChange={(e) => {
                    setRepo(e.target.value);
                    setBranch(parseRepo(e.target.value)?.ref);
                  }}
                  placeholder="github.com/owner/repo"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-13 w-full rounded-md border sm:flex-1 border-paper/25 bg-ink/80 px-4 font-mono text-[15px] text-paper placeholder:text-faded/70 focus:border-ripple-1 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!repo.trim()}
                  className="h-13 rounded-md bg-signal px-6 font-semibold text-ink transition-colors hover:bg-[#ff7a74] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Map repository
                </button>
              </div>
              <div className="mt-2.5 min-h-8">
                <BranchSelect id="branch" state={branches} value={branch} onChange={setBranch} />
              </div>
              {error && (
                <p role="alert" className="mt-3 rounded-md border border-signal/50 bg-signal/10 px-3 py-2 text-sm text-[#FFD1CE]">
                  {error}
                </p>
              )}
            </form>

            <div className="mt-8 max-w-[36rem]">
              <p className="mb-3 text-sm text-faded">Or open a graph that&apos;s already built:</p>
              <div className="flex flex-wrap gap-2">
                {DEMOS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onDemo(d.id)}
                    className="group rounded-md border border-paper/20 bg-ink/50 px-3.5 py-2 text-left transition-colors hover:border-ripple-1"
                  >
                    <span className="block font-mono text-sm text-paper group-hover:text-ripple-2">{d.label}</span>
                    <span className="block text-xs text-faded">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <RippleMark />
          </div>
        </section>

        <section className="grid gap-8 border-t border-paper/15 py-10 text-sm sm:grid-cols-3">
          <div>
            <h2 className="font-display text-base font-bold">1. Map</h2>
            <p className="mt-1.5 leading-relaxed text-paper/70">
              Graphify reads every file with tree-sitter and links functions, classes, imports and docs into one graph.
            </p>
          </div>
          <div>
            <h2 className="font-display text-base font-bold">2. Ask</h2>
            <p className="mt-1.5 leading-relaxed text-paper/70">
              &ldquo;What breaks if I change the auth middleware?&rdquo; Gemini queries the graph instead of guessing.
            </p>
          </div>
          <div>
            <h2 className="font-display text-base font-bold">3. See</h2>
            <p className="mt-1.5 leading-relaxed text-paper/70">
              The changed code lights up red; everything depending on it glows amber, fading with distance.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
