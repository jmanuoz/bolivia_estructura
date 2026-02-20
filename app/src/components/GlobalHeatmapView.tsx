import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListFilter } from 'lucide-react';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface GlobalHeatmapViewProps {
  labels: string[];
  scoreMatrix: number[][] | null;
  explanationMatrix: string[][] | null;
  error?: string | null;
}

interface PairByScore {
  score: number;
  scoreText: string;
  count: number;
  pairs: Array<{
    rowIdx: number;
    colIdx: number;
    rowLabel: string;
    colLabel: string;
    explanation: string;
  }>;
}

interface ScoreSlice {
  scoreText: string;
  count: number;
  fill: string;
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

function compactLabel(value: string, max = 46): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

const ENTERPRISE_KEYWORDS = [
  'empresa',
  'boliviana de aviación',
  'boliviana de turismo',
  'corporación minera de bolivia',
  'mi teleférico',
  'depósitos aduaneros bolivianos',
  'yacimientos petrolíferos fiscales bolivianos',
  'yacimientos de litio bolivianos',
  'ecebol',
  'quipus',
  'enatex',
  'cartonbol',
  'kokabol',
  'envibol',
  'papelbol',
  'azucarbol'
];

function isEnterpriseUnit(label: string): boolean {
  const normalized = label.toLowerCase();
  return ENTERPRISE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function pairPriority(rowLabel: string, colLabel: string): number {
  return isEnterpriseUnit(rowLabel) || isEnterpriseUnit(colLabel) ? 0 : 1;
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

export function GlobalHeatmapView({
  labels,
  scoreMatrix,
  explanationMatrix,
  error
}: GlobalHeatmapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [selectedScore, setSelectedScore] = useState<string | null>(null);

  const n = useMemo(() => {
    if (!scoreMatrix || labels.length === 0) return 0;
    return Math.min(labels.length, scoreMatrix.length);
  }, [labels, scoreMatrix]);

  const scoreStats = useMemo<PairByScore[]>(() => {
    if (!scoreMatrix || n === 0) return [];

    const groups = new Map<string, PairByScore>();
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const raw = scoreMatrix[i]?.[j];
        if (!Number.isFinite(raw)) continue;

        const score = Number(raw.toFixed(2));
        const key = score.toFixed(2);
        const existing = groups.get(key);
        const pair = {
          rowIdx: i,
          colIdx: j,
          rowLabel: labels[i] ?? `Unidad ${i}`,
          colLabel: labels[j] ?? `Unidad ${j}`,
          explanation: explanationMatrix?.[i]?.[j] || 'Sin explicación disponible.'
        };

        if (!existing) {
          groups.set(key, {
            score,
            scoreText: key,
            count: 1,
            pairs: [pair]
          });
          continue;
        }

        existing.count += 1;
        existing.pairs.push(pair);
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        pairs: [...group.pairs].sort(
          (a, b) => pairPriority(a.rowLabel, a.colLabel) - pairPriority(b.rowLabel, b.colLabel)
        )
      }))
      .sort((a, b) => b.score - a.score);
  }, [scoreMatrix, explanationMatrix, labels, n]);

  useEffect(() => {
    if (scoreStats.length === 0) {
      setSelectedScore(null);
      return;
    }
    setSelectedScore((current) => {
      if (!current) return scoreStats[0].scoreText;
      return scoreStats.some((item) => item.scoreText === current) ? current : scoreStats[0].scoreText;
    });
  }, [scoreStats]);

  const selectedStat = useMemo(
    () => scoreStats.find((item) => item.scoreText === selectedScore) ?? null,
    [scoreStats, selectedScore]
  );

  const pieData = useMemo<ScoreSlice[]>(() => {
    if (scoreStats.length === 0) return [];
    return scoreStats.map((item) => ({
      scoreText: item.scoreText,
      count: item.count,
      fill: getCellStyle(item.score).backgroundColor
    }));
  }, [scoreStats]);
  const totalPairs = useMemo(
    () => pieData.reduce((acc, item) => acc + item.count, 0),
    [pieData]
  );

  const cellSize = clamp(Math.floor(2400 / Math.max(n, 1)), 10, 18);
  const leftMargin = 380;
  const topMargin = 24;
  const rightMargin = 24;
  const bottomMargin = 320;
  const gridSize = n * cellSize;
  const canvasWidth = leftMargin + gridSize + rightMargin;
  const canvasHeight = topMargin + gridSize + bottomMargin;
  const labelStep = Math.max(1, Math.ceil(n / 20));
  const ticks = Array.from({ length: n }, (_, idx) => idx).filter(
    (idx) => idx % labelStep === 0 || idx === n - 1
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scoreMatrix || n === 0) return;

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

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const score = scoreMatrix[row]?.[col];
        const validScore = Number.isFinite(score) ? score : null;
        const style = getCellStyle(validScore);

        const x = leftMargin + col * cellSize;
        const y = topMargin + row * cellSize;
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(
          Math.floor(x),
          Math.floor(y),
          Math.ceil(cellSize + 0.5),
          Math.ceil(cellSize + 0.5)
        );
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
    ctx.font = '600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const row of ticks) {
      const y = topMargin + row * cellSize + cellSize / 2;
      ctx.fillText(compactLabel(labels[row] ?? `Unidad ${row}`, 36), leftMargin - 10, y);
    }

    ctx.save();
    ctx.fillStyle = '#334155';
    ctx.font = '600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const col of ticks) {
      const x = leftMargin + col * cellSize + cellSize / 2;
      const y = topMargin + gridSize + 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.5);
      ctx.fillText(compactLabel(labels[col] ?? `Unidad ${col}`, 30), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }, [scoreMatrix, labels, n, canvasWidth, canvasHeight, leftMargin, topMargin, gridSize, cellSize, ticks]);

  const getCellFromPosition = (x: number, y: number): HoveredCell | null => {
    if (!scoreMatrix || n === 0) return null;

    const insideX = x >= leftMargin && x < leftMargin + gridSize;
    const insideY = y >= topMargin && y < topMargin + gridSize;
    if (!insideX || !insideY) return null;

    const col = Math.floor((x - leftMargin) / cellSize);
    const row = Math.floor((y - topMargin) / cellSize);
    const score = scoreMatrix[row]?.[col];
    const validScore = Number.isFinite(score) ? score : null;
    const scoreText = validScore === null ? 'N/A' : validScore.toFixed(2);

    return {
      rowIdx: row,
      colIdx: col,
      rowLabel: labels[row] ?? `Unidad ${row}`,
      colLabel: labels[col] ?? `Unidad ${col}`,
      scoreText,
      explanation: explanationMatrix?.[row]?.[col] || 'Sin explicación disponible.',
      x: leftMargin + (col + 0.5) * cellSize,
      y: topMargin + (row + 0.5) * cellSize
    };
  };

  const onCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const next = getCellFromPosition(x, y);
    if (!next) {
      if (hoveredCell !== null) setHoveredCell(null);
      return;
    }
    setHoveredCell((prev) => {
      if (prev && prev.rowIdx === next.rowIdx && prev.colIdx === next.colIdx) return prev;
      return next;
    });
  };

  if (error) {
    return (
      <Card className="border-rose-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-rose-700">No se pudo cargar la vista de heatmap completo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-rose-700">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!scoreMatrix || !explanationMatrix || n === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="pb-3 bg-slate-50/70 border-b border-slate-200">
          <CardTitle className="text-base flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-blue-700" />
            Estadísticas por score de superposición
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {scoreStats.map((stat) => (
              <button
                key={stat.scoreText}
                type="button"
                onClick={() => setSelectedScore(stat.scoreText)}
                className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  selectedScore === stat.scoreText
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="font-semibold">Score {stat.scoreText}</span>
                <span className="text-slate-500"> ({stat.count})</span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-700 mb-2">Distribución de superposiciones por score</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="scoreText"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={false}
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={`cell-${entry.scoreText}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => {
                      const pct = totalPairs > 0 ? (value / totalPairs) * 100 : 0;
                      return [`${value} pares (${pct.toFixed(1)}%)`, 'Cantidad'];
                    }}
                    labelFormatter={(scoreText) => `Score ${scoreText}`}
                  />
                  <Legend formatter={(value) => `Score ${value}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {pieData.map((item) => {
                const pct = totalPairs > 0 ? (item.count / totalPairs) * 100 : 0;
                return (
                  <span
                    key={`pct-${item.scoreText}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                  >
                    <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: item.fill }} />
                    {`Score ${item.scoreText}: ${pct.toFixed(1)}% (${item.count})`}
                  </span>
                );
              })}
            </div>
          </div>

          {selectedStat && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 max-h-72 overflow-auto">
              <p className="text-sm text-slate-700 mb-2">
                <strong>{selectedStat.count}</strong> pares para score <strong>{selectedStat.scoreText}</strong>.
              </p>
              <div className="space-y-2">
                {selectedStat.pairs.map((pair) => (
                  <div
                    key={`${selectedStat.scoreText}-${pair.rowIdx}-${pair.colIdx}`}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="text-sm text-slate-700">
                      {compactLabel(pair.rowLabel, 120)} <span className="text-slate-400">vs</span>{' '}
                      {compactLabel(pair.colLabel, 120)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{pair.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="overflow-auto max-h-[78vh]">
              <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
                <canvas
                  ref={canvasRef}
                  onMouseMove={onCanvasMouseMove}
                  onMouseLeave={() => setHoveredCell(null)}
                  className="block"
                  aria-label="Heatmap completo"
                />

                {hoveredCell && (
                  <div
                    className="pointer-events-none absolute z-20 max-w-[420px] rounded-md border border-slate-200 bg-white p-2.5 shadow-lg text-xs"
                    style={{
                      left: Math.min(hoveredCell.x + 12, canvasWidth - 430),
                      top: Math.min(hoveredCell.y + 12, canvasHeight - 130)
                    }}
                  >
                    <p className="font-semibold text-slate-800">
                      {hoveredCell.rowLabel} vs {hoveredCell.colLabel}
                    </p>
                    <p className="text-slate-600 mt-1">Score: {hoveredCell.scoreText}</p>
                    <p className="text-slate-600 mt-1">{hoveredCell.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Escala:</span>
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <Badge key={value} className="border border-slate-200 bg-white px-2 py-1 font-mono" style={getCellStyle(value)}>
                {value}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
