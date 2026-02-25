import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, ListOrdered } from 'lucide-react';
import type { TreeNode } from '@/types/dendrogram';
import { getPairLabelsFromExplanation } from '@/lib/explanation';

interface OverlapRankingProps {
  root: TreeNode | null;
  labels: string[];
  scoreMatrix: number[][] | null;
  explanationMatrix: string[][] | null;
}

interface UnitAverage {
  idx: number;
  label: string;
  average: number;
  clusterId: number | null;
}

interface PairScore {
  idx: number;
  label: string;
  score: number;
  clusterId: number | null;
}

function compactLabel(value: string, max = 62): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function buildLeafClusterMap(root: TreeNode | null): Map<number, number> {
  const map = new Map<number, number>();
  if (!root) return map;

  function traverse(node: TreeNode): void {
    const isLeaf = !node.children || node.children.length === 0;
    if (isLeaf && node.clusterId !== undefined) {
      map.set(node.id, node.clusterId);
      return;
    }
    node.children?.forEach(traverse);
  }

  traverse(root);
  return map;
}

export function OverlapRanking({ root, labels, scoreMatrix, explanationMatrix }: OverlapRankingProps) {
  const leafClusterMap = useMemo(() => buildLeafClusterMap(root), [root]);

  const ranking = useMemo<UnitAverage[]>(() => {
    if (!scoreMatrix || labels.length === 0) return [];

    const n = Math.min(labels.length, scoreMatrix.length);
    const rows = Array.from({ length: n }, (_, i) => {
      const row = scoreMatrix[i] ?? [];
      let sum = 0;
      let count = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const value = row[j];
        if (!Number.isFinite(value)) continue;
        sum += value;
        count++;
      }

      const average = count > 0 ? sum / count : 0;
      return {
        idx: i,
        label: labels[i] ?? `Unidad ${i}`,
        average,
        clusterId: leafClusterMap.get(i) ?? null
      };
    });

    return rows.sort((a, b) => b.average - a.average).slice(0, 10);
  }, [scoreMatrix, labels, leafClusterMap]);

  const [selectedUnitIdx, setSelectedUnitIdx] = useState<number | null>(null);
  const [selectedPeerIdx, setSelectedPeerIdx] = useState<number | null>(null);

  useEffect(() => {
    if (ranking.length === 0) {
      setSelectedUnitIdx(null);
      return;
    }
    setSelectedUnitIdx((current) => {
      if (current === null) return ranking[0].idx;
      return ranking.some((item) => item.idx === current) ? current : ranking[0].idx;
    });
  }, [ranking]);

  const selectedItem = useMemo(
    () => ranking.find((item) => item.idx === selectedUnitIdx) ?? null,
    [ranking, selectedUnitIdx]
  );

  const topRelated = useMemo<PairScore[]>(() => {
    if (!scoreMatrix || selectedUnitIdx === null) return [];

    const n = Math.min(labels.length, scoreMatrix.length);
    const row = scoreMatrix[selectedUnitIdx] ?? [];
    const peers: PairScore[] = [];

    for (let j = 0; j < n; j++) {
      if (j === selectedUnitIdx) continue;
      const value = row[j];
      if (!Number.isFinite(value)) continue;
      peers.push({
        idx: j,
        label: labels[j] ?? `Unidad ${j}`,
        score: value,
        clusterId: leafClusterMap.get(j) ?? null
      });
    }

    return peers.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [scoreMatrix, labels, selectedUnitIdx, leafClusterMap]);

  useEffect(() => {
    if (topRelated.length === 0) {
      setSelectedPeerIdx(null);
      return;
    }
    setSelectedPeerIdx((current) => {
      if (current === null) return topRelated[0].idx;
      return topRelated.some((peer) => peer.idx === current) ? current : topRelated[0].idx;
    });
  }, [topRelated]);

  const selectedPeer = useMemo(
    () => topRelated.find((peer) => peer.idx === selectedPeerIdx) ?? null,
    [topRelated, selectedPeerIdx]
  );

  const selectedPeerExplanation = useMemo(() => {
    if (!explanationMatrix || selectedUnitIdx === null || selectedPeerIdx === null) return null;
    return explanationMatrix[selectedUnitIdx]?.[selectedPeerIdx] || 'Sin explicación disponible.';
  }, [explanationMatrix, selectedUnitIdx, selectedPeerIdx]);

  const explanationPairLabels = useMemo(() => {
    if (!selectedItem || !selectedPeer) return null;
    return getPairLabelsFromExplanation(
      selectedItem.label,
      selectedPeer.label,
      selectedPeerExplanation ?? '',
      labels
    );
  }, [selectedItem, selectedPeer, selectedPeerExplanation, labels]);

  if (!scoreMatrix || ranking.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="pb-3 bg-slate-50/70 border-b border-slate-200">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-700" />
          Ranking de Superposición Promedio
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 p-3 bg-white">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-700">
              <ListOrdered className="w-4 h-4" />
              Top 10 unidades (promedio)
            </div>
            <div className="space-y-2">
              {ranking.map((item, position) => {
                const isActive = item.idx === selectedUnitIdx;
                return (
                  <button
                    key={item.idx}
                    type="button"
                    onClick={() => setSelectedUnitIdx(item.idx)}
                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                      isActive
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          #{position + 1} {compactLabel(item.label, 56)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Cluster: {item.clusterId ?? 'N/A'}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono">
                        {item.average.toFixed(2)}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-white">
            <div className="text-sm font-medium text-slate-700 mb-2">
              {selectedItem ? compactLabel(selectedItem.label, 85) : 'Selecciona una unidad'}
            </div>
            {selectedItem && (
              <p className="text-xs text-slate-500 mb-2">
                Cluster actual: {selectedItem.clusterId ?? 'N/A'}
              </p>
            )}
            <p className="text-xs text-slate-500 mb-3">
              5 unidades con mayor score de superposición.
            </p>
            <div className="space-y-2">
              {topRelated.map((peer, idx) => (
                <button
                  key={`${selectedUnitIdx}-${peer.idx}`}
                  type="button"
                  onClick={() => setSelectedPeerIdx(peer.idx)}
                  className={`w-full text-left flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                    selectedPeerIdx === peer.idx
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <span className="text-sm text-slate-700">
                      {idx + 1}. {compactLabel(peer.label, 62)}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cluster: {peer.clusterId ?? 'N/A'}
                    </p>
                  </div>
                  <Badge className="bg-amber-500 text-white font-mono hover:bg-amber-500">
                    {peer.score.toFixed(2)}
                  </Badge>
                </button>
              ))}
            </div>

            {selectedPeer && (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">
                  Justificación del score
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {compactLabel(explanationPairLabels?.rowLabel ?? selectedItem?.label ?? '', 90)} vs{' '}
                  {compactLabel(explanationPairLabels?.colLabel ?? selectedPeer.label, 90)}
                </p>
                <p className="text-sm text-slate-700 mt-2">
                  {selectedPeerExplanation ?? 'Sin explicación disponible.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
