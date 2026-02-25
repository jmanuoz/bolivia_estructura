import { useState, useCallback, useEffect } from 'react';
import { GlobalHeatmapView } from '@/components/GlobalHeatmapView';
import { useDendrogram } from '@/hooks/useDendrogram';
import type { DendrogramData } from '@/types/dendrogram';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { csvParseRows } from 'd3';

interface MatrixLayout {
  labels: string[];
  dataRows: string[][];
  rowLabelColumn: number;
  firstDataColumn: number;
}

const normalizeLabel = (value?: string) => value?.trim() ?? '';

function detectMatrixLayout(rows: string[][]): MatrixLayout {
  const header = rows[0] ?? [];
  const dataRows = rows.slice(1).filter((row) => row.length > 0);

  let rowLabelColumn = 0;
  let firstDataColumn = header[0]?.trim() === '' ? 1 : 0;

  const firstDataRow = dataRows[0];
  if (firstDataRow) {
    for (let colIdx = 0; colIdx < firstDataRow.length; colIdx++) {
      const candidate = normalizeLabel(firstDataRow[colIdx]);
      if (!candidate) continue;

      const headerIdx = header.findIndex((value) => normalizeLabel(value) === candidate);
      if (headerIdx >= 0) {
        rowLabelColumn = colIdx;
        firstDataColumn = headerIdx;
        break;
      }
    }
  }

  const labels = header.slice(firstDataColumn).map(normalizeLabel);

  return {
    labels,
    dataRows,
    rowLabelColumn,
    firstDataColumn
  };
}

function parseScoreValue(rawValue?: string): number {
  const raw = rawValue?.trim() ?? '';
  if (!raw) return NaN;

  const num = Number(raw.includes(',') ? raw.replace(',', '.') : raw);
  return Number.isFinite(num) ? num : NaN;
}

function App() {
  const {
    data,
    loadData,
  } = useDendrogram();

  const [hasData, setHasData] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scoreMatrix, setScoreMatrix] = useState<number[][] | null>(null);
  const [explanationMatrix, setExplanationMatrix] = useState<string[][] | null>(null);
  const [pairwiseLabels, setPairwiseLabels] = useState<string[]>([]);
  const [pairwiseError, setPairwiseError] = useState<string | null>(null);

  const parseScoreMatrix = useCallback((csvText: string): { labels: string[]; matrix: number[][] } => {
    const rows = csvParseRows(csvText);
    const { labels, dataRows, rowLabelColumn, firstDataColumn } = detectMatrixLayout(rows);

    const isAlignedByOrder =
      dataRows.length >= labels.length &&
      labels.every((label, rowIdx) => normalizeLabel(dataRows[rowIdx]?.[rowLabelColumn]) === label);

    const matrix = isAlignedByOrder
      ? labels.map((_, rowIdx) => {
          const row = dataRows[rowIdx] ?? [];
          return labels.map((__, colIdx) => parseScoreValue(row[firstDataColumn + colIdx]));
        })
      : (() => {
          const rowByLabel = new Map(
            dataRows.map((row) => [normalizeLabel(row[rowLabelColumn]), row])
          );

          return labels.map((label) => {
            const rowValues = rowByLabel.get(label);
            return labels.map((_, colIdx) => parseScoreValue(rowValues?.[firstDataColumn + colIdx]));
          });
        })();

    return { labels, matrix };
  }, []);

  const parseExplanationMatrix = useCallback((csvText: string): { labels: string[]; matrix: string[][] } => {
    const rows = csvParseRows(csvText);
    const { labels, dataRows, rowLabelColumn, firstDataColumn } = detectMatrixLayout(rows);

    const isAlignedByOrder =
      dataRows.length >= labels.length &&
      labels.every((label, rowIdx) => normalizeLabel(dataRows[rowIdx]?.[rowLabelColumn]) === label);

    const matrix = isAlignedByOrder
      ? labels.map((_, rowIdx) => {
          const row = dataRows[rowIdx] ?? [];
          return labels.map((__, colIdx) => row[firstDataColumn + colIdx] ?? '');
        })
      : (() => {
          const rowByLabel = new Map(
            dataRows.map((row) => [normalizeLabel(row[rowLabelColumn]), row])
          );

          return labels.map((label) => {
            const rowValues = rowByLabel.get(label);
            return labels.map((_, colIdx) => rowValues?.[firstDataColumn + colIdx] ?? '');
          });
        })();

    return { labels, matrix };
  }, []);

  const handleLoadData = useCallback((data: DendrogramData) => {
    loadData(data);
    setHasData(true);
  }, [loadData]);

  const loadLocalData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setPairwiseError(null);
    try {
      const dataUrl = new URL('../data/dendrogram_data.json', import.meta.url);
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`No se pudo cargar el archivo local (HTTP ${response.status})`);
      }
      const parsed = (await response.json()) as DendrogramData;
      handleLoadData(parsed);

      try {
        const scoresUrl = new URL('../data/scores.csv', import.meta.url);
        const explanationsUrl = new URL('../data/explicaciones.csv', import.meta.url);

        const [scoresResponse, explanationsResponse] = await Promise.all([
          fetch(scoresUrl),
          fetch(explanationsUrl)
        ]);

        if (!scoresResponse.ok || !explanationsResponse.ok) {
          throw new Error('No se pudieron cargar scores.csv y/o explicaciones.csv');
        }

        const [scoresText, explanationsText] = await Promise.all([
          scoresResponse.text(),
          explanationsResponse.text()
        ]);

        const parsedScores = parseScoreMatrix(scoresText);
        const parsedExplanations = parseExplanationMatrix(explanationsText);

        setScoreMatrix(parsedScores.matrix);
        setExplanationMatrix(parsedExplanations.matrix);
        setPairwiseLabels(parsedScores.labels);

        if (
          parsedScores.labels.length !== parsedExplanations.labels.length ||
          parsedScores.matrix.length !== parsedExplanations.matrix.length
        ) {
          toast.warning('Las matrices de scores y explicaciones tienen tamaños distintos.');
        }
      } catch (error) {
        setPairwiseError(error instanceof Error ? error.message : 'Error al cargar matrices CSV');
        setScoreMatrix(null);
        setExplanationMatrix(null);
        setPairwiseLabels([]);
        toast.warning('No se pudieron cargar scores/explicaciones para el heatmap');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Error al cargar datos locales');
      setHasData(false);
      setScoreMatrix(null);
      setExplanationMatrix(null);
      setPairwiseLabels([]);
      toast.error('No se pudo cargar data/dendrogram_data.json');
    } finally {
      setIsLoading(false);
    }
  }, [handleLoadData, parseScoreMatrix, parseExplanationMatrix]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  const overlapLabels = pairwiseLabels.length > 0 ? pairwiseLabels : (data?.labels ?? []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="w-full py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="inline-flex h-9 w-12 flex-col overflow-hidden rounded-md border border-slate-300"
                aria-label="Bandera de Bolivia"
                title="Bolivia"
              >
                <span className="h-1/3 bg-red-600" />
                <span className="h-1/3 bg-yellow-400" />
                <span className="h-1/3 bg-green-700" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Análisis de superposiciones en el gobierno de Bolivia
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full py-6">
        {!hasData ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Carga automática de datos
              </h2>
              <p className="text-slate-600">
                Se utiliza el archivo local <code className="bg-slate-100 px-1 py-0.5 rounded">data/dendrogram_data.json</code>.
              </p>
            </div>

            <div className="mt-6 p-4 bg-slate-100 border border-slate-200 rounded-lg">
              <p className="text-sm text-slate-700">
                {isLoading ? 'Cargando datos...' : 'No hay datos cargados.'}
              </p>
              {loadError && (
                <p className="text-sm text-red-600 mt-2">{loadError}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <GlobalHeatmapView
              labels={overlapLabels}
              scoreMatrix={scoreMatrix}
              explanationMatrix={explanationMatrix}
              error={pairwiseError}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="w-full py-4">
          <p className="text-center text-sm text-slate-500">
            Visualizador de Dendrogramas Interactivo • Creado con D3.js y React
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
