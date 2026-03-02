import type { ScoreGraphAnalysis } from '@/lib/scoreGraph';

export interface LouvainCommunity {
  id: number;
  nodeIds: number[];
  edgeCount: number;
  averageWeight: number;
}

export interface LouvainResult {
  targetClusterId: number;
  communities: LouvainCommunity[];
  communityByNode: Map<number, number>;
}

interface AggregateNode {
  members: number[];
}

interface GraphLevel {
  nodes: AggregateNode[];
  adjacency: Map<number, number>[];
  degrees: number[];
  totalWeight: number;
}

function unique<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values));
}

function buildSubgraph(analysis: ScoreGraphAnalysis, nodeIds: number[]): GraphLevel {
  const localIndex = new Map(nodeIds.map((nodeId, idx) => [nodeId, idx]));
  const adjacency = Array.from({ length: nodeIds.length }, () => new Map<number, number>());

  for (const edge of analysis.edges) {
    const sourceIdx = localIndex.get(edge.source);
    const targetIdx = localIndex.get(edge.target);
    if (sourceIdx === undefined || targetIdx === undefined) continue;

    adjacency[sourceIdx].set(targetIdx, edge.score);
    adjacency[targetIdx].set(sourceIdx, edge.score);
  }

  const degrees = adjacency.map((neighbors, idx) =>
    Array.from(neighbors.entries()).reduce(
      (acc, [neighbor, weight]) => acc + (neighbor === idx ? weight * 2 : weight),
      0
    )
  );

  return {
    nodes: nodeIds.map((nodeId) => ({ members: [nodeId] })),
    adjacency,
    degrees,
    totalWeight: degrees.reduce((acc, value) => acc + value, 0) / 2
  };
}

function runOneLevel(graph: GraphLevel): { communities: number[]; changed: boolean } {
  const nodeCount = graph.nodes.length;
  const communities = Array.from({ length: nodeCount }, (_, idx) => idx);
  const communityTotals = [...graph.degrees];
  let changed = false;
  let improvement = true;
  let iterations = 0;

  while (improvement && iterations < 20) {
    improvement = false;
    iterations += 1;

    for (let node = 0; node < nodeCount; node++) {
      const nodeDegree = graph.degrees[node];
      if (nodeDegree === 0) continue;

      const currentCommunity = communities[node];
      const neighborWeights = new Map<number, number>();

      for (const [neighbor, weight] of graph.adjacency[node].entries()) {
        const community = communities[neighbor];
        neighborWeights.set(community, (neighborWeights.get(community) ?? 0) + weight);
      }

      communityTotals[currentCommunity] -= nodeDegree;

      let bestCommunity = currentCommunity;
      let bestGain = 0;
      const candidates = unique([currentCommunity, ...neighborWeights.keys()]);

      for (const candidate of candidates) {
        const insideWeight = neighborWeights.get(candidate) ?? 0;
        const gain =
          insideWeight - (communityTotals[candidate] * nodeDegree) / (2 * Math.max(graph.totalWeight, 1e-9));

        if (gain > bestGain + 1e-9) {
          bestGain = gain;
          bestCommunity = candidate;
        }
      }

      communityTotals[bestCommunity] += nodeDegree;

      if (bestCommunity !== currentCommunity) {
        communities[node] = bestCommunity;
        changed = true;
        improvement = true;
      }
    }
  }

  return { communities, changed };
}

function aggregateGraph(graph: GraphLevel, communities: number[]): GraphLevel {
  const uniqueCommunities = unique(communities);
  const nextIndex = new Map(uniqueCommunities.map((communityId, idx) => [communityId, idx]));
  const nodes: AggregateNode[] = uniqueCommunities.map(() => ({ members: [] }));

  graph.nodes.forEach((node, idx) => {
    const communityIdx = nextIndex.get(communities[idx]);
    if (communityIdx === undefined) return;
    nodes[communityIdx].members.push(...node.members);
  });

  const adjacency = Array.from({ length: nodes.length }, () => new Map<number, number>());

  for (let source = 0; source < graph.adjacency.length; source++) {
    for (const [target, weight] of graph.adjacency[source].entries()) {
      if (source > target) continue;

      const nextSource = nextIndex.get(communities[source]);
      const nextTarget = nextIndex.get(communities[target]);
      if (nextSource === undefined || nextTarget === undefined) continue;

      if (nextSource === nextTarget) {
        adjacency[nextSource].set(nextSource, (adjacency[nextSource].get(nextSource) ?? 0) + weight);
        continue;
      }

      adjacency[nextSource].set(nextTarget, (adjacency[nextSource].get(nextTarget) ?? 0) + weight);
      adjacency[nextTarget].set(nextSource, (adjacency[nextTarget].get(nextSource) ?? 0) + weight);
    }
  }

  const degrees = adjacency.map((neighbors, idx) =>
    Array.from(neighbors.entries()).reduce(
      (acc, [neighbor, weight]) => acc + (neighbor === idx ? weight * 2 : weight),
      0
    )
  );

  return {
    nodes,
    adjacency,
    degrees,
    totalWeight: degrees.reduce((acc, value) => acc + value, 0) / 2
  };
}

function buildResultFromFinalGraph(
  analysis: ScoreGraphAnalysis,
  targetClusterId: number,
  graph: GraphLevel
): LouvainResult {
  const orderedCommunities = graph.nodes
    .map((node) => node.members.slice().sort((a, b) => a - b))
    .sort((a, b) => b.length - a.length || a[0] - b[0]);

  const communityByNode = new Map<number, number>();
  const communities = orderedCommunities.map((nodeIds, id) => {
    nodeIds.forEach((nodeId) => communityByNode.set(nodeId, id));
    const nodeSet = new Set(nodeIds);
    let edgeCount = 0;
    let weightSum = 0;

    for (const edge of analysis.edges) {
      if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
      edgeCount += 1;
      weightSum += edge.score;
    }

    return {
      id,
      nodeIds,
      edgeCount,
      averageWeight: edgeCount > 0 ? weightSum / edgeCount : 0
    };
  });

  return {
    targetClusterId,
    communities,
    communityByNode
  };
}

export function runLouvainForLargeCluster(
  analysis: ScoreGraphAnalysis | null,
  minimumClusterSize = 10
): LouvainResult | null {
  if (!analysis) return null;

  const targetCluster = analysis.clusters.find((cluster) => cluster.nodeIds.length > minimumClusterSize);
  if (!targetCluster) return null;

  let graph = buildSubgraph(analysis, targetCluster.nodeIds);

  for (let level = 0; level < 8; level++) {
    const { communities, changed } = runOneLevel(graph);
    if (!changed) break;
    graph = aggregateGraph(graph, communities);
  }

  return buildResultFromFinalGraph(analysis, targetCluster.id, graph);
}
