import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '@/types/dendrogram';

interface DendrogramVisualizerProps {
  root: TreeNode;
  cutThreshold: number;
  onNodeClick: (node: TreeNode) => void;
  onNodeHover: (nodeId: number | null) => void;
  hoveredNode: number | null;
  width?: number;
  height?: number;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];
const LEAF_RADIUS = 4;
const INTERNAL_RADIUS = 3;
const MIN_VERTICAL_GAP_PX = 12;

export function DendrogramVisualizer({
  root,
  cutThreshold,
  onNodeClick,
  onNodeHover,
  hoveredNode,
  width = 900,
  height = 500
}: DendrogramVisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(width);
  const leafCount = useMemo(() => {
    let count = 0;
    function countLeaves(node: TreeNode) {
      if (!node.children || node.children.length === 0) {
        count++;
        return;
      }
      node.children.forEach(countLeaves);
    }
    countLeaves(root);
    return count;
  }, [root]);
  const computedWidth = Math.max(containerWidth, width, leafCount * 24);

  // Colores para clusters
  const getClusterColor = useCallback((clusterId: number) => {
    return COLORS[clusterId % COLORS.length];
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (!containerRef.current) return;
      setContainerWidth(containerRef.current.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !root) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 120, bottom: 220, left: 60 };
    const innerWidth = computedWidth - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Encontrar distancia máxima para escala
    const maxDistance = root.distance || 1;

    // Crear grupo principal
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Escalas
    const xScale = d3.scaleLinear()
      .domain([0, leafCount - 1])
      .range([0, innerWidth]);

    // Con datasets con muchas distancias cercanas a 0, una escala lineal aplasta
    // las ramas bajas y aparenta nodos "sueltos". Symlog preserva orden y las separa.
    const yScale = d3.scaleSymlog()
      .constant(Math.max(maxDistance / 120, 0.001))
      .domain([0, maxDistance])
      .range([innerHeight, 0]);

    // Asignar posiciones X a nodos hoja
    let leafIndex = 0;
    function assignXPositions(node: TreeNode): void {
      if (!node.children || node.children.length === 0) {
        node.x = xScale(leafIndex);
        node.y = yScale(0);
        leafIndex++;
        return;
      }
      node.children.forEach(assignXPositions);
      // Posición X es el promedio de hijos
      const childXs = node.children.map(c => c.x!);
      const childYs = node.children.map(c => c.y!);
      const rawY = yScale(node.distance);
      const minChildY = Math.min(...childYs);
      // El padre siempre debe quedar por encima (menor y en SVG) de ambos hijos.
      const separatedY = Math.min(rawY, minChildY - MIN_VERTICAL_GAP_PX);
      node.x = d3.mean(childXs) || 0;
      node.y = Math.max(0, separatedY);
    }
    assignXPositions(root);

    // Línea de corte
    const cutY = yScale(cutThreshold);
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', cutY)
      .attr('y2', cutY)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4')
      .attr('opacity', 0.7);

    g.append('text')
      .attr('x', innerWidth + 10)
      .attr('y', cutY + 4)
      .attr('fill', '#ef4444')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(`Corte: ${cutThreshold.toFixed(3)}`);

    // Función para dibujar líneas del dendrograma
    function drawLines(node: TreeNode) {
      if (!node.children || node.children.length === 0) return;

      const color = node.clusterId !== undefined ? getClusterColor(node.clusterId) : '#64748b';
      const isHighlighted = hoveredNode === node.id;
      const strokeWidth = isHighlighted ? 3 : 2;

      // Línea horizontal (conexión entre hijos)
      const leftChild = node.children[0];
      const rightChild = node.children[1];

      g.append('line')
        .attr('x1', leftChild.x!)
        .attr('x2', rightChild.x!)
        .attr('y1', node.y!)
        .attr('y2', node.y!)
        .attr('stroke', color)
        .attr('stroke-width', strokeWidth)
        .attr('class', `link-${node.id}`);

      // Líneas verticales a cada hijo
      node.children.forEach(child => {
        g.append('line')
          .attr('x1', child.x!)
          .attr('x2', child.x!)
          .attr('y1', node.y!)
          .attr('y2', child.y!)
          .attr('stroke', color)
          .attr('stroke-width', strokeWidth)
          .attr('class', `link-${child.id}`);
      });

      // Recursión
      node.children.forEach(drawLines);
    }

    // Dibujar líneas
    drawLines(root);

    let highlightedNode: TreeNode | null = null;

    // Dibujar nodos
    function drawNodes(node: TreeNode) {
      const isLeaf = !node.children || node.children.length === 0;
      const isHighlighted = hoveredNode === node.id;
      const color = node.clusterId !== undefined ? getClusterColor(node.clusterId) : '#64748b';

      g.append('circle')
        .attr('cx', node.x!)
        .attr('cy', node.y!)
        .attr('r', isLeaf ? LEAF_RADIUS : INTERNAL_RADIUS)
        .attr('fill', isLeaf ? color : '#fff')
        .attr('stroke', color)
        .attr('stroke-width', isHighlighted ? 3 : 2)
        .attr('cursor', 'pointer')
        .attr('class', `node-${node.id}`)
        .on('click', () => onNodeClick(node))
        .on('mouseenter', () => onNodeHover(node.id))
        .on('mouseleave', () => onNodeHover(null));

      // Etiqueta para nodos hoja
      if (isLeaf && node.name) {
        g.append('text')
          .attr('x', node.x!)
          .attr('y', innerHeight + 20)
          .attr('text-anchor', 'end')
          .attr('transform', `rotate(-45, ${node.x}, ${innerHeight + 20})`)
          .attr('font-size', '11px')
          .attr('fill', '#334155')
          .attr('font-weight', isHighlighted ? 'bold' : 'normal')
          .text(node.name);
      }

      if (isHighlighted) {
        highlightedNode = node;
      }

      if (node.children) {
        node.children.forEach(drawNodes);
      }
    }

    drawNodes(root);

    // Eje Y (distancia)
    const yAxis = d3.axisLeft(yScale)
      .ticks(8)
      .tickFormat((d) => Number(d).toFixed(2));

    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll('text')
      .attr('font-size', '11px')
      .attr('fill', '#64748b');

    g.select('.y-axis').selectAll('line, path')
      .attr('stroke', '#cbd5e1');

    // Etiqueta del eje Y
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -45)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .text('Distancia (coseno)');

    // Tooltip siempre al frente
    if (highlightedNode !== null) {
      const activeNode: TreeNode = highlightedNode;
      const tooltip = g.append('g')
        .attr('transform', `translate(${activeNode.x! + 10}, ${activeNode.y! - 30})`);

      tooltip.append('rect')
        .attr('width', 140)
        .attr('height', 40)
        .attr('rx', 6)
        .attr('fill', '#1e293b')
        .attr('opacity', 0.95);

      tooltip.append('text')
        .attr('x', 10)
        .attr('y', 18)
        .attr('fill', '#fff')
        .attr('font-size', '11px')
        .attr('font-weight', 'bold')
        .text(activeNode.name || `Cluster ${activeNode.clusterId}`);

      tooltip.append('text')
        .attr('x', 10)
        .attr('y', 32)
        .attr('fill', '#cbd5e1')
        .attr('font-size', '10px')
        .text(`Dist: ${activeNode.distance.toFixed(4)}`);
    }

  }, [root, cutThreshold, onNodeClick, onNodeHover, hoveredNode, computedWidth, height, getClusterColor, leafCount]);

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        width={computedWidth}
        height={height}
        className="block"
      />
    </div>
  );
}
