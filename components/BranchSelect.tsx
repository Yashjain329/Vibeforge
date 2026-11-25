"use client";

import type { BranchState } from "@/lib/client/useBranches";

/** Compact branch dropdown. Renders nothing until branches are known. */
export default function BranchSelect({
  state,
  value,
  onChange,
  id,
  compact = false,
}: {
  state: BranchState;
  value: string | undefined;
  onChange: (branch: string) => void;
  id: string;
  compact?: boolean;
}) {
  if (state.status === "loading")
    return <span className={`text-faded ${compact ? "text-xs" : "text-sm"}`}>Loading branches…</span>;
  if (state.status === "error")
    return compact ? (
      <span className="text-xs text-faded" title={state.error}>
        Branches unavailable
      </span>
    ) : (
      <span className="text-sm text-[#FFD1CE]">{state.error}</span>
    );
  if (state.status !== "ready") return null;
  const { list } = state;
  const current = value ?? list.defaultBranch;
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className={`text-faded ${compact ? "text-xs" : "text-sm"}`}>
        Branch
      </label>
      <select
        id={id}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-[16rem] truncate rounded-md border border-paper/25 bg-ink font-mono text-paper focus:border-ripple-1 focus:outline-none ${
          compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-1.5 text-sm"
        }`}
      >
        {list.branches.map((b) => (
          <option key={b.name} value={b.name}>
            {b.name}
            {b.name === list.defaultBranch ? " (default)" : ""}
            {b.protected ? " 🔒" : ""}
          </option>
        ))}
      </select>
      {list.branches.length > 1 && (
        <span className={`text-faded ${compact ? "hidden lg:inline text-xs" : "text-sm"}`}>
          {list.branches.length}
          {list.more ? "+" : ""} branches
        </span>
      )}
    </span>
  );
}
