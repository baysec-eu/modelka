import React from 'react';
import { Arrow } from 'react-konva';
import { scaleInvariant } from '../../../utils/coordinates';

interface DragPreviewArrowProps {
  start: { x: number; y: number };
  current: { x: number; y: number };
  scale: number;
  hoveredTarget?: boolean;
}

/**
 * Drag preview arrow component for connection creation
 * Renders a dashed arrow from start to current mouse position
 */
export const DragPreviewArrow: React.FC<DragPreviewArrowProps> = ({
  start,
  current,
  scale,
  hoveredTarget = false,
}) => {
  return (
    <Arrow
      points={[start.x, start.y, current.x, current.y]}
      stroke={hoveredTarget ? "#10b981" : "#7400c6ff"}
      fill={hoveredTarget ? "#10b981" : "#7400c6ff"}
      strokeWidth={scaleInvariant(2, scale)}
      pointerLength={scaleInvariant(10, scale)}
      pointerWidth={scaleInvariant(8, scale)}
      dash={[scaleInvariant(5, scale), scaleInvariant(5, scale)]}
      listening={false} // Don't intercept mouse events
    />
  );
};