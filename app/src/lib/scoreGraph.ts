export interface ScoreGraphNode {
  id: number;
  label: string;
  content?: string;
  clusterId: number;
  degree: number;
}

export interface ScoreGraphEdge {
  source: number;
  target: number;
  score: number;
}

export interface ScoreGraphCluster {
  id: number;
  nodeIds: number[];
  edgeCount: number;
  averageScore: number;
  maxScore: number;
}

export interface ScoreGraphAnalysis {
  nodes: ScoreGraphNode[];
  edges: ScoreGraphEdge[];
  clusters: ScoreGraphCluster[];
  clusterByNode: Map<number, number>;
  threshold: number;
}

export function buildScoreGraph(
  labels: string[],
  scoreMatrix: number[][] | null,
  contents?: string[],
  threshold = 4
): ScoreGraphAnalysis | null {
  if (!scoreMatrix || labels.length === 0) return null;

  const n = Math.min(labels.length, scoreMatrix.length);
  const adjacency = Array.from({ length: n }, () => new Set<number>());
  const edges: ScoreGraphEdge[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const score = scoreMatrix[i]?.[j];
      if (!Number.isFinite(score) || score < threshold) continue;
      edges.push({ source: i, target: j, score });
      adjacency[i].add(j);
      adjacency[j].add(i);
    }
  }

  const includedNodeIds = Array.from({ length: n }, (_, id) => id).filter((id) => adjacency[id].size > 0);
  if (includedNodeIds.length === 0) {
    return {
      nodes: [],
      edges: [],
      clusters: [],
      clusterByNode: new Map<number, number>(),
      threshold
    };
  }

  const visited = new Array<boolean>(n).fill(false);
  const clusterByNode = new Map<number, number>();
  const clusters: ScoreGraphCluster[] = [];

  for (const start of includedNodeIds) {
    if (visited[start]) continue;

    const stack = [start];
    const nodeIds: number[] = [];
    let edgeCount = 0;
    let edgeSum = 0;
    let maxScore = 0;

    visited[start] = true;

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      nodeIds.push(nodeId);
      clusterByNode.set(nodeId, clusters.length);

      for (const neighbor of adjacency[nodeId]) {
        if (nodeId < neighbor) {
          const score = scoreMatrix[nodeId]?.[neighbor];
          if (Number.isFinite(score)) {
            edgeCount += 1;
            edgeSum += score;
            maxScore = Math.max(maxScore, score);
          }
        }

        if (!visited[neighbor]) {
          visited[neighbor] = true;
          stack.push(neighbor);
        }
      }
    }

    nodeIds.sort((a, b) => a - b);
    clusters.push({
      id: clusters.length,
      nodeIds,
      edgeCount,
      averageScore: edgeCount > 0 ? edgeSum / edgeCount : 0,
      maxScore
    });
  }

  clusters.sort((a, b) => {
    if (b.nodeIds.length !== a.nodeIds.length) return b.nodeIds.length - a.nodeIds.length;
    if (b.edgeCount !== a.edgeCount) return b.edgeCount - a.edgeCount;
    return b.averageScore - a.averageScore;
  });

  const remappedClusterByNode = new Map<number, number>();
  const normalizedClusters = clusters.map((cluster, idx) => {
    cluster.nodeIds.forEach((nodeId) => remappedClusterByNode.set(nodeId, idx));
    return {
      ...cluster,
      id: idx
    };
  });

  const nodes: ScoreGraphNode[] = includedNodeIds.map((id) => ({
    id,
    label: labels[id] ?? `Unidad ${id}`,
    content: contents?.[id],
    clusterId: remappedClusterByNode.get(id) ?? 0,
    degree: adjacency[id].size
  }));

  return {
    nodes,
    edges,
    clusters: normalizedClusters,
    clusterByNode: remappedClusterByNode,
    threshold
  };
}
