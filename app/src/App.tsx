import { useState, useCallback, useEffect } from 'react';
import { DendrogramVisualizer } from '@/components/DendrogramVisualizer';
import { NodeDetails } from '@/components/NodeDetails';
import { Controls } from '@/components/Controls';
import { ClusterHeatmaps } from '@/components/ClusterHeatmaps';
import { OverlapRanking } from '@/components/OverlapRanking';
import { GlobalHeatmapView } from '@/components/GlobalHeatmapView';
import { useDendrogram } from '@/hooks/useDendrogram';
import type { DendrogramData, TreeNode } from '@/types/dendrogram';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { GitBranch, LayoutDashboard, Sparkles, Table2 } from 'lucide-react';
import { csvParseRows } from 'd3';

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

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
  const [activeView, setActiveView] = useState<'principal' | 'heatmap-completo'>('principal');

  const parseScoreMatrix = useCallback((csvText: string): { labels: string[]; matrix: number[][] } => {
    const rows = csvParseRows(csvText);
    const labels = (rows[0] ?? []).slice(1).map((value) => value.trim());
    const matrix = rows.slice(1).map((row) =>
      row.slice(1).map((value) => {
        const num = Number(value.trim());
        return Number.isFinite(num) ? num : NaN;
      })
    );
    return { labels, matrix };
  }, []);

  const parseExplanationMatrix = useCallback((csvText: string): { labels: string[]; matrix: string[][] } => {
    const rows = csvParseRows(csvText);
    const labels = (rows[0] ?? []).slice(1).map((value) => value.trim());
    const matrix = rows.slice(1).map((row) => row.slice(1).map((value) => value.trim()));
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

  const handleThresholdChange = useCallback((value: number) => {
    setCutThreshold(value);
  }, [setCutThreshold]);

  const handleNodeClickWrapper = useCallback((node: TreeNode) => {
    handleNodeClick(node);
  }, [handleNodeClick]);

  const maxThreshold = stats?.maxDistance || 1;

  const overlapLabels = pairwiseLabels.length > 0 ? pairwiseLabels : (data?.labels ?? []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="w-full py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2.5 rounded-lg">
                <GitBranch className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Dendrograma Interactivo Del Gobierno de Bolivia
                </h1>
                <p className="text-sm text-slate-500">
                  Visualización jerárquica con clustering dinámico
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                D3.js + React
              </span>
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
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView('principal')}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    activeView === 'principal'
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Vista principal
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('heatmap-completo')}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    activeView === 'heatmap-completo'
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Table2 className="w-4 h-4" />
                  Heatmap completo
                </button>
              </div>
            </div>

            {activeView === 'principal' ? (
              <>
            <div className="grid grid-cols-1 gap-4">
              <Controls
                cutThreshold={cutThreshold}
                maxThreshold={maxThreshold}
                onThresholdChange={handleThresholdChange}
                stats={stats}
              />
            </div>

            <div className="space-y-4">
              {/* Visualización del dendrograma */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Visualización del Dendrograma
                </h3>
                {treeData && (
                  <DendrogramVisualizer
                    root={treeData}
                    cutThreshold={cutThreshold}
                    onNodeClick={handleNodeClickWrapper}
                    onNodeHover={setHoveredNode}
                    hoveredNode={hoveredNode}
                    height={450}
                  />
                )}
              </div>

              {/* Panel de detalles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NodeDetails
                  node={selectedNode}
                  onClose={() => setSelectedNode(null)}
                  clusterColor={selectedNode ? COLORS[selectedNode.clusterId % COLORS.length] : undefined}
                />
                
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Instrucciones</h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                      <span><strong>Ajusta el punto de corte</strong> con el slider para ver cómo se forman los clusters</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                      <span><strong>Haz clic en cualquier nodo</strong> para ver su nombre y contenido</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                      <span><strong>Pasa el mouse sobre nodos</strong> para ver información rápida</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                      <span><strong>La línea roja punteada</strong> indica el umbral de corte actual</span>
                    </li>
                  </ul>
                </div>
              </div>

              <ClusterHeatmaps
                root={treeData}
                labels={overlapLabels}
                scoreMatrix={scoreMatrix}
                explanationMatrix={explanationMatrix}
                error={pairwiseError}
              />

              <OverlapRanking
                root={treeData}
                labels={overlapLabels}
                scoreMatrix={scoreMatrix}
                explanationMatrix={explanationMatrix}
              />
            </div>
              </>
            ) : (
              <GlobalHeatmapView
                labels={overlapLabels}
                scoreMatrix={scoreMatrix}
                explanationMatrix={explanationMatrix}
                error={pairwiseError}
              />
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
