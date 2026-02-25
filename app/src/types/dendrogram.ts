export interface LinkageNode {
  id: number;
  left: number;
  right: number;
  distance: number;
  count: number;
}

export interface TreeNode {
  id: number;
  name?: string;
  content?: string;
  distance: number;
  count: number;
  x?: number;
  y?: number;
  children?: TreeNode[];
  parent?: TreeNode;
  clusterId?: number;
}

export interface DendrogramData {
  linkage: number[][];
  labels: string[];
  contents?: string[];
}

export interface NodeDetails {
  id: number;
  name: string;
  content?: string;
  distance: number;
  clusterId: number;
  isLeaf: boolean;
}
