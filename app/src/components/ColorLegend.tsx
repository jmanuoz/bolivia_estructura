import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette } from 'lucide-react';

const COLORS = [
  { color: '#3b82f6', name: 'Azul' },
  { color: '#ef4444', name: 'Rojo' },
  { color: '#10b981', name: 'Verde' },
  { color: '#f59e0b', name: 'Ámbar' },
  { color: '#8b5cf6', name: 'Violeta' },
  { color: '#ec4899', name: 'Rosa' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#84cc16', name: 'Lima' },
  { color: '#f97316', name: 'Naranja' },
  { color: '#6366f1', name: 'Índigo' },
];

interface ColorLegendProps {
  numClusters: number;
}

export function ColorLegend({ numClusters }: ColorLegendProps) {
  const activeColors = COLORS.slice(0, Math.min(numClusters, COLORS.length));

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="w-5 h-5" />
          Leyenda de Clusters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {activeColors.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-md"
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-sm font-medium text-slate-700">
                Cluster {i}
              </span>
            </div>
          ))}
        </div>
        {numClusters > COLORS.length && (
          <p className="text-xs text-slate-500 mt-3">
            +{numClusters - COLORS.length} clusters más (colores se repiten)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
