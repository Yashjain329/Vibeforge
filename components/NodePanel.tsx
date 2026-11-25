"use client";

import type { GraphEngine } from "@/lib/graph/engine";
import type { CMNode } from "@/lib/graph/types";

const KIND_LABEL: Record<CMNode["kind"], string> = {
  file: "File",
  class: "Class",
  function: "Function",
  doc: "Doc section",
  external: "External symbol",
  symbol: "Symbol",
};

export default function NodePanel({
  node,
  engine,
  onAsk,
  onSelect,
  onClose,
}: {
  node: CMNode;
  engine: GraphEngine;
  onAsk: (q: string) => void;
  onSelect: (n: CMNode) => void;
  onClose: () => void;
}) {
  const nb = engine.neighbors(node.id);
  const impact = engine.impact(node.id);
  const list = (xs: { node: CMNode; relation: string }[]) =>
    xs.slice(0, 6).map((x, i) => (
      <li key={x.node.id + i}>
        <button
          onClick={() => onSelect(x.node)}
          className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs text-paper/85 hover:bg-paper/10"
          title={x.node.file}
        >
          <span className="text-faded">{x.relation} </span>
          {x.node.label}
        </button>
      </li>
    ));

  return (
    <aside
      className="pointer-events-auto w-[min(340px,calc(100vw-2rem))] rounded-lg border border-paper/20 bg-ink/95 p-4 shadow-[0_12px_40px_rgba(4,18,33,0.6)] backdrop-blur"
      aria-label={`Details for ${node.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-faded">{KIND_LABEL[node.kind]}{node.communityName ? ` in ${node.communityName}` : ""}</p>
          <h3 className="mt-0.5 break-words font-mono text-[15px] font-medium text-paper">{node.label}</h3>
          {node.file && (
            <p className="mt-1 break-all font-mono text-xs text-faded">
              {node.file}
              {node.location ? `:${node.location.replace(/^L/, "")}` : ""}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close details" className="rounded px-1.5 text-lg leading-none text-faded hover:text-paper">
          ×
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-paper/5 py-1.5">
          <dt className="text-[11px] text-faded">Used by</dt>
          <dd className="font-display text-lg font-bold">{nb?.incoming.length ?? 0}</dd>
        </div>
        <div className="rounded bg-paper/5 py-1.5">
          <dt className="text-[11px] text-faded">Uses</dt>
          <dd className="font-display text-lg font-bold">{nb?.outgoing.length ?? 0}</dd>
        </div>
        <div className="rounded bg-signal/10 py-1.5">
          <dt className="text-[11px] text-[#FFD1CE]">Blast radius</dt>
          <dd className="font-display text-lg font-bold text-signal">{impact.affected.length}</dd>
        </div>
      </dl>

      {nb && nb.incoming.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-faded">Used by</p>
          <ul>{list(nb.incoming)}</ul>
        </div>
      )}
      {nb && nb.outgoing.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-faded">Uses</p>
          <ul>{list(nb.outgoing)}</ul>
        </div>
      )}

      <button
        onClick={() => onAsk(`What happens if I change \`${node.label}\`${node.file ? ` in ${node.file}` : ""}?`)}
        className="mt-4 w-full rounded-md bg-signal px-3 py-2 text-sm font-semibold text-ink hover:bg-[#ff7a74]"
      >
        Ask what breaks if this changes
      </button>
    </aside>
  );
}
