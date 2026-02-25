import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Info, Sparkles } from 'lucide-react';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { TreeNode } from '@/types/dendrogram';
import { getPairLabelsFromExplanation } from '@/lib/explanation';

interface ClusterHeatmapsProps {
  root: TreeNode | null;
  labels: string[];
  scoreMatrix: number[][] | null;
  explanationMatrix: string[][] | null;
  error?: string | null;
}

interface ClusterGroup {
  clusterId: number;
  leafIndices: number[];
}

interface HoveredCell {
  rowIdx: number;
  colIdx: number;
  rowLabel: string;
  colLabel: string;
  scoreText: string;
  explanation: string;
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getContrastTextFromRgb(rgbString: string): string {
  const match = rgbString.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return '#0f172a';
  const [r, g, b] = match.slice(0, 3).map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.53 ? '#ffffff' : '#0f172a';
}

function getCellStyle(score: number | null) {
  if (score === null) {
    return { backgroundColor: '#e2e8f0', color: '#475569' };
  }

  const ratio = clamp(score / 5, 0, 1);
  const backgroundColor = interpolateYlOrRd(0.12 + ratio * 0.84);

  return {
    backgroundColor,
    color: getContrastTextFromRgb(backgroundColor)
  };
}

function compactLabel(value: string, max = 28): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function collectLeafClusters(root: TreeNode): ClusterGroup[] {
  const clusters = new Map<number, number[]>();

  function traverse(node: TreeNode): void {
    const isLeaf = !node.children || node.children.length === 0;
    if (isLeaf && node.clusterId !== undefined) {
      const indices = clusters.get(node.clusterId) ?? [];
      indices.push(node.id);
      clusters.set(node.clusterId, indices);
      return;
    }

    node.children?.forEach(traverse);
  }

  traverse(root);

  return Array.from(clusters.entries())
    .map(([clusterId, leafIndices]) => ({
      clusterId,
      leafIndices: leafIndices.sort((a, b) => a - b)
    }))
    .sort((a, b) => a.clusterId - b.clusterId);
}

export function ClusterHeatmaps({
  root,
  labels,
  scoreMatrix,
  explanationMatrix,
  error
}: ClusterHeatmapsProps) {
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<HoveredCell | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const clusters = useMemo(() => {
    if (!root) return [];
    return collectLeafClusters(root);
  }, [root]);

  const selectableClusters = useMemo(
    () => clusters.filter((cluster) => cluster.leafIndices.length > 1),
    [clusters]
  );

  useEffect(() => {
    if (selectableClusters.length === 0) {
      setSelectedClusterId(null);
      return;
    }

    setSelectedClusterId((current) => {
      if (current === null) return selectableClusters[0].clusterId;
      const stillExists = selectableClusters.some((cluster) => cluster.clusterId === current);
      return stillExists ? current : selectableClusters[0].clusterId;
    });
  }, [selectableClusters]);

  const selectedCluster = useMemo(() => {
    if (selectedClusterId === null) return null;
    return selectableClusters.find((cluster) => cluster.clusterId === selectedClusterId) ?? null;
  }, [selectableClusters, selectedClusterId]);

  useEffect(() => {
    setHoveredCell(null);
    setSelectedCell(null);
  }, [selectedClusterId]);

  if (!root) return null;

  const clusterSize = selectedCluster?.leafIndices.length ?? 0;
  const isLargeCluster = clusterSize > 40;
  const tickStep = Math.max(1, Math.ceil(clusterSize / 14));
  const ticks = Array.from({ length: clusterSize }, (_, i) => i).filter(
    (i) => i % tickStep === 0 || i === clusterSize - 1
  );

  const cellSize = clamp(980 / Math.max(clusterSize, 1), 10, 42);
  const topMargin = 22;
  const leftMargin = 360;
  const rightMargin = 28;
  const bottomMargin = 260;
  const gridSize = cellSize * clusterSize;
  const canvasWidth = Math.min(Math.max(leftMargin + rightMargin + gridSize, 1400), 4200);
  const canvasHeight = Math.min(Math.max(topMargin + bottomMargin + gridSize, 760), 2500);
  const scoreFontSize = clamp(cellSize * 0.34, 10, 25);

  const labelByRowPos = (rowPos: number, maxChars: number): string => {
    if (!selectedCluster) return '';
    const idx = selectedCluster.leafIndices[rowPos];
    if (idx === undefined) return '';
    return compactLabel(labels[idx] || `Unidad ${idx}`, maxChars);
  };

  const labelByColPos = (colPos: number, maxChars: number): string => {
    if (!selectedCluster) return '';
    const idx = selectedCluster.leafIndices[colPos];
    if (idx === undefined) return '';
    return compactLabel(labels[idx] || `Unidad ${idx}`, maxChars);
  };

  const getCellFromCanvasPosition = (x: number, y: number): HoveredCell | null => {
    if (!selectedCluster || !scoreMatrix || !explanationMatrix) return null;

    const insideX = x >= leftMargin && x < leftMargin + gridSize;
    const insideY = y >= topMargin && y < topMargin + gridSize;
    if (!insideX || !insideY) return null;

    const colPos = Math.floor((x - leftMargin) / cellSize);
    const rowPos = Math.floor((y - topMargin) / cellSize);
    const rowIdx = selectedCluster.leafIndices[rowPos];
    const colIdx = selectedCluster.leafIndices[colPos];
    if (rowIdx === undefined || colIdx === undefined) return null;

    const score = scoreMatrix[rowIdx]?.[colIdx];
    const validScore = Number.isFinite(score) ? score : null;
    const scoreText = validScore === null ? 'N/A' : validScore.toFixed(2);
    const anchorX = leftMargin + (colPos + 0.5) * cellSize;
    const anchorY = topMargin + (rowPos + 0.5) * cellSize;

    return {
      rowIdx,
      colIdx,
      rowLabel: labels[rowIdx] || `Unidad ${rowIdx}`,
      colLabel: labels[colIdx] || `Unidad ${colIdx}`,
      scoreText,
      explanation: explanationMatrix[rowIdx]?.[colIdx] || 'Sin explicación disponible.',
      x: anchorX,
      y: anchorY
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedCluster || !scoreMatrix) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvasWidth * dpr);
    canvas.height = Math.floor(canvasHeight * dpr);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    for (let rowPos = 0; rowPos < clusterSize; rowPos++) {
      const rowIdx = selectedCluster.leafIndices[rowPos];
      for (let colPos = 0; colPos < clusterSize; colPos++) {
        const colIdx = selectedCluster.leafIndices[colPos];
        const score = scoreMatrix[rowIdx]?.[colIdx];
        const validScore = Number.isFinite(score) ? score : null;
        const style = getCellStyle(validScore);

        const x = leftMargin + colPos * cellSize;
        const y = topMargin + rowPos * cellSize;

        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(
          Math.floor(x),
          Math.floor(y),
          Math.ceil(cellSize + 0.5),
          Math.ceil(cellSize + 0.5)
        );

        if (!isLargeCluster) {
          const scoreText = validScore === null ? 'N/A' : validScore.toFixed(2);
          ctx.fillStyle = style.color;
          ctx.font = `700 ${scoreFontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(scoreText, x + cellSize / 2, y + cellSize / 2);
        }
      }
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.floor(leftMargin),
      Math.floor(topMargin),
      Math.ceil(gridSize),
      Math.ceil(gridSize)
    );

    ctx.fillStyle = '#334155';
    ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const rowPos of ticks) {
      const y = topMargin + rowPos * cellSize + cellSize / 2;
      ctx.fillText(labelByRowPos(rowPos, 34), leftMargin - 12, y);
    }

    ctx.save();
    ctx.fillStyle = '#334155';
    ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const colPos of ticks) {
      const x = leftMargin + colPos * cellSize + cellSize / 2;
      const y = topMargin + gridSize + 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.52);
      ctx.fillText(labelByColPos(colPos, 24), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }, [
    selectedCluster,
    scoreMatrix,
    clusterSize,
    ticks,
    canvasWidth,
    canvasHeight,
    cellSize,
    gridSize,
    isLargeCluster,
    scoreFontSize,
    labels
  ]);

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedCluster) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nextHover = getCellFromCanvasPosition(x, y);
    if (!nextHover) {
      if (hoveredCell !== null) setHoveredCell(null);
      return;
    }

    setHoveredCell((prev) => {
      if (prev && prev.rowIdx === nextHover.rowIdx && prev.colIdx === nextHover.colIdx) {
        return prev;
      }
      return nextHover;
    });
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const clickedCell = getCellFromCanvasPosition(x, y);
    if (!clickedCell) return;
    setSelectedCell(clickedCell);
  };

  const explanationCell = selectedCell ?? hoveredCell;
  const explanationPair = explanationCell
    ? getPairLabelsFromExplanation(
        explanationCell.rowLabel,
        explanationCell.colLabel,
        explanationCell.explanation,
        labels
      )
    : null;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-cyan-50 via-white to-emerald-50 rounded-xl shadow-sm border border-cyan-100 p-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-700" />
          Heatmaps por Cluster
        </h3>
        <p className="text-sm text-slate-600">
          Cada tabla muestra los scores de superposición entre las unidades del cluster actual.
          Pasa el mouse por una celda para ver su explicación.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500">Escala:</span>
          {[0, 1, 2, 3, 4, 5].map((value) => (
            <span
              key={value}
              className="inline-flex items-center justify-center text-[11px] font-semibold w-7 h-6 rounded-md border border-slate-200"
              style={getCellStyle(value)}
            >
              {value}
            </span>
          ))}
          <span className="text-xs text-slate-500">de menor a mayor superposición</span>
        </div>
      </div>

      {error && (
        <Card className="border-rose-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-rose-700">No se pudieron cargar los heatmaps</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-rose-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {!scoreMatrix || !explanationMatrix ? null : !selectedCluster ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-700">
              No hay clusters seleccionables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700">
              En este punto de corte todos los clusters tienen una sola unidad y están bloqueados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="pb-3 bg-slate-50/70 border-b border-slate-200">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-700" />
                <span className="text-sm font-medium text-slate-700">Cluster a visualizar</span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(selectedCluster.clusterId)}
                  onValueChange={(value) => setSelectedClusterId(Number(value))}
                >
                  <SelectTrigger className="w-[230px] bg-white">
                    <SelectValue placeholder="Selecciona un cluster" />
                  </SelectTrigger>
                  <SelectContent>
                    {clusters.map((clusterOption) => (
                      <SelectItem
                        key={clusterOption.clusterId}
                        value={String(clusterOption.clusterId)}
                        disabled={clusterOption.leafIndices.length <= 1}
                      >
                        {`Cluster #${clusterOption.clusterId} (${clusterOption.leafIndices.length} unidades)${
                          clusterOption.leafIndices.length <= 1 ? ' - bloqueado' : ''
                        }`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Cluster #{selectedCluster.clusterId}</CardTitle>
              <Badge variant="outline" className="bg-white">
                {selectedCluster.leafIndices.length} unidades
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 min-h-[112px] max-h-[112px] overflow-auto">
              <div className="flex items-center gap-2 text-slate-700 text-sm font-medium mb-1">
                <Info className="w-4 h-4" />
                Explicación
              </div>
              {explanationCell ? (
                <p className="text-sm text-slate-700">
                  <strong>{explanationPair?.rowLabel ?? explanationCell.rowLabel}</strong> vs{' '}
                  <strong>{explanationPair?.colLabel ?? explanationCell.colLabel}</strong>
                  {' '}| score: <strong>{explanationCell.scoreText}</strong>
                  {' '}| {explanationCell.explanation}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Haz click en una celda para fijar su explicación.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="overflow-auto">
                <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
                  <canvas
                    ref={canvasRef}
                    onMouseMove={handleCanvasMouseMove}
                    onClick={handleCanvasClick}
                    onMouseLeave={() => setHoveredCell(null)}
                    className="block"
                    aria-label="Heatmap de superposición"
                  />

                  {hoveredCell && (
                    (() => {
                      const hoveredPair = getPairLabelsFromExplanation(
                        hoveredCell.rowLabel,
                        hoveredCell.colLabel,
                        hoveredCell.explanation,
                        labels
                      );
                      return (
                    <div
                      className="pointer-events-none absolute z-20 max-w-[420px] rounded-md border border-slate-200 bg-white p-2.5 shadow-lg text-xs"
                      style={{
                        left: Math.min(hoveredCell.x + 14, canvasWidth - 430),
                        top: Math.min(hoveredCell.y + 14, canvasHeight - 130)
                      }}
                    >
                      <p className="font-semibold text-slate-800">
                        {hoveredPair.rowLabel} vs {hoveredPair.colLabel}
                      </p>
                      <p className="text-slate-600 mt-1">Score: {hoveredCell.scoreText}</p>
                      <p className="text-slate-600 mt-1">{hoveredCell.explanation}</p>
                    </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
