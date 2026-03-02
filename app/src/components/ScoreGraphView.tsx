import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, Link2, Users, Component, FileText } from 'lucide-react';
import { buildScoreGraph } from '@/lib/scoreGraph';
import { runLouvainForLargeCluster } from '@/lib/louvain';

interface ScoreGraphViewProps {
  labels: string[];
  contents?: string[];
  scoreMatrix: number[][] | null;
  threshold?: number;
  error?: string | null;
}

interface PositionedNode extends d3.SimulationNodeDatum {
  id: number;
  label: string;
  content?: string;
  clusterId: number;
  degree: number;
}

interface PositionedEdge extends d3.SimulationLinkDatum<PositionedNode> {
  source: PositionedNode;
  target: PositionedNode;
  score: number;
}

interface ZoomState {
  x: number;
  y: number;
  k: number;
}

interface VisualGroup {
  key: string;
  title: string;
  nodeIds: number[];
  edgeCount: number;
  averageScore: number;
  colorIndex: number;
}

function compactLabel(value: string, max = 34): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function getClusterColor(clusterId: number): string {
  const hue = (clusterId * 137.508) % 360;
  const saturation = 62 + (clusterId % 3) * 6;
  const lightness = 40 + (clusterId % 4) * 5;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

export function ScoreGraphView({
  labels,
  contents,
  scoreMatrix,
  threshold = 4,
  error
}: ScoreGraphViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const analysis = useMemo(
    () => buildScoreGraph(labels, scoreMatrix, contents, threshold),
    [labels, scoreMatrix, contents, threshold]
  );
  const louvainResult = useMemo(
    () => runLouvainForLargeCluster(analysis, 10),
    [analysis]
  );

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [zoomState, setZoomState] = useState<ZoomState>({ x: 0, y: 0, k: 1 });

  const visualGroups = useMemo<VisualGroup[]>(() => {
    if (!analysis) return [];

    const groups: VisualGroup[] = [];
    let colorIndex = 0;

    for (const cluster of analysis.clusters) {
      if (louvainResult && cluster.id === louvainResult.targetClusterId && louvainResult.communities.length > 1) {
        for (const community of louvainResult.communities) {
          groups.push({
            key: `community-${cluster.id}-${community.id}`,
            title: `Cluster ${cluster.id + 1} · Comunidad ${community.id + 1}`,
            nodeIds: community.nodeIds,
            edgeCount: community.edgeCount,
            averageScore: community.averageWeight,
            colorIndex: colorIndex++
          });
        }
      } else {
        groups.push({
          key: `cluster-${cluster.id}`,
          title: `Cluster ${cluster.id + 1}`,
          nodeIds: cluster.nodeIds,
          edgeCount: cluster.edgeCount,
          averageScore: cluster.averageScore,
          colorIndex: colorIndex++
        });
      }
    }

    return groups;
  }, [analysis, louvainResult]);

  const visualGroupByNode = useMemo(() => {
    const map = new Map<number, VisualGroup>();
    for (const group of visualGroups) {
      for (const nodeId of group.nodeIds) {
        map.set(nodeId, group);
      }
    }
    return map;
  }, [visualGroups]);

  useEffect(() => {
    if (visualGroups.length === 0) {
      setSelectedGroupKey(null);
      return;
    }

    setSelectedGroupKey((current) =>
      current && visualGroups.some((group) => group.key === current) ? current : visualGroups[0].key
    );
  }, [visualGroups]);

  const layout = useMemo(() => {
    if (!analysis) return null;

    const width = 1320;
    const height = 860;
    const nodes: PositionedNode[] = analysis.nodes.map((node) => ({ ...node }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(analysis.clusters.length, 1))));
    const rows = Math.max(1, Math.ceil(Math.max(analysis.clusters.length, 1) / columns));
    const xSpacing = width / (columns + 1);
    const ySpacing = height / (rows + 1);
    const centers = new Map<number, { x: number; y: number }>();

    analysis.clusters.forEach((cluster, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      centers.set(cluster.id, {
        x: xSpacing * (col + 1),
        y: ySpacing * (row + 1)
      });
    });

    nodes.forEach((node) => {
      const center = centers.get(node.clusterId) ?? { x: width / 2, y: height / 2 };
      node.x = center.x + (Math.random() - 0.5) * 24;
      node.y = center.y + (Math.random() - 0.5) * 24;
    });

    const edges: PositionedEdge[] = analysis.edges
      .map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        return { source, target, score: edge.score };
      })
      .filter((edge): edge is PositionedEdge => edge !== null);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<PositionedNode, PositionedEdge>(edges)
          .id((node) => node.id)
          .distance((edge) => 110 - Math.min(42, (edge.score - threshold) * 18))
          .strength(0.42)
      )
      .force('charge', d3.forceManyBody().strength(-45 - Math.min(110, nodes.length * 0.35)))
      .force('collide', d3.forceCollide<PositionedNode>().radius((node) => 10 + node.degree * 1.2))
      .force(
        'x',
        d3.forceX<PositionedNode>((node) => centers.get(node.clusterId)?.x ?? width / 2).strength(0.2)
      )
      .force(
        'y',
        d3.forceY<PositionedNode>((node) => centers.get(node.clusterId)?.y ?? height / 2).strength(0.2)
      )
      .stop();

    for (let i = 0; i < 150; i++) simulation.tick();
    simulation.stop();

    return { width, height, nodes, edges };
  }, [analysis, threshold]);

  useEffect(() => {
    if (!layout || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 4.5])
      .translateExtent([
        [-layout.width, -layout.height],
        [layout.width * 2, layout.height * 2]
      ])
      .on('zoom', (event) => {
        setZoomState({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k
        });
      });

    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(40, 30).scale(0.92));

    return () => {
      svg.on('.zoom', null);
    };
  }, [layout]);

  const selectedNode = useMemo(
    () => analysis?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [analysis, selectedNodeId]
  );
  const hoveredNode = useMemo(
    () => analysis?.nodes.find((node) => node.id === hoveredNodeId) ?? null,
    [analysis, hoveredNodeId]
  );
  const nodeById = useMemo(
    () => new Map((analysis?.nodes ?? []).map((node) => [node.id, node])),
    [analysis]
  );

  const selectedGroup = useMemo(
    () => visualGroups.find((group) => group.key === selectedGroupKey) ?? visualGroups[0] ?? null,
    [visualGroups, selectedGroupKey]
  );

  if (!scoreMatrix || !analysis || !layout || analysis.nodes.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="w-4 h-4 text-slate-700" />
            Grafo de superposición
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            {error ?? 'No hay conexiones con score mayor o igual a 4 para construir el grafo.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-teal-100 p-2 text-teal-800">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Unidades</p>
                <p className="text-2xl font-semibold text-slate-900">{analysis.nodes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Aristas `score &gt;= 4`</p>
                <p className="text-2xl font-semibold text-slate-900">{analysis.edges.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-800">
                <Component className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Clusters visibles</p>
                <p className="text-2xl font-semibold text-slate-900">{visualGroups.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-100 p-2 text-rose-800">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Umbral de arista</p>
                <p className="text-2xl font-semibold text-slate-900">{threshold.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_minmax(360px,0.9fr)] gap-6">
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/70 border-b border-slate-200 pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="w-4 h-4 text-slate-700" />
                Red de superposición fuerte
              </CardTitle>
              <p className="text-sm text-slate-500">
                Cada arista representa una relación con score mayor o igual a {threshold.toFixed(0)}.
              </p>
            </CardHeader>
            <CardContent className="px-2 py-2">
              <div className="overflow-auto rounded-lg border border-slate-200 bg-[radial-gradient(circle_at_top,#f8fafc,transparent_65%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  className="h-[780px] min-w-[1100px] w-full touch-none"
                  role="img"
                  aria-label="Grafo de unidades conectadas por score de superposición mayor o igual a 4"
                >
                  <g transform={`translate(${zoomState.x}, ${zoomState.y}) scale(${zoomState.k})`}>
                    {layout.edges.map((edge) => {
                      const highlighted =
                        edge.source.id === selectedNodeId ||
                        edge.target.id === selectedNodeId ||
                        edge.source.id === hoveredNodeId ||
                        edge.target.id === hoveredNodeId;

                      return (
                        <line
                          key={`${edge.source.id}-${edge.target.id}`}
                          x1={edge.source.x ?? 0}
                          y1={edge.source.y ?? 0}
                          x2={edge.target.x ?? 0}
                          y2={edge.target.y ?? 0}
                          stroke={highlighted ? '#475569' : '#64748b'}
                          strokeOpacity={highlighted ? 0.88 : 0.58}
                          strokeWidth={highlighted ? 2.6 : 1.4 + Math.max(0.6, (edge.score - threshold) * 0.9)}
                        />
                      );
                    })}

                    {layout.nodes.map((node) => {
                      const selected = node.id === selectedNodeId;
                      const hovered = node.id === hoveredNodeId;
                      const visualGroup = visualGroupByNode.get(node.id);
                      const color = getClusterColor(visualGroup?.colorIndex ?? node.clusterId);
                      const radius = 6 + Math.min(8, node.degree * 1.05);
                      const showLabel = selected || hovered || zoomState.k >= 1.6;

                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedNodeId(node.id);
                            setSelectedGroupKey(visualGroup?.key ?? null);
                          }}
                          onMouseEnter={() => setHoveredNodeId(node.id)}
                          onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                        >
                          <circle
                            r={radius + (selected ? 3 : hovered ? 1.5 : 0)}
                            fill={color}
                            fillOpacity={selected ? 0.98 : 0.9}
                            stroke={selected ? '#0f172a' : hovered ? '#334155' : '#ffffff'}
                            strokeWidth={selected ? 2.5 : hovered ? 2 : 1.1}
                          />
                          {showLabel ? (
                            <text
                              y={radius + 14}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight={selected ? '700' : '500'}
                              fill="#334155"
                            >
                              {compactLabel(node.label, 18)}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
              <div className="px-4 pb-4 text-xs text-slate-500">
                Usa rueda para zoom y arrastra para recorrer el grafo.
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detalle del cluster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedGroup ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getClusterColor(selectedGroup.colorIndex) }}
                    />
                    <p className="text-sm font-semibold text-slate-800">{selectedGroup.title}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Unidades</p>
                      <p className="text-lg font-semibold text-slate-800">{selectedGroup.nodeIds.length}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Aristas</p>
                      <p className="text-lg font-semibold text-slate-800">{selectedGroup.edgeCount}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Score medio</p>
                      <p className="text-lg font-semibold text-slate-800">{selectedGroup.averageScore.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Unidades del grupo
                    </p>
                    <div className="max-h-56 space-y-1.5 overflow-auto pr-1">
                      {selectedGroup.nodeIds.map((nodeId) => {
                        const node = nodeById.get(nodeId);
                        if (!node) return null;
                        return (
                          <button
                            key={nodeId}
                            type="button"
                            onClick={() => setSelectedNodeId(nodeId)}
                            className={`block w-full rounded-md px-2 py-1 text-left text-sm transition-colors ${
                              selectedNodeId === nodeId ? 'bg-white text-slate-900' : 'text-slate-700 hover:bg-white'
                            }`}
                          >
                            <span>{node.label}</span>
                            {louvainResult?.communityByNode.has(nodeId) ? (
                              <span className="ml-2 text-xs text-slate-500">
                                C{(louvainResult.communityByNode.get(nodeId) ?? 0) + 1}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No hay clusters disponibles.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 self-start">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Clusters detectados</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    Selecciona un grupo. La lista tiene scroll propio para no desplazar el detalle.
                  </p>
                </div>
                <Badge variant="outline" className="font-mono">
                  {visualGroups.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {visualGroups.map((group) => {
                  const isActive = group.key === selectedGroup?.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setSelectedGroupKey(group.key)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        isActive ? 'border-slate-900 bg-slate-100' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: getClusterColor(group.colorIndex) }}
                            />
                            <p className="text-sm font-semibold text-slate-800">{group.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {group.nodeIds.length} unidades, {group.edgeCount} aristas internas
                          </p>
                        </div>
                        <Badge variant="outline" className="font-mono">
                          {group.averageScore > 0 ? group.averageScore.toFixed(2) : 'sin lazos'}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-slate-700" />
                Detalle de unidad
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedNode || hoveredNode ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nombre</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {(selectedNode ?? hoveredNode)?.label}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Cluster</p>
                      <p className="text-lg font-semibold text-slate-800">
                        {visualGroupByNode.get((selectedNode ?? hoveredNode)?.id ?? -1)?.title ?? 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Grado</p>
                      <p className="text-lg font-semibold text-slate-800">{(selectedNode ?? hoveredNode)?.degree}</p>
                    </div>
                  </div>
                  {louvainResult && louvainResult.communityByNode.has((selectedNode ?? hoveredNode)?.id ?? -1) ? (
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs text-slate-500">Comunidad Louvain</p>
                      <p className="text-lg font-semibold text-slate-800">
                        {(louvainResult.communityByNode.get((selectedNode ?? hoveredNode)?.id ?? -1) ?? 0) + 1}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Función</p>
                    <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                      {(selectedNode ?? hoveredNode)?.content ?? 'Sin descripción disponible.'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Selecciona un nodo del grafo o una unidad dentro de un cluster.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
