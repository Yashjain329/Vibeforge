"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { decodeReport, radialLayout, type Report, type ReportImpact } from "@/lib/report/report";

const RISK = {
  low: { label: "Low risk", color: "#7FD1A8" },
  medium: { label: "Medium risk", color: "#FFB23F" },
  high: { label: "High risk", color: "#FF5E57" },
} as const;
const RING = ["#FF5E57", "#FFB23F", "#FFCF73", "#FFE7A8", "#FFF3D6"];

function BlastDiagram({ impact }: { impact: ReportImpact }) {
  const size = 440;
  const { nodes, edges, rings, ringGap } = radialLayout(impact, size);
  const at = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg
      viewBox={`-70 -6 ${size + 140} ${size + 22}`}
      className="report-diagram mx-auto w-full max-w-[480px]"
      role="img"
      aria-label={`${impact.target.label} at the centre, with ${impact.total} dependents on rings by hop distance`}
    >
      {Array.from({ length: rings }, (_, i) => (
        <g key={i}>
          <circle cx={size / 2} cy={size / 2} r={ringGap * (i + 1)} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeDasharray="3 5" />
          <text x={size / 2 + ringGap * (i + 1) * 0.72 + 4} y={size / 2 - ringGap * (i + 1) * 0.72} fontSize={10} fill="currentColor" fillOpacity={0.5}>
            {i + 1} hop{i ? "s" : ""}
          </text>
        </g>
      ))}
      {edges.map((e, i) => {
        const a = at.get(e.from)!;
        const b = at.get(e.to)!;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#FFB23F" strokeOpacity={0.55} strokeWidth={1} />;
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.depth === 0 ? 9 : 5} fill={RING[Math.min(n.depth, RING.length - 1)]} stroke={n.depth === 0 ? "currentColor" : "none"} strokeWidth={1.5} />
          {(n.depth <= 1 || nodes.length <= 18) && (
            <text x={n.x} y={n.y + (n.depth === 0 ? 22 : 15)} textAnchor="middle" fontSize={n.depth === 0 ? 12 : 9.5} fontFamily="var(--font-plex-mono)" fill="currentColor">
              {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function ReportView() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("r");
    if (!raw) {
      Promise.resolve().then(() => setError("This link has no report in it. Open a report from CodeMind's chat with “Share report”."));
      return;
    }
    decodeReport(raw).then(setReport, (e: Error) => setError(e.message));
  }, []);

  if (error)
    return (
      <main className="blueprint flex min-h-full items-center justify-center px-4">
        <div className="max-w-md">
          <h1 className="font-display text-2xl font-bold">Report unavailable</h1>
          <p className="mt-2 text-paper/80">{error}</p>
          <Link href="/" className="mt-5 inline-block rounded-md bg-signal px-4 py-2 font-semibold text-ink">
            Open CodeMind
          </Link>
        </div>
      </main>
    );
  if (!report) return <main className="blueprint min-h-full" aria-busy="true" />;

  const { impact } = report;
  const risk = impact ? RISK[impact.risk] : null;
  const maxDepth = impact ? Math.max(0, ...impact.affected.map((a) => a.depth)) : 0;
  const date = new Date(report.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="report-page blueprint min-h-full px-4 py-8 sm:py-12">
      <article className="report-sheet mx-auto max-w-3xl rounded-xl border border-paper/15 bg-ink/90 p-5 shadow-[0_20px_60px_rgba(4,18,33,0.55)] sm:p-9">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-paper/15 pb-5">
          <div className="min-w-0">
            <p className="text-sm text-faded">Change impact report</p>
            <h1 className="mt-1 break-words font-mono text-xl text-paper">{report.repo}</h1>
            <p className="mt-1 text-xs text-faded">Generated {date} by CodeMind from a Graphify knowledge graph</p>
          </div>
          {risk && (
            <span className="rounded-full border px-3 py-1 text-sm font-semibold" style={{ color: risk.color, borderColor: risk.color }}>
              {risk.label}
            </span>
          )}
        </header>

        <section className="mt-6">
          <h2 className="text-sm text-faded">Question</h2>
          <p className="mt-1 font-display text-2xl font-bold leading-snug">{report.question}</p>
        </section>

        {impact && (
          <section className="mt-7 grid items-center gap-6 sm:grid-cols-[1.1fr_1fr]">
            <BlastDiagram impact={impact} />
            <dl className="grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded-lg bg-paper/5 p-3">
                <dt className="text-xs text-faded">Changed</dt>
                <dd className="mt-0.5 break-words font-mono text-[15px] text-[#FFD1CE]">{impact.target.label}</dd>
                {impact.target.file && <dd className="break-all font-mono text-xs text-faded">{impact.target.file}</dd>}
              </div>
              <div className="rounded-lg bg-paper/5 p-3">
                <dt className="text-xs text-faded">Dependents</dt>
                <dd className="font-display text-3xl font-bold">{impact.total}</dd>
              </div>
              <div className="rounded-lg bg-paper/5 p-3">
                <dt className="text-xs text-faded">Files affected</dt>
                <dd className="font-display text-3xl font-bold">{impact.fileCount}</dd>
              </div>
              <div className="col-span-2 rounded-lg bg-paper/5 p-3">
                <dt className="text-xs text-faded">Deepest ripple</dt>
                <dd className="font-display text-xl font-bold">
                  {maxDepth} hop{maxDepth === 1 ? "" : "s"} away
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-1 text-sm text-faded">Analysis</h2>
          <div className="answer text-paper/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.answer || "_No written analysis._"}</ReactMarkdown>
          </div>
        </section>

        {impact && impact.files.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm text-faded">Files to review</h2>
            <ul className="report-files grid gap-1 font-mono text-sm sm:grid-cols-2">
              {impact.files.map((f) => (
                <li key={f} className="break-all rounded bg-paper/5 px-2 py-1">
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="report-actions mt-9 flex flex-wrap gap-2 border-t border-paper/15 pt-5">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-ink hover:bg-[#ff7a74]"
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
          <button onClick={() => window.print()} className="rounded-md border border-paper/25 px-4 py-2 text-sm hover:border-ripple-1">
            Save as PDF
          </button>
          <Link href="/" className="rounded-md px-4 py-2 text-sm text-faded hover:text-paper">
            Open CodeMind
          </Link>
        </footer>
      </article>
    </main>
  );
}
