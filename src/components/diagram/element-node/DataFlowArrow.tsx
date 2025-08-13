import React, { useState } from 'react';
import { Arrow, Group, Text, Circle } from 'react-konva';
import { DiagramElement } from '../../../types/diagram';
import { getClosestEdge } from '../ConnectionHandles';

interface DataFlowArrowProps {
  flow: DiagramElement;
  elements: DiagramElement[];
  selected: boolean;
  onClick: () => void;
  onDblClick: () => void;
  onReattach?: (flowId: string, newSourceId?: string, newTargetId?: string, newSourceEdge?: string, newTargetEdge?: string, newSourceOffset?: number, newTargetOffset?: number) => void;
}

/**
 * Get precise connection point for an element edge with offset
 */
const getElementEdgePoint = (
  element: DiagramElement, 
  edge: 'top' | 'bottom' | 'left' | 'right',
  offset: number = 0.5
): { x: number; y: number } => {
  const { x, y } = element.position;
  const { width, height } = element.size;
  const isEllipse = element.type === 'process';
  
  if (isEllipse) {
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = x + radiusX;
    const centerY = y + radiusY;
    
    // For ellipses, calculate position along the edge
    let angle: number;
    switch (edge) {
      case 'top': angle = -Math.PI/2 + (offset - 0.5) * Math.PI/3; break;
      case 'bottom': angle = Math.PI/2 + (offset - 0.5) * Math.PI/3; break;
      case 'left': angle = Math.PI + (offset - 0.5) * Math.PI/3; break;
      case 'right': angle = (offset - 0.5) * Math.PI/3; break;
    }
    
    return {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY
    };
  } else {
    // For rectangles, use offset along the edge
    switch (edge) {
      case 'top': return { x: x + width * offset, y: y };
      case 'bottom': return { x: x + width * offset, y: y + height };
      case 'left': return { x: x, y: y + height * offset };
      case 'right': return { x: x + width, y: y + height * offset };
    }
  }
};

/**
 * Get the closest edge point for legacy flows without specific edge info
 */
const getClosestEdgePoint = (source: DiagramElement, target: DiagramElement): { start: { x: number; y: number }, end: { x: number; y: number } } => {
  const sx = source.position.x + source.size.width / 2;
  const sy = source.position.y + source.size.height / 2;
  const tx = target.position.x + target.size.width / 2;
  const ty = target.position.y + target.size.height / 2;
  
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { start: { x: sx, y: sy }, end: { x: tx, y: ty } };
  
  const ux = dx / dist;
  const uy = dy / dist;
  
  // Use shape-aware calculations for ellipses and rectangles
  let sourceRadius, targetRadius;
  
  if (source.type === 'process') {
    // For ellipses, calculate the radius in the direction of the connection
    const angle = Math.atan2(dy, dx);
    const radiusX = source.size.width / 2;
    const radiusY = source.size.height / 2;
    sourceRadius = (radiusX * radiusY) / Math.sqrt(Math.pow(radiusY * Math.cos(angle), 2) + Math.pow(radiusX * Math.sin(angle), 2));
  } else {
    sourceRadius = Math.max(source.size.width, source.size.height) / 2;
  }
  
  if (target.type === 'process') {
    // For ellipses, calculate the radius in the direction of the connection
    const angle = Math.atan2(-dy, -dx);
    const radiusX = target.size.width / 2;
    const radiusY = target.size.height / 2;
    targetRadius = (radiusX * radiusY) / Math.sqrt(Math.pow(radiusY * Math.cos(angle), 2) + Math.pow(radiusX * Math.sin(angle), 2));
  } else {
    targetRadius = Math.max(target.size.width, target.size.height) / 2;
  }
  
  return {
    start: { x: sx + ux * sourceRadius, y: sy + uy * sourceRadius },
    end: { x: tx - ux * targetRadius, y: ty - uy * targetRadius }
  };
};

export const DataFlowArrow: React.FC<DataFlowArrowProps> = ({ flow, elements, selected, onClick, onDblClick, onReattach }) => {
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    endpoint: 'source' | 'target';
    originalPos: { x: number; y: number };
  } | null>(null);
  const source = elements.find(el => el.id === flow.sourceId);
  const target = elements.find(el => el.id === flow.targetId);
  if (!source || !target) {
    return null;
  }

  let startX: number, startY: number, endX: number, endY: number;

  // Use precise connection points with edge offsets if available
  if (flow.sourceEdge && flow.targetEdge) {
    const startPoint = getElementEdgePoint(source, flow.sourceEdge, flow.sourceEdgeOffset || 0.5);
    const endPoint = getElementEdgePoint(target, flow.targetEdge, flow.targetEdgeOffset || 0.5);
    
    startX = startPoint.x;
    startY = startPoint.y;
    endX = endPoint.x;
    endY = endPoint.y;
  } else if (flow.sourceEdge) {
    // Partial upgrade: has source edge but not target edge info
    const startPoint = getElementEdgePoint(source, flow.sourceEdge, flow.sourceEdgeOffset || 0.5);
    startX = startPoint.x;
    startY = startPoint.y;
    
    // Calculate target using legacy method for now
    const points = getClosestEdgePoint(source, target);
    endX = points.end.x;
    endY = points.end.y;
  } else {
    // Fallback to legacy calculation for existing flows
    const points = getClosestEdgePoint(source, target);
    startX = points.start.x;
    startY = points.start.y;
    endX = points.end.x;
    endY = points.end.y;
  }

  const color = selected ? '#7400c6ff' : '#000000ff';
  const strokeWidth = selected ? 2 : 1;

  // Handle endpoint drag start
  const handleEndpointDragStart = (endpoint: 'source' | 'target', pos: { x: number; y: number }) => {
    setDragState({
      isDragging: true,
      endpoint,
      originalPos: pos
    });
  };

  // Handle endpoint drag end
  const handleEndpointDragEnd = (draggedPos: { x: number; y: number }) => {
    if (!dragState || !onReattach) {
      setDragState(null);
      return;
    }

    console.log('🎯 DataFlow reattachment: drag ended at', draggedPos);

    // Find target element under the dragged endpoint
    const targetElements = elements.filter(el => 
      el.type !== 'data-flow' && 
      el.id !== flow.sourceId && 
      el.id !== flow.targetId
    );

    let newTargetElement: DiagramElement | null = null;
    let newTargetEdge: 'top' | 'bottom' | 'left' | 'right' = 'top';
    let newTargetOffset = 0.5;

    // Check if dragged position is over any element
    for (const element of targetElements) {
      const { x, y } = element.position;
      const { width, height } = element.size;
      
      if (draggedPos.x >= x && draggedPos.x <= x + width &&
          draggedPos.y >= y && draggedPos.y <= y + height) {
        newTargetElement = element;
        
        // Calculate edge and offset
        const edgeResult = getClosestEdge(element, draggedPos);
        newTargetEdge = edgeResult.edge;
        
        // Calculate offset based on position along edge
        if (newTargetEdge === 'top' || newTargetEdge === 'bottom') {
          newTargetOffset = Math.max(0.1, Math.min(0.9, (draggedPos.x - x) / width));
        } else {
          newTargetOffset = Math.max(0.1, Math.min(0.9, (draggedPos.y - y) / height));
        }
        
        console.log(`🔗 Found target: ${element.id} on edge ${newTargetEdge} at offset ${newTargetOffset}`);
        break;
      }
    }

    if (newTargetElement) {
      console.log(`🔄 Reattaching ${dragState.endpoint} endpoint to ${newTargetElement.id}`);
      
      // Reattach to new element
      if (dragState.endpoint === 'source') {
        onReattach(
          flow.id, 
          newTargetElement.id, 
          undefined, 
          newTargetEdge, 
          undefined, 
          newTargetOffset, 
          undefined
        );
      } else {
        onReattach(
          flow.id, 
          undefined, 
          newTargetElement.id, 
          undefined, 
          newTargetEdge, 
          undefined, 
          newTargetOffset
        );
      }
    } else {
      console.log('❌ No valid target found for reattachment');
    }

    setDragState(null);
  };

  return (
    <Group>
      <Arrow
        points={[startX, startY, endX, endY]}
        stroke={color}
        fill={color}
        strokeWidth={strokeWidth}
        pointerLength={10}
        pointerWidth={8}
        onClick={onClick}
        onDblClick={onDblClick}
      />
      
      {/* Reattachment handles - only show when selected */}
      {selected && onReattach && (
        <>
          {/* Source endpoint handle */}
          <Circle
            x={startX}
            y={startY}
            radius={6}
            fill="#ff6b6b"
            stroke="#ffffff"
            strokeWidth={2}
            draggable
            onDragStart={() => handleEndpointDragStart('source', { x: startX, y: startY })}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const absolutePos = { x: startX + pos.x, y: startY + pos.y };
              console.log('🎯 Source endpoint dragged to:', absolutePos);
              handleEndpointDragEnd(absolutePos);
              e.target.position({ x: 0, y: 0 }); // Reset position
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'move';
              }
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'default';
              }
            }}
          />
          
          {/* Target endpoint handle */}
          <Circle
            x={endX}
            y={endY}
            radius={6}
            fill="#51cf66"
            stroke="#ffffff"
            strokeWidth={2}
            draggable
            onDragStart={() => handleEndpointDragStart('target', { x: endX, y: endY })}
            onDragEnd={(e) => {
              const pos = e.target.position();
              const absolutePos = { x: endX + pos.x, y: endY + pos.y };
              console.log('🎯 Target endpoint dragged to:', absolutePos);
              handleEndpointDragEnd(absolutePos);
              e.target.position({ x: 0, y: 0 }); // Reset position
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'move';
              }
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'default';
              }
            }}
          />
        </>
      )}
      
      {flow.name && (
        <Text
          x={(startX + endX) / 2}
          y={(startY + endY) / 2 - 16}
          text={flow.name}
          fontSize={12}
          fill={color}
          offsetX={flow.name.length * 3}
          onClick={onClick}
        />
      )}
    </Group>
  );
};