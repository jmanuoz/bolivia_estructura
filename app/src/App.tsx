import { useState, useCallback, useEffect } from 'react';
import { GlobalHeatmapView } from '@/components/GlobalHeatmapView';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { csvParse } from 'd3';
import type { WorkSheet } from 'xlsx';

interface PeruFunctionRow {
  unidad?: string;
  ministerio?: string;
  funciones?: string;
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
const AUTH_PASS = 'peru2026';
const AUTH_STORAGE_KEY = 'peru_auth_ok';

function getPeruContents(rows: PeruFunctionRow[], labels: string[]): string[] {
  const rowsByUnit = new Map<string, PeruFunctionRow[]>();
  for (const row of rows) {
    const unit = normalizeLabel(row.unidad);
    if (!unit) continue;
    const matches = rowsByUnit.get(unit) ?? [];
    matches.push(row);
    rowsByUnit.set(unit, matches);
  }

  const usedByUnit = new Map<string, Set<number>>();

  return labels.map((label) => {
    const [unitPart, ministryPart] = label.split('|').map((part) => part.trim());
    const unit = normalizeLabel(unitPart);
    const ministry = normalizeLabel(ministryPart);
    const candidates = rowsByUnit.get(unit) ?? [];
    const used = usedByUnit.get(unit) ?? new Set<number>();

    let candidateIndex = candidates.findIndex((row, idx) =>
      !used.has(idx) && ministry && normalizeLabel(row.ministerio) === ministry
    );
    if (candidateIndex < 0) {
      candidateIndex = candidates.findIndex((_, idx) => !used.has(idx));
    }
    if (candidateIndex < 0 && candidates.length > 0) candidateIndex = 0;

    if (candidateIndex >= 0) {
      used.add(candidateIndex);
      usedByUnit.set(unit, used);
      return candidates[candidateIndex]?.funciones?.trim() ?? '';
    }
    return '';
  });
}

function App() {
  const [hasData, setHasData] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scoreMatrix, setScoreMatrix] = useState<number[][] | null>(null);
  const [explanationMatrix, setExplanationMatrix] = useState<string[][] | null>(null);
  const [pairwiseLabels, setPairwiseLabels] = useState<string[]>([]);
  const [pairwiseError, setPairwiseError] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  });

  const loadLocalData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setPairwiseError(null);
    try {
      const workbookUrl = new URL('../data/matrices_superposicion_pares.xlsx', import.meta.url);
      const functionsUrl = new URL('../data/funcionesPeru.csv', import.meta.url);
      const [workbookResponse, functionsResponse] = await Promise.all([
        fetch(workbookUrl),
        fetch(functionsUrl)
      ]);

      if (!workbookResponse.ok || !functionsResponse.ok) {
        throw new Error('No se pudieron cargar los archivos de análisis de Perú.');
      }

      const [workbookBuffer, functionsText] = await Promise.all([
        workbookResponse.arrayBuffer(),
        functionsResponse.text()
      ]);
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(workbookBuffer, { type: 'array' });
      const scoreSheet = workbook.Sheets.scores;
      const explanationSheet = workbook.Sheets.explicaciones;
      if (!scoreSheet || !explanationSheet) {
        throw new Error('El Excel debe contener las hojas "scores" y "explicaciones".');
      }

      const worksheetRows = (sheet: WorkSheet): unknown[][] =>
        XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: ''
        });
      const scoreRows = worksheetRows(scoreSheet);
      const explanationRows = worksheetRows(explanationSheet);
      const labels = scoreRows[0]?.slice(1).map((value) => String(value).trim()).filter(Boolean) ?? [];
      const explanationLabels = explanationRows[0]?.slice(1).map((value) => String(value).trim()) ?? [];
      if (labels.length === 0 || explanationLabels.length !== labels.length) {
        throw new Error('Las matrices del Excel no tienen dimensiones compatibles.');
      }

      const scores = scoreRows.slice(1, labels.length + 1).map((row) =>
        row.slice(1, labels.length + 1).map((value) => {
          const score = Number(value);
          return Number.isFinite(score) ? score : NaN;
        })
      );
      const explanations = explanationRows.slice(1, labels.length + 1).map((row) =>
        row.slice(1, labels.length + 1).map((value) => String(value ?? ''))
      );
      const functions = csvParse(functionsText) as unknown as PeruFunctionRow[];
      const contents = getPeruContents(functions, labels);

      setScoreMatrix(scores);
      setExplanationMatrix(explanations);
      setPairwiseLabels(labels);
      setHasData(true);

      const missingContents = contents.filter((content) => !content).length;
      if (missingContents > 0) {
        toast.warning(`${missingContents} unidades no tienen funciones asociadas en funcionesPeru.csv.`);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Error al cargar datos locales');
      setHasData(false);
      setScoreMatrix(null);
      setExplanationMatrix(null);
      setPairwiseLabels([]);
      toast.error('No se pudieron cargar los datos de Perú');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadLocalData();
  }, [isAuthenticated, loadLocalData]);

  const overlapLabels = pairwiseLabels;

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
                className="inline-flex h-9 w-12 flex-row overflow-hidden rounded-md border border-slate-300"
                aria-label="Bandera del Perú"
                title="Perú"
              >
                <span className="w-1/3 bg-red-600" />
                <span className="w-1/3 bg-white" />
                <span className="w-1/3 bg-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Análisis de superposiciones en el gobierno del Perú
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
                Se utilizan <code className="bg-slate-100 px-1 py-0.5 rounded">funcionesPeru.csv</code> y{' '}
                <code className="bg-slate-100 px-1 py-0.5 rounded">matrices_superposicion_pares.xlsx</code>.
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
            Visualizador de superposiciones • Heatmaps con D3.js y React
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
