import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileJson, AlertCircle } from 'lucide-react';
import type { DendrogramData } from '@/types/dendrogram';

interface DataLoaderProps {
  onDataLoad: (data: DendrogramData) => void;
  onLoadSample: () => void;
}

export function DataLoader({ onDataLoad, onLoadSample }: DataLoaderProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        setJsonInput(content);
        parseAndLoad(content);
      } catch (err) {
        setError('Error al leer el archivo');
      }
    };
    reader.readAsText(file);
  }, []);

  const parseAndLoad = useCallback((content: string) => {
    try {
      setError(null);
      const parsed = JSON.parse(content);
      
      // Validar estructura
      if (!parsed.linkage || !Array.isArray(parsed.linkage)) {
        throw new Error('El campo "linkage" es requerido y debe ser un array');
      }
      if (!parsed.labels || !Array.isArray(parsed.labels)) {
        throw new Error('El campo "labels" es requerido y debe ser un array');
      }

      // Validar formato de linkage
      for (let i = 0; i < parsed.linkage.length; i++) {
        const row = parsed.linkage[i];
        if (!Array.isArray(row) || row.length !== 4) {
          throw new Error(`Fila ${i} del linkage debe tener 4 valores: [left, right, distance, count]`);
        }
      }

      onDataLoad({
        linkage: parsed.linkage,
        labels: parsed.labels,
        contents: parsed.contents
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al parsear JSON');
    }
  }, [onDataLoad]);

  const handleLoadFromTextarea = useCallback(() => {
    if (jsonInput.trim()) {
      parseAndLoad(jsonInput);
    }
  }, [jsonInput, parseAndLoad]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="w-5 h-5" />
          Cargar Datos del Dendrograma
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onLoadSample}
            className="flex-1"
          >
            Usar Datos de Ejemplo
          </Button>
          <label className="flex-1">
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Subir JSON
              </span>
            </Button>
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            O pegar JSON directamente:
          </label>
          <Textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={`{
  "linkage": [[0, 1, 0.15, 2], [2, 3, 0.22, 2], ...],
  "labels": ["Doc A", "Doc B", "Doc C", ...],
  "contents": ["Contenido A", "Contenido B", ...]
}`}
            className="font-mono text-sm min-h-[150px]"
          />
          <Button
            onClick={handleLoadFromTextarea}
            disabled={!jsonInput.trim()}
            className="w-full"
          >
            Cargar desde Texto
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="p-3 bg-slate-50 rounded-md">
          <p className="text-xs text-slate-600 font-medium mb-1">Formato esperado:</p>
          <code className="text-xs text-slate-500 block">
            {`{
  "linkage": [[left, right, distance, count], ...],
  "labels": ["nombre1", "nombre2", ...],
  "contents": ["contenido1", "contenido2", ...]  // opcional
}`}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
