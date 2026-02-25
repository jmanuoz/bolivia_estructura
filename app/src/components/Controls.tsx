import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Settings2, BarChart3, Layers, Ruler, Circle } from 'lucide-react';

interface ControlsProps {
  cutThreshold: number;
  maxThreshold: number;
  onThresholdChange: (value: number) => void;
  stats: {
    totalNodes: number;
    totalMerges: number;
    maxDistance: number;
    numClusters: number;
    currentThreshold: number;
  } | null;
}

export function Controls({
  cutThreshold,
  maxThreshold,
  onThresholdChange,
  stats
}: ControlsProps) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="w-4 h-4" />
          Controles
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-2 pb-4">
        {/* Slider de punto de corte */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Punto de Corte
            </label>
            <Badge variant="outline" className="font-mono">
              {cutThreshold.toFixed(4)}
            </Badge>
          </div>
          <Slider
            value={[cutThreshold]}
            onValueChange={([value]) => onThresholdChange(value)}
            min={0}
            max={maxThreshold}
            step={maxThreshold / 1000}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>0</span>
            <span>{(maxThreshold * 0.25).toFixed(3)}</span>
            <span>{(maxThreshold * 0.5).toFixed(3)}</span>
            <span>{(maxThreshold * 0.75).toFixed(3)}</span>
            <span>{maxThreshold.toFixed(3)}</span>
          </div>
          <p className="text-xs text-slate-500">
            Ajusta el umbral para colorear los clusters. Los nodos por debajo de este valor se agrupan.
          </p>
        </div>

        {/* Estadísticas */}
        {stats && (
          <div className="space-y-2.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Estadísticas
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 p-2.5 rounded-md">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <Circle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Unidades de Gobierno</span>
                </div>
                <p className="text-xl font-bold leading-none text-blue-700">{stats.totalNodes}</p>
              </div>

              <div className="bg-purple-50 p-2.5 rounded-md">
                <div className="flex items-center gap-2 text-purple-600 mb-1">
                  <Ruler className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Distancia seleccionada</span>
                </div>
                <p className="text-xl font-bold leading-none text-purple-700">
                  {stats.currentThreshold.toFixed(3)}
                </p>
              </div>

              <div className="bg-amber-50 p-2.5 rounded-md">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <Ruler className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Dist. Máx</span>
                </div>
                <p className="text-xl font-bold leading-none text-amber-700">
                  {stats.maxDistance.toFixed(3)}
                </p>
              </div>

              <div className="bg-emerald-50 p-2.5 rounded-md">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <Layers className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Clusters</span>
                </div>
                <p className="text-xl font-bold leading-none text-emerald-700">{stats.numClusters}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
