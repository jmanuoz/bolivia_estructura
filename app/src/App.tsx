import { useState, useCallback, useEffect } from 'react';
import { GlobalHeatmapView } from '@/components/GlobalHeatmapView';
import { DendrogramVisualizer } from '@/components/DendrogramVisualizer';
import { Controls } from '@/components/Controls';
import { NodeDetails } from '@/components/NodeDetails';
import { ClusterHeatmaps } from '@/components/ClusterHeatmaps';
import { OverlapRanking } from '@/components/OverlapRanking';
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
const AUTH_USER = 'admin';
const AUTH_PASS = 'bolivia2026';
const AUTH_STORAGE_KEY = 'bolivia_auth_ok';

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

function alignNumericMatrixByLabels(
  sourceLabels: string[],
  sourceMatrix: number[][],
  targetLabels: string[]
): number[][] {
  const indexByLabel = new Map(
    sourceLabels.map((label, idx) => [normalizeLabel(label), idx])
  );

  return targetLabels.map((rowLabel) => {
    const rowIdx = indexByLabel.get(normalizeLabel(rowLabel));
    return targetLabels.map((colLabel) => {
      const colIdx = indexByLabel.get(normalizeLabel(colLabel));
      if (rowIdx === undefined || colIdx === undefined) return NaN;
      const value = sourceMatrix[rowIdx]?.[colIdx];
      return Number.isFinite(value) ? value : NaN;
    });
  });
}

function alignTextMatrixByLabels(
  sourceLabels: string[],
  sourceMatrix: string[][],
  targetLabels: string[]
): string[][] {
  const indexByLabel = new Map(
    sourceLabels.map((label, idx) => [normalizeLabel(label), idx])
  );

  return targetLabels.map((rowLabel) => {
    const rowIdx = indexByLabel.get(normalizeLabel(rowLabel));
    return targetLabels.map((colLabel) => {
      const colIdx = indexByLabel.get(normalizeLabel(colLabel));
      if (rowIdx === undefined || colIdx === undefined) return '';
      return sourceMatrix[rowIdx]?.[colIdx] ?? '';
    });
  });
}

function App() {
  const {
    data,
    treeData,
    cutThreshold,
    setCutThreshold,
    selectedNode,
    setSelectedNode,
    hoveredNode,
    setHoveredNode,
    loadData,
    handleNodeClick,
    stats
  } = useDendrogram();

  const [hasData, setHasData] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scoreMatrix, setScoreMatrix] = useState<number[][] | null>(null);
  const [explanationMatrix, setExplanationMatrix] = useState<string[][] | null>(null);
  const [pairwiseLabels, setPairwiseLabels] = useState<string[]>([]);
  const [pairwiseError, setPairwiseError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dendrograma' | 'heatmaps'>('dendrograma');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  });

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
        const canonicalLabels = parsed.labels.map((label) => label.trim());

        const alignedScores = alignNumericMatrixByLabels(
          parsedScores.labels,
          parsedScores.matrix,
          canonicalLabels
        );
        const alignedExplanations = alignTextMatrixByLabels(
          parsedExplanations.labels,
          parsedExplanations.matrix,
          canonicalLabels
        );

        setScoreMatrix(alignedScores);
        setExplanationMatrix(alignedExplanations);
        setPairwiseLabels(canonicalLabels);

        const scoreLabelSet = new Set(parsedScores.labels.map(normalizeLabel));
        const explanationLabelSet = new Set(parsedExplanations.labels.map(normalizeLabel));
        const missingInScores = canonicalLabels.filter((label) => !scoreLabelSet.has(normalizeLabel(label)));
        const missingInExplanations = canonicalLabels.filter((label) => !explanationLabelSet.has(normalizeLabel(label)));
        if (missingInScores.length > 0 || missingInExplanations.length > 0) {
          toast.warning('Hay unidades del dendrograma sin correspondencia en scores/explicaciones.');
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

  const handleLogin = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginUser.trim() === AUTH_USER && loginPass === AUTH_PASS) {
      setIsAuthenticated(true);
      setLoginError(null);
      window.localStorage.setItem(AUTH_STORAGE_KEY, '1');
      return;
    }
    setLoginError('Credenciales inválidas.');
  }, [loginUser, loginPass]);

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    setLoginUser('');
    setLoginPass('');
    setLoginError(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Toaster position="top-right" />
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <div>
            <h1 className="text-xl font-bold text-slate-900">Ingreso</h1>
            <p className="text-sm text-slate-600 mt-1">Acceso al análisis de superposiciones.</p>
          </div>

          <div>
            <label htmlFor="login-user" className="block text-sm font-medium text-slate-700 mb-1">
              Usuario
            </label>
            <input
              id="login-user"
              type="text"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="login-pass" className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <input
              id="login-pass"
              type="password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              autoComplete="current-password"
            />
          </div>

          {loginError && <p className="text-sm text-red-600">{loginError}</p>}

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 text-white py-2 text-sm font-medium hover:bg-slate-800"
          >
            Ingresar
          </button>
        </form>
      </div>
    );
  }

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
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 rounded-md bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
            >
              Cerrar sesión
            </button>
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
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => setActiveView('dendrograma')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeView === 'dendrograma'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Dendrograma
              </button>
              <button
                type="button"
                onClick={() => setActiveView('heatmaps')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeView === 'heatmaps'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Heatmaps
              </button>
            </div>

            {activeView === 'dendrograma' && treeData && stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                  <div className="xl:col-span-1 space-y-4">
                    <Controls
                      cutThreshold={cutThreshold}
                      maxThreshold={stats.maxDistance}
                      onThresholdChange={setCutThreshold}
                      stats={stats}
                    />
                    <NodeDetails
                      node={selectedNode}
                      onClose={() => setSelectedNode(null)}
                    />
                  </div>

                  <div className="xl:col-span-3">
                    <DendrogramVisualizer
                      root={treeData}
                      cutThreshold={cutThreshold}
                      onNodeClick={handleNodeClick}
                      onNodeHover={setHoveredNode}
                      hoveredNode={hoveredNode}
                    />
                  </div>
                </div>

                <OverlapRanking
                  root={treeData}
                  labels={overlapLabels}
                  scoreMatrix={scoreMatrix}
                  explanationMatrix={explanationMatrix}
                />

                <ClusterHeatmaps
                  root={treeData}
                  labels={overlapLabels}
                  scoreMatrix={scoreMatrix}
                  explanationMatrix={explanationMatrix}
                  error={pairwiseError}
                />
              </div>
            )}

            {activeView === 'heatmaps' && (
              <div className="space-y-6">
                <GlobalHeatmapView
                  labels={overlapLabels}
                  scoreMatrix={scoreMatrix}
                  explanationMatrix={explanationMatrix}
                  error={pairwiseError}
                />
              </div>
            )}
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
