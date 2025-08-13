import React from 'react';
import { Rect, Text, Group, Line } from 'react-konva';
import { DiagramElement } from '../../../types/diagram';

interface DataStoreElementProps {
  element: DiagramElement;
  selected: boolean;
  onClick: () => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
}

export const DataStoreElement: React.FC<DataStoreElementProps> = ({ 
  element, 
  selected, 
  onClick, 
  onDragEnd,
  onDragMove
}) => {
  const fillColor = selected ? '#ffffffff' : '#ffffffff';
  const strokeColor = selected ? '#7400c6ff' : '#000000ff';
  const strokeWidth = selected ? 2 : 1;
  const textColor = '#000000ff';

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
      {/* Background fill */}
      <Rect
        width={element.size.width}
        height={element.size.height}
        fill={fillColor}
        stroke="transparent"
      />
      
      {/* Top border line */}
      <Line
        points={[0, 0, element.size.width, 0]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      
      {/* Bottom border line */}
      <Line
        points={[0, element.size.height, element.size.width, element.size.height]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      <Text
        text={`${element.name}`}
        fontSize={14}
        fill={textColor}
        width={element.size.width}
        align="center"
        verticalAlign="middle"
        offsetY={element.technologies?.length > 0 ? -element.size.height / 2 + 5 : -element.size.height / 2 + 10}
      />
      {/* Technologies below the name */}
      {element.technologies && element.technologies.length > 0 && (
        <Text
          text={element.technologies.map(tech => tech.name).join(', ')}
          fontSize={10}
          fill="#666666"
          width={element.size.width}
          align="center"
          verticalAlign="middle"
          offsetY={-element.size.height / 2 + 20}
        />
      )}
    </Group>
  );
};