import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, FileText, GitBranch, Hash, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NodeDetails as NodeDetailsType } from '@/types/dendrogram';

interface NodeDetailsProps {
  node: NodeDetailsType | null;
  onClose: () => void;
  clusterColor?: string;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export function NodeDetails({ node, onClose, clusterColor }: NodeDetailsProps) {
  if (!node) {
    return (
      <Card className="w-full h-full min-h-[200px] flex items-center justify-center">
        <div className="text-center text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Haz clic en un nodo para ver sus detalles</p>
        </div>
      </Card>
    );
  }

  const color = clusterColor || COLORS[node.clusterId % COLORS.length];

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: color }}
            />
            Detalles del Nodo
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Nombre
          </label>
          <p className="text-lg font-semibold text-slate-800 mt-1">
            {node.name}
          </p>
        </div>

        {node.content && (
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Función
            </label>
            <p className="text-sm text-slate-700 mt-1 bg-slate-50 p-3 rounded-md">
              {node.content}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 p-3 rounded-md">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Hash className="w-4 h-4" />
              <span className="text-xs font-medium">ID</span>
            </div>
            <p className="text-lg font-semibold text-slate-800">{node.id}</p>
          </div>

          <div className="bg-slate-50 p-3 rounded-md">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <GitBranch className="w-4 h-4" />
              <span className="text-xs font-medium">Distancia</span>
            </div>
            <p className="text-lg font-semibold text-slate-800">
              {node.distance.toFixed(4)}
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-md">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Layers className="w-4 h-4" />
              <span className="text-xs font-medium">Cluster</span>
            </div>
            <Badge
              style={{ backgroundColor: color }}
              className="text-white font-semibold"
            >
              #{node.clusterId}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Badge variant={node.isLeaf ? 'default' : 'secondary'}>
            {node.isLeaf ? '🍃 Nodo Hoja' : '🔀 Nodo Interno'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
