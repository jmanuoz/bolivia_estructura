import { useState, useCallback, useMemo } from 'react';
import type { DendrogramData, TreeNode, NodeDetails } from '@/types/dendrogram';

export function useDendrogram() {
  const [data, setData] = useState<DendrogramData | null>(null);
  const [cutThreshold, setCutThreshold] = useState<number>(0.5);
  const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  // Convertir linkage a estructura de árbol
  const buildTree = useCallback((linkage: number[][], labels: string[], contents?: string[]): TreeNode => {
    const n = labels.length;
    const nodes: Map<number, TreeNode> = new Map();

    // Crear nodos hoja
    for (let i = 0; i < n; i++) {
      nodes.set(i, {
        id: i,
        name: labels[i],
        content: contents?.[i],
        distance: 0,
        count: 1,
        children: []
      });
    }

    // Construir árbol desde el linkage
    for (let i = 0; i < linkage.length; i++) {
      const [left, right, distance, count] = linkage[i];
      const newNode: TreeNode = {
        id: n + i,
        distance,
        count,
        children: [nodes.get(left)!, nodes.get(right)!]
      };
      
      // Establecer referencias padre-hijo
      const leftNode = nodes.get(left)!;
      const rightNode = nodes.get(right)!;
      leftNode.parent = newNode;
      rightNode.parent = newNode;
      
      nodes.set(n + i, newNode);
    }

    return nodes.get(n + linkage.length - 1)!;
  }, []);

  // Asignar clusters basado en el punto de corte
  const assignClusters = useCallback((root: TreeNode, threshold: number): number => {
    let clusterId = 0;

    function assignToAllDescendants(node: TreeNode, cid: number): void {
      node.clusterId = cid;
      if (node.children) {
        node.children.forEach(child => assignToAllDescendants(child, cid));
      }
    }

    function traverse(node: TreeNode): void {
      const children = node.children;
      const isLeaf = !children || children.length === 0;
      const isClusterRoot = isLeaf || node.distance <= threshold;

      if (isClusterRoot) {
        assignToAllDescendants(node, clusterId);
        clusterId++;
        return;
      }

      children.forEach(traverse);
    }

    traverse(root);
    return clusterId;
  }, []);

  // Cargar datos
  const loadData = useCallback((newData: DendrogramData) => {
    setData(newData);
    // Encontrar distancia máxima para inicializar el threshold
    if (newData.linkage.length > 0) {
      const maxDist = Math.max(...newData.linkage.map(row => row[2]));
      setCutThreshold(maxDist * 0.5);
    }
  }, []);

  // Cargar datos de ejemplo
  const loadSampleData = useCallback(() => {
    const sampleLabels = [
      'Documento A', 'Documento B', 'Documento C', 'Documento D', 
      'Documento E', 'Documento F', 'Documento G', 'Documento H'
    ];
    const sampleContents = [
      'Análisis de ventas del primer trimestre',
      'Reporte de ventas Q1',
      'Estadísticas de marketing digital',
      'Campaña de redes sociales 2024',
      'Informe financiero anual',
      'Balance general y estados financieros',
      'Plan estratégico de recursos humanos',
      'Evaluación de desempeño del personal'
    ];
    
    // Linkage de ejemplo (similar a scipy)
    const sampleLinkage: number[][] = [
      [0, 1, 0.15, 2],
      [2, 3, 0.22, 2],
      [4, 5, 0.18, 2],
      [6, 7, 0.25, 2],
      [8, 9, 0.35, 4],
      [10, 11, 0.42, 4],
      [12, 13, 0.68, 8]
    ];

    loadData({
      linkage: sampleLinkage,
      labels: sampleLabels,
      contents: sampleContents
    });
  }, [loadData]);

  // Calcular árbol y clusters
  const treeData = useMemo(() => {
    if (!data) return null;
    const tree = buildTree(data.linkage, data.labels, data.contents);
    assignClusters(tree, cutThreshold);
    return tree;
  }, [data, buildTree, assignClusters, cutThreshold]);

  // Calcular estadísticas
  const stats = useMemo(() => {
    if (!data || !treeData) return null;
    
    const clusters = new Set<number>();
    function countClusters(node: TreeNode) {
      if (node.clusterId !== undefined) {
        clusters.add(node.clusterId);
      }
      if (node.children) {
        node.children.forEach(countClusters);
      }
    }
    countClusters(treeData);
    
    const maxDist = Math.max(...data.linkage.map(row => row[2]));
    
    return {
      totalNodes: data.labels.length,
      totalMerges: data.linkage.length,
      maxDistance: maxDist,
      numClusters: clusters.size,
      currentThreshold: cutThreshold
    };
  }, [data, treeData, cutThreshold]);

  // Manejar clic en nodo
  const handleNodeClick = useCallback((node: TreeNode) => {
    setSelectedNode({
      id: node.id,
      name: node.name || `Cluster ${node.clusterId}`,
      content: node.content,
      distance: node.distance,
      clusterId: node.clusterId || 0,
      isLeaf: !node.children || node.children.length === 0
    });
  }, []);

  return {
    data,
    treeData,
    cutThreshold,
    setCutThreshold,
    selectedNode,
    setSelectedNode,
    hoveredNode,
    setHoveredNode,
    loadData,
    loadSampleData,
    handleNodeClick,
    stats
  };
}
