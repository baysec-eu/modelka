import React from 'react';
import { Line } from 'react-konva';

interface GridLayerProps {
  rows: number;
  cols: number;
  cellSize: number;
}

/**
 * Renders a grid background using Konva Lines.
 */
export const GridLayer: React.FC<GridLayerProps> = ({ rows, cols, cellSize }) => (
  <>
    {/* Vertical lines */}
    {Array.from({ length: cols }).map((_, i) => (
      <Line
        key={`grid-v-${i}`}
        points={[i * cellSize, 0, i * cellSize, rows * cellSize]}
        stroke="#ccc"
        strokeWidth={1}
        opacity={0.5}
      />
    ))}
    {/* Horizontal lines */}
    {Array.from({ length: rows }).map((_, j) => (
      <Line
        key={`grid-h-${j}`}
        points={[0, j * cellSize, cols * cellSize, j * cellSize]}
        stroke="#ccc"
        strokeWidth={1}
        opacity={0.5}
      />
    ))}
  </>
);
