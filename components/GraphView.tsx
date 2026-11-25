"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d";
import type { GraphEngine } from "@/lib/graph/engine";
import type { CMNode } from "@/lib/graph/types";
import type { Highlight } from "@/lib/ai/highlight";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type GNode = NodeObject<CMNode & { deg: number }>;
type GLink = LinkObject<GNode, { relation: string }>;

const SIGNAL = "#FF5E57";
const RIPPLE = ["#FFB23F", "#FFCF73", "#FFE7A8", "#FFF3D6"];
const PAPER = "#E9F0F7";

/** muted blueprint tints per Graphify community, so highlights stay the loudest thing on screen */
function communityColor(c: number | undefined): string {
  if (c === undefined) return "rgba(158,186,214,0.55)";
  const hue = [205, 175, 235, 190, 260, 160, 220, 145, 280, 200][c % 10];
  const light = 62 + ((c * 7) % 14);
  return `hsla(${hue}, 38%, ${light}%, 0.85)`;
}

const rippleColor = (depth: number) => RIPPLE[Math.min(depth - 1, RIPPLE.length - 1)];

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function GraphView({
  engine,
  highlight,
  selectedId,
  onSelect,
  showDocs,
}: {
  engine: GraphEngine;
  highlight: Highlight;
  selectedId: string | null;
  onSelect: (n: CMNode | null) => void;
  showDocs: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods | undefined>(undefined);
  const { w, h } = useSize(wrap);
  const [hover, setHover] = useState<string | null>(null);
  const rippleStart = useRef(0);
  const fitted = useRef(false);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const data = useMemo(() => {
    const nodes: GNode[] = engine.graph.nodes
      .filter((n) => showDocs || n.kind !== "doc")
      .map((n) => ({ ...n, deg: engine.degree(n.id) }));
    const keep = new Set(nodes.map((n) => n.id));
    const links: GLink[] = engine.graph.links
      .filter((l) => keep.has(l.source) && keep.has(l.target))
      .map((l) => ({ source: l.source, target: l.target, relation: l.relation }));
    return { nodes, links };
  }, [engine, showDocs]);

  const big = data.nodes.length > 2500;
  const active = highlight.focus.size > 0 || highlight.depth.size > 0;
  const lit = (id: string) => highlight.focus.has(id) || highlight.depth.has(id);
  const pathEdges = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < highlight.path.length - 1; i++) {
      s.add(`${highlight.path[i]}|${highlight.path[i + 1]}`);
      s.add(`${highlight.path[i + 1]}|${highlight.path[i]}`);
    }
    return s;
  }, [highlight.path]);

  const idOf = (x: string | number | GNode | undefined) => (typeof x === "object" ? String(x.id) : String(x));
  const linkLit = (l: GLink) => {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (pathEdges.has(`${s}|${t}`)) return true;
    return highlight.depth.has(s) && (highlight.focus.has(t) || highlight.depth.has(t));
  };

  // fly the camera to whatever the latest answer is about
  useEffect(() => {
    rippleStart.current = performance.now();
    if (!fg.current) return;
    if (active) {
      const ids = new Set([...highlight.focus, ...highlight.depth.keys()]);
      setTimeout(() => fg.current?.zoomToFit(700, 70, (n) => ids.has(String(n.id))), 60);
    }
  }, [highlight, active]);

  useEffect(() => {
    if (!selectedId || !fg.current) return;
    const n = data.nodes.find((x) => x.id === selectedId);
    if (n?.x !== undefined && n.y !== undefined) {
      fg.current.centerAt(n.x, n.y, 600);
      fg.current.zoom(Math.max(fg.current.zoom(), 2.2), 600);
    }
  }, [selectedId, data.nodes]);

  return (
    <div ref={wrap} className="absolute inset-0" aria-label="Interactive knowledge graph of the repository">
      <ForceGraph2D
        ref={fg}
        width={w}
        height={h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={big ? 60 : 160}
        d3AlphaDecay={big ? 0.05 : 0.025}
        warmupTicks={big ? 40 : 0}
        nodeRelSize={4}
        autoPauseRedraw={!(active && !reducedMotion)}
        onEngineStop={() => {
          if (!fitted.current) {
            fitted.current = true;
            fg.current?.zoomToFit(500, 40);
          }
        }}
        onNodeHover={(n) => setHover(n ? String(n.id) : null)}
        onNodeClick={(n) => onSelect(engine.byId.get(String(n.id)) ?? null)}
        onBackgroundClick={() => onSelect(null)}
        nodeLabel={(n) => `${(n as GNode).label}${(n as GNode).file ? ` — ${(n as GNode).file}` : ""}`}
        linkColor={(l) =>
          linkLit(l as GLink) ? "rgba(255,178,63,0.85)" : active ? "rgba(158,186,214,0.06)" : "rgba(158,186,214,0.16)"
        }
        linkWidth={(l) => (linkLit(l as GLink) ? 1.6 : 0.5)}
        linkDirectionalParticles={(l) => (linkLit(l as GLink) ? 2 : 0)}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleColor={() => "#FFE7A8"}
        linkDirectionalArrowLength={(l) => (linkLit(l as GLink) ? 3.5 : 0)}
        linkDirectionalArrowRelPos={0.9}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as GNode;
          const id = String(n.id);
          const r = 2 + Math.sqrt(n.deg) * 0.9;
          const isFocus = highlight.focus.has(id);
          const d = highlight.depth.get(id);
          const isSel = id === selectedId;
          let fill = n.kind === "doc" ? "rgba(233,240,247,0.35)" : communityColor(n.community);
          if (isFocus) fill = SIGNAL;
          else if (d !== undefined) fill = rippleColor(d);
          ctx.globalAlpha = active && !lit(id) && !isSel ? 0.13 : 1;
          ctx.beginPath();
          if (n.kind === "file") ctx.rect(n.x! - r, n.y! - r, r * 2, r * 2);
          else ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = fill;
          ctx.fill();
          if (isSel || isFocus) {
            ctx.lineWidth = 1.5 / scale;
            ctx.strokeStyle = PAPER;
            ctx.stroke();
          }
          const showLabel =
            isFocus || isSel || id === hover || (d !== undefined && d <= 1) || (!active && n.deg > 14 && scale > 1.4) || scale > 4;
          if (showLabel) {
            const fs = Math.max(11 / scale, 1.5);
            ctx.font = `${isFocus ? 600 : 500} ${fs}px "IBM Plex Mono", monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const text = n.label.length > 36 ? n.label.slice(0, 35) + "…" : n.label;
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = "rgba(10,37,64,0.82)";
            ctx.fillRect(n.x! - tw / 2 - 2 / scale, n.y! + r + 1.5 / scale, tw + 4 / scale, fs + 3 / scale);
            ctx.fillStyle = isFocus ? "#FFD1CE" : d !== undefined ? rippleColor(d) : PAPER;
            ctx.fillText(text, n.x!, n.y! + r + 3 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GNode;
          const r = 3 + Math.sqrt(n.deg) * 0.9;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
        onRenderFramePost={(ctx, scale) => {
          // the blast radius: rings radiating out of the changed node
          if (!highlight.focus.size || highlight.path.length) return;
          const t = (performance.now() - rippleStart.current) / 1000;
          for (const id of highlight.focus) {
            const n = data.nodes.find((x) => x.id === id);
            if (n?.x === undefined || n.y === undefined) continue;
            for (let k = 0; k < 3; k++) {
              const phase = reducedMotion ? 0.35 + k * 0.25 : ((t * 0.32 + k / 3) % 1);
              const radius = (14 + phase * 150) / Math.sqrt(scale);
              ctx.beginPath();
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
              ctx.strokeStyle = `rgba(255,94,87,${(1 - phase) * 0.55})`;
              ctx.lineWidth = 1.4 / scale;
              ctx.stroke();
            }
          }
        }}
      />
    </div>
  );
}
