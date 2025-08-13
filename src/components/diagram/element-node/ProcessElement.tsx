import React from 'react';
import { Ellipse, Text, Group } from 'react-konva';
import { DiagramElement } from '../../../types/diagram';

interface ProcessElementProps {
  element: DiagramElement;
  selected: boolean;
  onClick: () => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
}

export const ProcessElement: React.FC<ProcessElementProps> = ({ 
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
      <Ellipse
        x={element.size.width / 2}
        y={element.size.height / 2}
        radiusX={element.size.width / 2}
        radiusY={element.size.height / 2}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      <Text
        x={element.size.width / 2}
        y={element.size.height / 2}
        text={`${element.name}`}
        fontSize={12}
        fill={textColor}
        width={element.size.width}
        align="center"
        verticalAlign="middle"
        offsetX={element.size.width / 2}
        offsetY={element.technologies?.length > 0 ? 12 : 6}
      />
      {/* Technologies below the name */}
      {element.technologies && element.technologies.length > 0 && (
        <Text
          x={element.size.width / 2}
          y={element.size.height / 2 + 16}
          text={element.technologies.map(tech => tech.name).join(', ')}
          fontSize={10}
          fill="#666666"
          width={element.size.width}
          align="center"
          verticalAlign="middle"
          offsetX={element.size.width / 2}
          offsetY={5}
        />
      )}
    </Group>
  );
};