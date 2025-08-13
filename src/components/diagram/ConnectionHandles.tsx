
// src/components/diagram/ConnectionHandles.tsx
import React from 'react';
import { Rect, Circle, Group } from 'react-konva';
import { DiagramElement } from '../../types/diagram';
import { scaleInvariant } from '../../utils/coordinates';

interface ConnectionHandlesProps {
  element: DiagramElement;
  scale: number;
  onHandleDown: (el: DiagramElement, pos: { x: number; y: number }, edge: 'top' | 'bottom' | 'left' | 'right', edgeOffset?: number) => void;
}

type EdgeInfo = {
  edge: 'top' | 'bottom' | 'left' | 'right';
  connectionPoint: { x: number; y: number };
};

/**
 * Robust connection handles that work for both rectangular and circular elements.
 * Provides proper edge detection and coordinates accounting for zoom and transforms.
 */
export const ConnectionHandles: React.FC<ConnectionHandlesProps> = ({ element, scale, onHandleDown }) => {
  const { x, y } = element.position;
  const { width, height } = element.size;
  const thickness = Math.max(scaleInvariant(12, scale), 4); // Adaptive thickness based on zoom
  const isEllipse = element.type === 'process';
  
  const getConnectionPoint = (edge: 'top' | 'bottom' | 'left' | 'right'): { x: number; y: number } => {
    if (isEllipse) {
      const radiusX = width / 2;
      const radiusY = height / 2;
      const centerX = x + radiusX;
      const centerY = y + radiusY;
      
      switch (edge) {
        case 'top': return { x: centerX, y: centerY - radiusY };
        case 'bottom': return { x: centerX, y: centerY + radiusY };
        case 'left': return { x: centerX - radiusX, y: centerY };
        case 'right': return { x: centerX + radiusX, y: centerY };
      }
    } else {
      switch (edge) {
        case 'top': return { x: x + width / 2, y: y };
        case 'bottom': return { x: x + width / 2, y: y + height };
        case 'left': return { x: x, y: y + height / 2 };
        case 'right': return { x: x + width, y: y + height / 2 };
      }
    }
  };

  const handleMouseDown = (edge: 'top' | 'bottom' | 'left' | 'right') => (e: any) => {
    e.cancelBubble = true;
    
    // Calculate precise position along the edge based on click position
    const stage = e.target.getStage();
    
    // Use Konva's native getRelativePointerPosition for stage-relative coordinates
    const relativePos = stage.getRelativePointerPosition();
    if (!relativePos) return;
    
    console.log('🔧 Handle mouse down:', { relativePos, element: element.id, edge });
    
    // Calculate position relative to element
    const elementX = relativePos.x - element.position.x;
    const elementY = relativePos.y - element.position.y;
    
    let edgeOffset = 0.5; // Default to center
    let connectionPoint = getConnectionPoint(edge);
    
    // Calculate offset along the edge (0 = start, 1 = end)
    if (edge === 'top' || edge === 'bottom') {
      edgeOffset = Math.max(0.1, Math.min(0.9, elementX / element.size.width));
      connectionPoint.x = element.position.x + element.size.width * edgeOffset;
    } else if (edge === 'left' || edge === 'right') {
      edgeOffset = Math.max(0.1, Math.min(0.9, elementY / element.size.height));
      connectionPoint.y = element.position.y + element.size.height * edgeOffset;
    }
    
    onHandleDown(element, connectionPoint, edge, edgeOffset);
  };

  if (isEllipse) {
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = x + radiusX;
    const centerY = y + radiusY;
    const handleRadius = scaleInvariant(6, scale);
    
    // Create 12 connection handles around the ellipse perimeter
    const handleCount = 12;
    const handles = [];
    
    for (let i = 0; i < handleCount; i++) {
      const angle = (i * 2 * Math.PI) / handleCount;
      const handleX = centerX + Math.cos(angle) * radiusX;
      const handleY = centerY + Math.sin(angle) * radiusY;
      
      // Determine which edge this handle belongs to based on angle
      let edge: 'top' | 'bottom' | 'left' | 'right';
      const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
      
      if (normalizedAngle >= 7 * Math.PI / 4 || normalizedAngle < Math.PI / 4) {
        edge = 'right';
      } else if (normalizedAngle >= Math.PI / 4 && normalizedAngle < 3 * Math.PI / 4) {
        edge = 'bottom';
      } else if (normalizedAngle >= 3 * Math.PI / 4 && normalizedAngle < 5 * Math.PI / 4) {
        edge = 'left';
      } else {
        edge = 'top';
      }
      
      handles.push(
        <Circle 
          key={i}
          x={handleX} 
          y={handleY} 
          radius={handleRadius} 
          fill="transparent" 
          stroke="#7400c6ff"
          strokeWidth={0}
          listening 
          onMouseEnter={(e) => {
            const target = e.target as any;
            target.strokeWidth(2);
            const stage = target.getStage();
            if (stage && stage.container()) {
              stage.container().style.cursor = 'crosshair';
            }
          }}
          onMouseLeave={(e) => {
            const target = e.target as any;
            target.strokeWidth(0);
            const stage = target.getStage();
            if (stage && stage.container()) {
              stage.container().style.cursor = 'default';
            }
          }}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            // For ellipse handles, use the precise handle position calculated above
            let edgeOffset = 0.5;
            if (edge === 'top' || edge === 'bottom') {
              edgeOffset = (handleX - x) / width;
            } else {
              edgeOffset = (handleY - y) / height;
            }
            edgeOffset = Math.max(0.1, Math.min(0.9, edgeOffset));
            onHandleDown(element, { x: handleX, y: handleY }, edge, edgeOffset);
          }}
        />
      );
    }
    
    return (
      <Group elementId={`${element.id}-handles`}>
        {handles}
      </Group>
    );
  }

  // For rectangular elements, create visible grab points along the edges
  const handleRadius = scaleInvariant(6, scale);
  const grabPointsPerEdge = 3; // Number of grab points per edge
  const rectangularHandles = [];

  // Helper function to create grab points along an edge
  const createEdgeGrabPoints = (edge: 'top' | 'bottom' | 'left' | 'right') => {
    const points = [];
    for (let i = 0; i < grabPointsPerEdge; i++) {
      const offset = (i + 1) / (grabPointsPerEdge + 1); // Distribute evenly along edge
      let handleX, handleY;
      
      switch (edge) {
        case 'top':
          handleX = x + width * offset;
          handleY = y;
          break;
        case 'bottom':
          handleX = x + width * offset;
          handleY = y + height;
          break;
        case 'left':
          handleX = x;
          handleY = y + height * offset;
          break;
        case 'right':
          handleX = x + width;
          handleY = y + height * offset;
          break;
      }
      
      points.push(
        <Circle 
          key={`${edge}-${i}`}
          x={handleX} 
          y={handleY} 
          radius={Math.max(handleRadius, 8)} 
          fill="transparent" 
          stroke="#7400c6ff"
          strokeWidth={0}
          listening 
          onMouseEnter={(e) => {
            console.log('🎯 Rectangle grab point hover:', { edge, i, handleX, handleY, element: element.id });
            const target = e.target as any;
            target.strokeWidth(2);
            const stage = target.getStage();
            if (stage && stage.container()) {
              stage.container().style.cursor = 'crosshair';
            }
          }}
          onMouseLeave={(e) => {
            const target = e.target as any;
            target.strokeWidth(0);
            const stage = target.getStage();
            if (stage && stage.container()) {
              stage.container().style.cursor = 'default';
            }
          }}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            onHandleDown(element, { x: handleX, y: handleY }, edge, offset);
          }}
        />
      );
    }
    return points;
  };

  // Create grab points for all four edges
  rectangularHandles.push(...createEdgeGrabPoints('top'));
  rectangularHandles.push(...createEdgeGrabPoints('bottom'));
  rectangularHandles.push(...createEdgeGrabPoints('left'));
  rectangularHandles.push(...createEdgeGrabPoints('right'));

  return (
    <Group elementId={`${element.id}-handles`}>
      {rectangularHandles}
      {/* Keep invisible hit areas for better UX - larger areas for easier clicking */}
      <Rect 
        x={x} 
        y={y - thickness / 2} 
        width={width} 
        height={thickness} 
        fill="transparent" 
        listening 
        onMouseDown={handleMouseDown('top')} 
      />
      <Rect 
        x={x} 
        y={y + height - thickness / 2} 
        width={width} 
        height={thickness} 
        fill="transparent" 
        listening 
        onMouseDown={handleMouseDown('bottom')} 
      />
      <Rect 
        x={x - thickness / 2} 
        y={y} 
        width={thickness} 
        height={height} 
        fill="transparent" 
        listening 
        onMouseDown={handleMouseDown('left')} 
      />
      <Rect 
        x={x + width - thickness / 2} 
        y={y} 
        width={thickness} 
        height={height} 
        fill="transparent" 
        listening 
        onMouseDown={handleMouseDown('right')} 
      />
    </Group>
  );
};

/**
 * Utility function to find the closest edge and connection point for a given position
 * relative to an element. Used for center-drop functionality.
 */
export const getClosestEdge = (element: DiagramElement, dropPoint: { x: number; y: number }): EdgeInfo => {
  const { x, y } = element.position;
  const { width, height } = element.size;
  const isEllipse = element.type === 'process';
  
  if (isEllipse) {
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = x + radiusX;
    const centerY = y + radiusY;
    
    const dx = dropPoint.x - centerX;
    const dy = dropPoint.y - centerY;
    const angle = Math.atan2(dy, dx);
    
    // Convert angle to edge
    const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
    const quarterAngle = Math.PI / 4;
    
    if (normalizedAngle >= 7 * quarterAngle || normalizedAngle < quarterAngle) {
      return { edge: 'right', connectionPoint: { x: centerX + radiusX, y: centerY } };
    } else if (normalizedAngle >= quarterAngle && normalizedAngle < 3 * quarterAngle) {
      return { edge: 'bottom', connectionPoint: { x: centerX, y: centerY + radiusY } };
    } else if (normalizedAngle >= 3 * quarterAngle && normalizedAngle < 5 * quarterAngle) {
      return { edge: 'left', connectionPoint: { x: centerX - radiusX, y: centerY } };
    } else {
      return { edge: 'top', connectionPoint: { x: centerX, y: centerY - radiusY } };
    }
  } else {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    const dx = dropPoint.x - centerX;
    const dy = dropPoint.y - centerY;
    
    const distToTop = Math.abs(dy + height / 2);
    const distToBottom = Math.abs(dy - height / 2);
    const distToLeft = Math.abs(dx + width / 2);
    const distToRight = Math.abs(dx - width / 2);
    
    const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);
    
    if (minDist === distToTop) {
      return { edge: 'top', connectionPoint: { x: centerX, y: y } };
    } else if (minDist === distToBottom) {
      return { edge: 'bottom', connectionPoint: { x: centerX, y: y + height } };
    } else if (minDist === distToLeft) {
      return { edge: 'left', connectionPoint: { x: x, y: centerY } };
    } else {
      return { edge: 'right', connectionPoint: { x: x + width, y: centerY } };
    }
  }
};
