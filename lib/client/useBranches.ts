"use client";

import { useEffect, useState } from "react";
import { parseRepo, type BranchList } from "../github/branches";

export type BranchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; list: BranchList }
  | { status: "error"; error: string };

/** Fetch branches for whatever repo string is typed, debounced. */
export function useBranches(input: string, delayMs = 450): BranchState {
  const [state, setState] = useState<BranchState>({ status: "idle" });
  const id = parseRepo(input);
  const key = id ? `${id.owner}/${id.repo}` : "";

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/branches?repo=${encodeURIComponent(key)}`, { signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setState({ status: "ready", list: body });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState({ status: "error", error: (e as Error).message });
      }
    }, delayMs);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, delayMs]);

  return key ? state : { status: "idle" };
}
