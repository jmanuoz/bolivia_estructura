import { useState, useCallback, useEffect } from 'react';
import { GlobalHeatmapView } from '@/components/GlobalHeatmapView';
import { Toaster } from '@/components/ui/sonner';
import { Database, Download } from 'lucide-react';
import { createResultsWorkbook, downloadFile } from '@/lib/exportResults';
import { formatUnitLabel } from '@/lib/unitLabels';
import { DASHBOARD_CONFIG } from '@/lib/dashboardConfig';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface MatrixLayout {
  labels: string[];
  dataRows: string[][];
  rowLabelColumn: number;
  firstDataColumn: number;
}

const normalizeLabel = (value?: string) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u0096\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const AUTH_USER = 'admin';
const AUTH_PASS = DASHBOARD_CONFIG.authPassword;
const AUTH_STORAGE_KEY = DASHBOARD_CONFIG.authStorageKey;
const workbookUrls = {
  'superposiciones_mexico_scores.xlsx': new URL('../data/superposiciones_mexico_scores.xlsx', import.meta.url).href,
  'superposiciones_mexico_explicaciones.xlsx': new URL('../data/superposiciones_mexico_explicaciones.xlsx', import.meta.url).href,
  'Base unidades final Mexico.xlsx': new URL('../data/Base unidades final Mexico.xlsx', import.meta.url).href
} as const;
const scoreWorkbookUrl = workbookUrls[DASHBOARD_CONFIG.scoreWorkbook];
const explanationWorkbookUrl = workbookUrls[DASHBOARD_CONFIG.explanationWorkbook];
const unitBaseWorkbookUrl = workbookUrls[DASHBOARD_CONFIG.unitBaseWorkbook];

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

  const labels = header.slice(firstDataColumn).map(formatUnitLabel);

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
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scoreMatrix, setScoreMatrix] = useState<number[][] | null>(null);
  const [explanationMatrix, setExplanationMatrix] = useState<string[][] | null>(null);
  const [pairwiseLabels, setPairwiseLabels] = useState<string[]>([]);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  });

  const parseScoreMatrix = useCallback((rows: string[][]): { labels: string[]; matrix: number[][] } => {
    const { labels, dataRows, rowLabelColumn, firstDataColumn } = detectMatrixLayout(rows);

    const isAlignedByOrder =
      dataRows.length >= labels.length &&
      labels.every((label, rowIdx) => normalizeLabel(dataRows[rowIdx]?.[rowLabelColumn]) === normalizeLabel(label));

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

  const parseExplanationMatrix = useCallback((rows: string[][]): { labels: string[]; matrix: string[][] } => {
    const { labels, dataRows, rowLabelColumn, firstDataColumn } = detectMatrixLayout(rows);

    const isAlignedByOrder =
      dataRows.length >= labels.length &&
      labels.every((label, rowIdx) => normalizeLabel(dataRows[rowIdx]?.[rowLabelColumn]) === normalizeLabel(label));

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

  const loadLocalData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [scoreResponse, explanationResponse, unitBaseResponse] = await Promise.all([
        fetch(scoreWorkbookUrl),
        fetch(explanationWorkbookUrl),
        fetch(unitBaseWorkbookUrl)
      ]);

      if (!scoreResponse.ok) {
        throw new Error(`No se pudo cargar ${DASHBOARD_CONFIG.scoreWorkbook}`);
      }
      if (!explanationResponse.ok) {
        throw new Error(`No se pudo cargar ${DASHBOARD_CONFIG.explanationWorkbook}`);
      }
      if (!unitBaseResponse.ok) {
        throw new Error(`No se pudo cargar ${DASHBOARD_CONFIG.unitBaseWorkbook}`);
      }

      const [scoreBuffer, explanationBuffer] = await Promise.all([
        scoreResponse.arrayBuffer(),
        explanationResponse.arrayBuffer()
      ]);
      const scoreWorkbook = XLSX.read(scoreBuffer);
      const explanationWorkbook = XLSX.read(explanationBuffer);

      const sheetToRows = (workbook: XLSX.WorkBook, workbookName: string, sheetName: string): string[][] => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          throw new Error(`No se encontró la hoja "${sheetName}" en ${workbookName}`);
        }
        return XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: ''
        });
      };

      const parsedScores = parseScoreMatrix(sheetToRows(scoreWorkbook, DASHBOARD_CONFIG.scoreWorkbook, 'scores'));
      const parsedExplanations = parseExplanationMatrix(
        sheetToRows(explanationWorkbook, DASHBOARD_CONFIG.explanationWorkbook, 'explicaciones')
      );
      const canonicalLabels = parsedScores.labels;

      const alignedExplanations = alignTextMatrixByLabels(
        parsedExplanations.labels,
        parsedExplanations.matrix,
        canonicalLabels
      );

      setScoreMatrix(parsedScores.matrix);
      setExplanationMatrix(alignedExplanations);
      setPairwiseLabels(canonicalLabels);

      const explanationLabelSet = new Set(parsedExplanations.labels.map(normalizeLabel));
      const missingInExplanations = canonicalLabels.filter((label) => !explanationLabelSet.has(normalizeLabel(label)));
      if (missingInExplanations.length > 0) {
        toast.warning('Hay unidades de scores sin correspondencia en explicaciones.');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Error al cargar matrices XLSX');
      setScoreMatrix(null);
      setExplanationMatrix(null);
      setPairwiseLabels([]);
      toast.error('No se pudieron cargar los archivos de México');
    } finally {
      setIsLoading(false);
    }
  }, [parseScoreMatrix, parseExplanationMatrix]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  const hasData = scoreMatrix !== null && explanationMatrix !== null && pairwiseLabels.length > 0;

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

  const handleExportResults = useCallback(async () => {
    if (!scoreMatrix || !explanationMatrix || pairwiseLabels.length === 0) {
      toast.error('No hay datos para exportar.');
      return;
    }

    try {
      const workbook = createResultsWorkbook({
        labels: pairwiseLabels,
        scoreMatrix,
        explanationMatrix
      });

      XLSX.writeFile(workbook, 'scores_y_superposiciones.xlsx');
      toast.success('Archivo exportado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron exportar los archivos.');
    }
  }, [scoreMatrix, explanationMatrix, pairwiseLabels]);

  const handleDownloadUnitBase = useCallback(() => {
    downloadFile(unitBaseWorkbookUrl, DASHBOARD_CONFIG.unitBaseWorkbook);
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
                className="inline-flex h-9 w-12 flex-row overflow-hidden rounded-md border border-slate-300"
                aria-label="Bandera de México"
                title={DASHBOARD_CONFIG.countryDisplayName}
              >
                <span className="h-full w-1/3 bg-green-700" />
                <span className="h-full w-1/3 bg-white" />
                <span className="h-full w-1/3 bg-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Análisis de superposiciones en el gobierno de {DASHBOARD_CONFIG.countryDisplayName}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasData && (
                <button
                  type="button"
                  onClick={handleExportResults}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"
                >
                  <Download className="h-4 w-4" />
                  Exportar resultados
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadUnitBase}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <Database className="h-4 w-4" />
                Base de unidades
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-md bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              >
                Cerrar sesión
              </button>
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
                Se utiliza el archivo local{' '}
                <code className="bg-slate-100 px-1 py-0.5 rounded">data/{DASHBOARD_CONFIG.scoreWorkbook}</code>{' '}
                y{' '}
                <code className="bg-slate-100 px-1 py-0.5 rounded">data/{DASHBOARD_CONFIG.explanationWorkbook}</code>.
                La base de unidades se toma de{' '}
                <code className="bg-slate-100 px-1 py-0.5 rounded">data/{DASHBOARD_CONFIG.unitBaseWorkbook}</code>.
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
          <GlobalHeatmapView
            labels={pairwiseLabels}
            scoreMatrix={scoreMatrix}
            explanationMatrix={explanationMatrix}
            error={loadError}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="w-full py-4">
          <p className="text-center text-sm text-slate-500">
            Visualizador de superposiciones • Heatmaps con D3.js y React
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
