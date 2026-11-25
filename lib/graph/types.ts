export type NodeKind = "file" | "class" | "function" | "doc" | "external" | "symbol";

export interface CMNode {
  id: string;
  label: string;
  kind: NodeKind;
  file?: string;
  location?: string;
  community?: number;
  communityName?: string;
}

export interface CMLink {
  source: string;
  target: string;
  relation: string;
}

export interface CMGraph {
  nodes: CMNode[];
  links: CMLink[];
}

export interface AffectedNode {
  node: CMNode;
  depth: number;
  /** relation of the edge that pulled this node into the blast radius */
  via: string;
  /** id of the node it depends on (one step closer to the target) */
  dependsOn: string;
}

export interface ImpactResult {
  found: boolean;
  target?: CMNode;
  affected: AffectedNode[];
  files: string[];
  suggestions: CMNode[];
}

export interface Neighbor {
  node: CMNode;
  relation: string;
}

export interface GraphStats {
  nodes: number;
  links: number;
  files: number;
  communities: number;
  hubs: { id: string; label: string; degree: number }[];
}
