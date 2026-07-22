import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search, Trophy } from 'lucide-react';
import {
  compareDecentralizedFirst,
  isDecentralizedUnit,
  normalizeUnitLabel
} from '@/lib/unitLabels';

interface DecentralizedOverlapRankingProps {
  labels: string[];
  scoreMatrix: number[][] | null;
  explanationMatrix: string[][] | null;
}

interface UnitOverlapCount {
  idx: number;
  label: string;
  veryHighCount: number;
  highCount: number;
  total: number;
}

interface OverlapPeer {
  idx: number;
  label: string;
  score: number;
  explanation: string;
}

const HIGH_SCORE = 4;
const VERY_HIGH_SCORE = 5;

function compactLabel(value: string, max = 62): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function DecentralizedOverlapRanking({
  labels,
  scoreMatrix,
  explanationMatrix
}: DecentralizedOverlapRankingProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const ranking = useMemo<UnitOverlapCount[]>(() => {
    if (!scoreMatrix || labels.length === 0) return [];

    const n = Math.min(labels.length, scoreMatrix.length);
    const rows: UnitOverlapCount[] = [];

    for (let i = 0; i < n; i++) {
      const label = labels[i] ?? `Unidad ${i}`;
      if (!isDecentralizedUnit(label)) continue;

      const row = scoreMatrix[i] ?? [];
      let veryHighCount = 0;
      let highCount = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const value = row[j];
        if (!Number.isFinite(value)) continue;
        if (value === VERY_HIGH_SCORE) veryHighCount++;
        else if (value === HIGH_SCORE) highCount++;
      }

      rows.push({
        idx: i,
        label,
        veryHighCount,
        highCount,
        total: veryHighCount + highCount
      });
    }

    return rows.sort(
      (a, b) =>
        b.total - a.total ||
        b.veryHighCount - a.veryHighCount ||
        a.label.localeCompare(b.label, 'es')
    );
  }, [scoreMatrix, labels]);

  const filteredRanking = useMemo(() => {
    const query = normalizeUnitLabel(searchQuery);
    if (!query) return ranking;
    return ranking.filter((item) => normalizeUnitLabel(item.label).includes(query));
  }, [ranking, searchQuery]);

  const expandedPeers = useMemo<OverlapPeer[]>(() => {
    if (!scoreMatrix || expandedIdx === null) return [];

    const n = Math.min(labels.length, scoreMatrix.length);
    const row = scoreMatrix[expandedIdx] ?? [];
    const peers: OverlapPeer[] = [];

    for (let j = 0; j < n; j++) {
      if (j === expandedIdx) continue;
      const value = row[j];
      if (value !== HIGH_SCORE && value !== VERY_HIGH_SCORE) continue;

      peers.push({
        idx: j,
        label: labels[j] ?? `Unidad ${j}`,
        score: value,
        explanation:
          explanationMatrix?.[expandedIdx]?.[j] ||
          explanationMatrix?.[j]?.[expandedIdx] ||
          'Sin explicación disponible.'
      });
    }

    return peers.sort(compareDecentralizedFirst);
  }, [scoreMatrix, explanationMatrix, labels, expandedIdx]);

  if (!scoreMatrix || ranking.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="pb-3 bg-slate-50/70 border-b border-slate-200">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="w-4 h-4 text-blue-700" />
          Unidades descentralizadas con más superposiciones altas y muy altas
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          Considera únicamente entidades descentralizadas (excluye ministerios, viceministerios y empresas
          públicas). Alta = score 4, Muy alta = score 5.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar unidad"
            className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="space-y-2">
          {filteredRanking.map((item) => {
            const isExpanded = expandedIdx === item.idx;
            const position = ranking.findIndex((rankedItem) => rankedItem.idx === item.idx);
            return (
              <div
                key={item.idx}
                className={`rounded-md border bg-white transition-colors ${
                  isExpanded ? 'border-blue-300' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedIdx((current) => (current === item.idx ? null : item.idx))}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded-md ${
                    isExpanded ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                    <p className="text-sm font-semibold text-slate-800">
                      #{position + 1} {compactLabel(item.label, 72)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="bg-orange-500 text-white font-mono hover:bg-orange-500">
                      Alta: {item.highCount}
                    </Badge>
                    <Badge className="bg-rose-600 text-white font-mono hover:bg-rose-600">
                      Muy alta: {item.veryHighCount}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      Total: {item.total}
                    </Badge>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-2">
                    {expandedPeers.map((peer) => (
                      <div
                        key={`${item.idx}-${peer.idx}`}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-slate-700">{compactLabel(peer.label, 90)}</p>
                          <Badge
                            className={`shrink-0 font-mono text-white ${
                              peer.score === VERY_HIGH_SCORE
                                ? 'bg-rose-600 hover:bg-rose-600'
                                : 'bg-orange-500 hover:bg-orange-500'
                            }`}
                          >
                            {peer.score.toFixed(2)}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{peer.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredRanking.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No se encontraron unidades para esa búsqueda.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
