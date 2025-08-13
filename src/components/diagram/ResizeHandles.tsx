import React, { useState } from 'react';
import { Circle, Group } from 'react-konva';
import { DiagramElement } from '../../types/diagram';
import { scaleInvariant } from '../../utils/coordinates';

interface ResizeHandlesProps {
  element: DiagramElement;
  scale: number;
  onResize: (size: { width: number; height: number }) => void;
  onRepositionWhileResize?: (pos: { x: number; y: number }) => void;
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';

export const ResizeHandles: React.FC<ResizeHandlesProps> = ({ 
  element, 
  scale, 
  onResize,
  onRepositionWhileResize 
}) => {
  const [hoveredHandle, setHoveredHandle] = useState<ResizeCorner | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleSize = scaleInvariant(8, scale);
  const { x, y } = element.position;
  const { width, height } = element.size;

  const getHandlePosition = (corner: ResizeCorner): { x: number; y: number } => {
    switch (corner) {
      case 'nw': return { x: x, y: y };
      case 'n': return { x: x + width / 2, y: y };
      case 'ne': return { x: x + width, y: y };
      case 'e': return { x: x + width, y: y + height / 2 };
      case 'se': return { x: x + width, y: y + height };
      case 's': return { x: x + width / 2, y: y + height };
      case 'sw': return { x: x, y: y + height };
      case 'w': return { x: x, y: y + height / 2 };
    }
  };

  const handleMouseDown = (corner: ResizeCorner) => (e: any) => {
    e.cancelBubble = true;
    e.evt.stopPropagation();
    e.evt.preventDefault();
    
    setIsResizing(true);
    setHoveredHandle(null);

    const stage = e.target.getStage();
    const startPointer = stage.getPointerPosition();
    const startSize = { ...element.size };
    const startPosition = { ...element.position };

    const handleMouseMove = () => {
      const currentPointer = stage.getPointerPosition();
      if (!currentPointer || !startPointer) return;

      const deltaX = (currentPointer.x - startPointer.x) / scale;
      const deltaY = (currentPointer.y - startPointer.y) / scale;

      let newWidth = startSize.width;
      let newHeight = startSize.height;
      let newX = startPosition.x;
      let newY = startPosition.y;

      // Apply resize based on corner
      switch (corner) {
        case 'se':
          newWidth = Math.max(100, startSize.width + deltaX);
          newHeight = Math.max(60, startSize.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(100, startSize.width - deltaX);
          newHeight = Math.max(60, startSize.height + deltaY);
          newX = startPosition.x + (startSize.width - newWidth);
          break;
        case 'ne':
          newWidth = Math.max(100, startSize.width + deltaX);
          newHeight = Math.max(60, startSize.height - deltaY);
          newY = startPosition.y + (startSize.height - newHeight);
          break;
        case 'nw':
          newWidth = Math.max(100, startSize.width - deltaX);
          newHeight = Math.max(60, startSize.height - deltaY);
          newX = startPosition.x + (startSize.width - newWidth);
          newY = startPosition.y + (startSize.height - newHeight);
          break;
        case 'e':
          newWidth = Math.max(100, startSize.width + deltaX);
          break;
        case 'w':
          newWidth = Math.max(100, startSize.width - deltaX);
          newX = startPosition.x + (startSize.width - newWidth);
          break;
        case 's':
          newHeight = Math.max(60, startSize.height + deltaY);
          break;
        case 'n':
          newHeight = Math.max(60, startSize.height - deltaY);
          newY = startPosition.y + (startSize.height - newHeight);
          break;
      }

      onResize({ width: newWidth, height: newHeight });
      if ((newX !== element.position.x || newY !== element.position.y) && onRepositionWhileResize) {
        onRepositionWhileResize({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handles: ResizeCorner[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <Group>
      {handles.map((corner) => {
        const pos = getHandlePosition(corner);
        return (
          <Circle
            key={corner}
            x={pos.x}
            y={pos.y}
            radius={handleSize}
            fill={hoveredHandle === corner ? '#10b981' : '#7400c6ff'}
            stroke="white"
            strokeWidth={2}
            onMouseDown={handleMouseDown(corner)}
            onMouseEnter={() => !isResizing && setHoveredHandle(corner)}
            onMouseLeave={() => !isResizing && setHoveredHandle(null)}
            listening
          />
        );
      })}
    </Group>
  );
};