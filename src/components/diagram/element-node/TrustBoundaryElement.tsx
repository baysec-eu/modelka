import React from 'react';
import { Rect, Text, Group } from 'react-konva';
import { DiagramElement } from '../../../types/diagram';

interface TrustBoundaryElementProps {
  element: DiagramElement;
  selected: boolean;
  onClick: () => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
}

export const TrustBoundaryElement: React.FC<TrustBoundaryElementProps> = ({ 
  element, 
  selected, 
  onClick, 
  onDragEnd,
  onDragMove
}) => {
  const strokeColor = selected ? '#7400c6ff' : '#000000ff';
  const strokeWidth = selected ? 3 : 2;
  const labelPadding = 4;
  const labelHeight = 20;

  return (
    <Group
      x={element.position.x}
      y={element.position.y}
      draggable
      onClick={onClick}
      onDragMove={onDragMove ? e => onDragMove({ x: e.target.x(), y: e.target.y() }) : undefined}
      onDragEnd={e => onDragEnd({ x: e.target.x(), y: e.target.y() })}
      elementId={element.id}
    >
      {/* Main boundary rectangle with dashed border and no fill */}
      <Rect
        x={0}
        y={0}
        width={element.size.width}
        height={element.size.height}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        dash={[10, 5]}
        fill="transparent"
        cornerRadius={4}
      />
      
      {/* Label background */}
      <Rect
        x={0}
        y={0}
        width={Math.min(element.size.width, element.name.length * 8 + labelPadding * 2)}
        height={labelHeight}
        fill={strokeColor}
        cornerRadius={2}
      />
      
      {/* Label text */}
      <Text
        x={labelPadding}
        y={labelPadding}
        text={`${element.name}`}
        fontSize={12}
        fill="white"
        fontStyle="bold"
      />
    </Group>
  );
};