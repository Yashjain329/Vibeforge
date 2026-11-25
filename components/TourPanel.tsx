"use client";

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { CommunitySummary, Tour } from "@/lib/tour/tour";

export default function TourPanel({
  tour,
  step,
  communities,
  source,
  pending,
  onStep,
  onEnd,
}: {
  tour: Tour;
  step: number;
  communities: CommunitySummary[];
  source: "ai" | "graph";
  pending: boolean;
  onStep: (i: number) => void;
  onEnd: () => void;
}) {
  const s = tour.steps[step];
  const c = communities.find((x) => x.id === s.communityId);
  const last = step === tour.steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" && !last) onStep(step + 1);
      if (e.key === "ArrowLeft" && step > 0) onStep(step - 1);
      if (e.key === "Escape") onEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, last, onStep, onEnd]);

  return (
    <aside
      className="pointer-events-auto w-[min(380px,calc(100vw-1.5rem))] rounded-lg border border-ripple-1/40 bg-ink/95 p-4 shadow-[0_12px_40px_rgba(4,18,33,0.6)] backdrop-blur"
      aria-label="Architecture tour"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-faded">
          Architecture tour: stop {step + 1} of {tour.steps.length}
        </p>
        <button onClick={onEnd} className="text-xs text-faded underline-offset-4 hover:text-paper hover:underline">
          End tour
        </button>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {tour.steps.map((_, i) => (
          <button
            key={i}
            tabIndex={-1}
            onClick={() => onStep(i)}
            className={`h-1 flex-1 rounded-full ${i === step ? "bg-ripple-1" : i < step ? "bg-ripple-1/40" : "bg-paper/15"}`}
          />
        ))}
      </div>
      {step === 0 && tour.intro && <p className="mt-3 text-sm leading-relaxed text-paper/75">{tour.intro}</p>}
      <h3 className="mt-3 font-display text-xl font-bold leading-tight">{s.title}</h3>
      <div className="answer mt-1 text-paper/90">
        <ReactMarkdown>{s.summary}</ReactMarkdown>
      </div>
      {c && (
        <p className="mt-2 text-xs text-faded">
          {c.size} pieces of code{c.files.length ? ` · ${c.files.slice(0, 2).join(", ")}` : ""}
        </p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onStep(step - 1)}
          disabled={step === 0}
          className="rounded-md border border-paper/25 px-3 py-1.5 text-sm hover:border-ripple-1 disabled:opacity-35"
        >
          Back
        </button>
        <button
          onClick={() => (last ? onEnd() : onStep(step + 1))}
          className="rounded-md bg-ripple-1 px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ripple-2"
        >
          {last ? "Finish" : "Next stop"}
        </button>
        <span className="ml-auto text-right text-[11px] text-faded">
          {pending ? (
            <span className="animate-pulse">AI narration on the way…</span>
          ) : source === "graph" ? (
            "Written from the graph structure"
          ) : (
            "Narrated by AI from the graph"
          )}
        </span>
      </div>
    </aside>
  );
}
