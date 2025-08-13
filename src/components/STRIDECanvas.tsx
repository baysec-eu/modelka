// src/components/STRIDECanvas.tsx
import React, { useRef, useEffect, useState } from 'react';
import Konva from 'konva';
import { Stage, Layer } from 'react-konva';
import { GridLayer } from './diagram/GridLayer';
import { ElementNode } from './diagram/element-node/ElementNode';
import { DataFlowArrow } from './diagram/element-node/DataFlowArrow';
import { DragPreviewArrow } from './diagram/element-node/DragPreviewArrow';
import { ConnectionHandles, getClosestEdge } from './diagram/ConnectionHandles';
import { ResizeHandles } from './diagram/ResizeHandles';
import { ContextMenu } from './diagram/context-menu/ContextMenu';
import { ZoomControls } from './diagram/zoom-controls/ZoomControls';
import { DiagramElement, STRIDEElementType, ELEMENT_CONFIGS } from '../types/diagram';
import { scaleInvariant, isPointInRect, ViewportState } from '../utils/coordinates';
import './STRIDECanvas.css';

interface STRIDECanvasProps {
  elements: DiagramElement[];
  selectedElement: DiagramElement | null;
  onElementsChange: (elements: DiagramElement[]) => void;
  onElementSelect: (el: DiagramElement | null) => void;
  onElementDelete?: (elementId: string) => void;
}

type DragConn = {
  sourceId: string;
  sourceEdge: 'top' | 'bottom' | 'left' | 'right';
  sourceEdgeOffset: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
};

export const STRIDECanvas: React.FC<STRIDECanvasProps> = ({
  elements,
  selectedElement,
  onElementsChange,
  onElementSelect,
  onElementDelete,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragConn, setDragConn] = useState<DragConn | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const [context, setContext] = useState<{
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  useEffect(() => {
    const container = stageRef.current?.container().parentElement;
    if (!container) return;
    const update = () =>
      setViewport({ width: container.offsetWidth, height: container.offsetHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Setup export functionality
  useEffect(() => {
    const exportPNG = () => {
      const stage = stageRef.current;
      if (!stage) return;
      
      const dataURL = stage.toDataURL({ pixelRatio: 1 }); // Reduced from 2 to prevent Safari memory issues
      const link = document.createElement('a');
      link.download = `modelka-diagram-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    // SVG export removed as requested

    const getCanvasDataURL = () => {
      const stage = stageRef.current;
      if (!stage) return null;
      return stage.toDataURL({ pixelRatio: 1 });
    };

    // Attach export functions to window
    (window as any).modelkaExport = {
      png: exportPNG,
      getCanvasDataURL,
      // svg: removed as requested
    };

    return () => {
      delete (window as any).modelkaExport;
    };
  }, []);

  // Use refs to track current state without causing effect re-runs
  const selectedElementRef = useRef<DiagramElement | null>(null);
  const onElementDeleteRef = useRef<((elementId: string) => void) | undefined>(undefined);
  
  // Update refs when props change
  selectedElementRef.current = selectedElement;
  onElementDeleteRef.current = onElementDelete;

  const viewportTransform: ViewportState = { scale, pos };

  // Helper function to check if element is inside a trust boundary
  // const getContainingTrustBoundary = (element: DiagramElement): DiagramElement | null => {
  //   const trustBoundaries = elements.filter(el => el.type === 'trust-boundary');
    
  //   for (const boundary of trustBoundaries) {
  //     const elementCenterX = element.position.x + element.size.width / 2;
  //     const elementCenterY = element.position.y + element.size.height / 2;
      
  //     if (elementCenterX >= boundary.position.x && 
  //         elementCenterX <= boundary.position.x + boundary.size.width &&
  //         elementCenterY >= boundary.position.y && 
  //         elementCenterY <= boundary.position.y + boundary.size.height) {
  //       return boundary;
  //     }
  //   }
    
  //   return null;
  // };

  // console.log('🎯 Viewport state:', { scale, pos, viewport: { width: viewport.width, height: viewport.height } });

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    
    const oldScale = stage.scaleX(); // Use stage's actual scale
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    const scaleBy = 1.1;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(0.1, Math.min(5, oldScale * Math.pow(scaleBy, direction)));
    
    // Get the point in the stage's coordinate system
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    
    // Calculate new stage position
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    
    // Update both stage and React state
    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    
    setScale(newScale);
    setPos(newPos);
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const rect = stage.container().getBoundingClientRect();
    
    // Screen position for context menu display (relative to viewport)
    const screenX = e.evt.clientX - rect.left;
    const screenY = e.evt.clientY - rect.top;
    
    // Canvas position for element placement (use Konva's native transformation)
    const relativePos = stage.getRelativePointerPosition();
    if (!relativePos) return;
    
    console.log('🖱️ Context menu:', { 
      screenX, screenY, 
      canvasX: relativePos.x, canvasY: relativePos.y 
    });
    
    setContext({ 
      x: screenX, 
      y: screenY, 
      canvasX: relativePos.x, 
      canvasY: relativePos.y 
    });
  };

  const addElement = (type: STRIDEElementType) => {
    console.log('🖱️ addElement clicked for type:', type);
    if (!context) {
      console.log('❌ No context available for element placement');
      return;
    }
    
    const cfg = ELEMENT_CONFIGS[type];
    const defaultSize = (cfg as any).defaultSize || { width: 100, height: 50 };
    const newEl: DiagramElement = {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      name: cfg.name,
      position: { x: context.canvasX, y: context.canvasY },
      size: defaultSize,
      threats: [],
      technologies: [],
      description: '',
      notes: '',
      assets: [],
      ...(type === 'data-flow' ? { sourceId: '', targetId: '' } : {}),
    };
    
    console.log('🎨 Created new element:', newEl.id, 'at position:', newEl.position);
    console.log('📦 Calling onElementsChange with', elements.length + 1, 'elements');
    onElementsChange([...elements, newEl]);
    setContext(null);
  };

  const onHandleDown = (el: DiagramElement, start: { x: number; y: number }, edge: 'top' | 'bottom' | 'left' | 'right', edgeOffset: number = 0.5) => {
    // The start position is already in canvas coordinates from ConnectionHandles
    // No need for coordinate conversion here
    console.log('🎯 onHandleDown:', { 
      element: el.id, 
      startPos: start, 
      edge, 
      edgeOffset, 
      viewport: viewportTransform 
    });
    setDragConn({ sourceId: el.id, sourceEdge: edge, sourceEdgeOffset: edgeOffset, start, current: start });
  };

  const handleMouseMove = () => {
    if (!dragConn) return;
    const stage = stageRef.current!;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Use Konva's native getRelativePointerPosition to get coordinates relative to the stage
    // This automatically accounts for all stage transformations (scale, position)
    const relativePos = stage.getRelativePointerPosition();
    if (!relativePos) return;

    setDragConn({ ...dragConn, current: relativePos });
    
    // Check for hover target for visual feedback using stage-relative coordinates
    const threshold = scaleInvariant(20, scale);
    let hoverTarget: string | null = null;
    
    for (const el of elements.filter(e => e.type !== 'data-flow' && e.id !== dragConn.sourceId)) {
      if (isPointInRect(relativePos, { 
        x: el.position.x, 
        y: el.position.y, 
        width: el.size.width, 
        height: el.size.height 
      }, threshold)) {
        hoverTarget = el.id;
        break;
      }
    }
    
    setHoveredTarget(hoverTarget);
  };

  const handleMouseUp = () => {
    if (!dragConn) return;
    const stage = stageRef.current!;
    
    // Use Konva's native getRelativePointerPosition for stage-relative coordinates
    const relativePos = stage.getRelativePointerPosition();
    if (!relativePos) {
      setDragConn(null);
      setHoveredTarget(null);
      return;
    }
    
    // Use the hoveredTarget that's already working for visual feedback
    let targetId = hoveredTarget;
    
    // If we found a valid target element (not the source)
    if (targetId && targetId !== dragConn.sourceId) {
      const targetElement = elements.find(el => el.id === targetId);
      if (targetElement) {
        // Get the closest edge for precise connection using stage-relative coordinates
        const { edge: targetEdge, connectionPoint: targetPoint } = getClosestEdge(targetElement, relativePos);
        
        // Calculate target edge offset based on where we dropped
        let targetEdgeOffset = 0.5;
        if (targetEdge === 'top' || targetEdge === 'bottom') {
          const relativeX = relativePos.x - targetElement.position.x;
          targetEdgeOffset = Math.max(0.1, Math.min(0.9, relativeX / targetElement.size.width));
        } else {
          const relativeY = relativePos.y - targetElement.position.y;
          targetEdgeOffset = Math.max(0.1, Math.min(0.9, relativeY / targetElement.size.height));
        }
        
        const newFlow: DiagramElement = {
          id: `data-flow-${Date.now()}`,
          type: 'data-flow',
          name: 'Data Flow',
          position: { x: 0, y: 0 },
          size: { width: 0, height: 0 },
          sourceId: dragConn.sourceId,
          targetId,
          sourceEdge: dragConn.sourceEdge,
          sourceEdgeOffset: dragConn.sourceEdgeOffset,
          targetEdge,
          targetEdgeOffset,
          targetPoint, // Keep for legacy compatibility
          dataType: '',
          dataDescription: '',
          threats: [],
          technologies: [],
          description: '',
          notes: '',
          assets: [],
        };
        onElementsChange([...elements, newFlow]);
      }
    }
    setDragConn(null);
    setHoveredTarget(null);
  };

  // Handle data flow reattachment
  const handleDataFlowReattach = (
    flowId: string, 
    newSourceId?: string, 
    newTargetId?: string, 
    newSourceEdge?: string, 
    newTargetEdge?: string, 
    newSourceOffset?: number, 
    newTargetOffset?: number
  ) => {
    onElementsChange(elements.map(el => {
      if (el.id === flowId && el.type === 'data-flow') {
        return {
          ...el,
          ...(newSourceId !== undefined && { sourceId: newSourceId }),
          ...(newTargetId !== undefined && { targetId: newTargetId }),
          ...(newSourceEdge !== undefined && { sourceEdge: newSourceEdge as any }),
          ...(newTargetEdge !== undefined && { targetEdge: newTargetEdge as any }),
          ...(newSourceOffset !== undefined && { sourceEdgeOffset: newSourceOffset }),
          ...(newTargetOffset !== undefined && { targetEdgeOffset: newTargetOffset }),
        };
      }
      return el;
    }));
  };

  const handleStageMouseDown = (e: any) => {
    if (e.target === e.target.getStage()) {
      onElementSelect(null);
      setContext(null); // Close context menu when clicking on stage
    }
  };

  // Removed handleStageDragMove - let Konva handle stage dragging natively

  return (
    <div className="stride-canvas">
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        scaleX={scale}
        scaleY={scale}
        x={pos.x}
        y={pos.y}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseDown={handleStageMouseDown}
        onContextMenu={handleContextMenu}
        draggable
      >
        <Layer>
          <GridLayer rows={40} cols={50} cellSize={50} />

          {/* Trust boundaries first (lowest z-index) */}
          {elements
            .filter(el => el.type === 'trust-boundary')
            .map(el => (
              <React.Fragment key={el.id}>
                <ElementNode
                  element={el}
                  selected={selectedElement?.id === el.id}
                  onClick={() => onElementSelect(el)}
                  onDragEnd={pos =>
                    onElementsChange(
                      elements.map(e2 => (e2.id === el.id ? { ...e2, position: pos } : e2))
                    )
                  }
                />
                {/* Connection handles - trust boundaries should not have connection handles */}
                {el.type !== 'trust-boundary' && (
                  <ConnectionHandles element={el} scale={scale} onHandleDown={onHandleDown} />
                )}
                
                {/* Resize handles for selected trust boundaries */}
                {el.type === 'trust-boundary' && selectedElement?.id === el.id && (
                  <ResizeHandles
                    element={el}
                    scale={scale}
                    onResize={size =>
                      onElementsChange(
                        elements.map(e2 => (e2.id === el.id ? { ...e2, size } : e2))
                      )
                    }
                    onRepositionWhileResize={pos =>
                      onElementsChange(
                        elements.map(e2 => (e2.id === el.id ? { ...e2, position: pos } : e2))
                      )
                    }
                  />
                )}
              </React.Fragment>
            ))}

          {/* Other elements (higher z-index than trust boundaries) */}
          {elements
            .filter(el => el.type !== 'data-flow' && el.type !== 'trust-boundary')
            .map(el => (
              <React.Fragment key={el.id}>
                <ElementNode
                  element={el}
                  selected={selectedElement?.id === el.id}
                  onClick={() => onElementSelect(el)}
                  onDragEnd={pos =>
                    onElementsChange(
                      elements.map(e2 => (e2.id === el.id ? { ...e2, position: pos } : e2))
                    )
                  }
                />
                {/* Connection handles */}
                <ConnectionHandles element={el} scale={scale} onHandleDown={onHandleDown} />
              </React.Fragment>
            ))}

          {/* Data-flow arrows */}
          {elements
            .filter(el => el.type === 'data-flow')
            .map(flow => (
              <DataFlowArrow
                key={flow.id}
                flow={flow}
                elements={elements}
                selected={selectedElement?.id === flow.id}
                onClick={() => onElementSelect(flow)}
                onDblClick={() => onElementSelect(flow)}
                onReattach={handleDataFlowReattach}
              />
            ))}

          {/* Drag-preview arrow before being connected */}
          {dragConn && (
            <DragPreviewArrow
              start={dragConn.start}
              current={dragConn.current}
              scale={scale}
              hoveredTarget={!!hoveredTarget}
            />
          )}
        </Layer>
      </Stage>

      {context && (
        <ContextMenu
          x={context.x}
          y={context.y}
          onSelect={addElement}
          onClose={() => setContext(null)}
        />
      )}

      <ZoomControls
        scale={scale}
        onZoomIn={() => {
          const stage = stageRef.current!;
          const scaleBy = 1.2;
          const oldScale = stage.scaleX();
          const newScale = Math.min(oldScale * scaleBy, 5);
          
          // Zoom towards center of viewport
          const centerX = viewport.width / 2;
          const centerY = viewport.height / 2;
          
          const mousePointTo = {
            x: (centerX - stage.x()) / oldScale,
            y: (centerY - stage.y()) / oldScale,
          };
          
          const newPos = {
            x: centerX - mousePointTo.x * newScale,
            y: centerY - mousePointTo.y * newScale,
          };
          
          // Update stage directly
          stage.scale({ x: newScale, y: newScale });
          stage.position(newPos);
          
          // Update React state for UI consistency
          setScale(newScale);
          setPos(newPos);
        }}
        onZoomOut={() => {
          const stage = stageRef.current!;
          const scaleBy = 1.2;
          const oldScale = stage.scaleX();
          const newScale = Math.max(oldScale / scaleBy, 0.1);
          
          // Zoom towards center of viewport
          const centerX = viewport.width / 2;
          const centerY = viewport.height / 2;
          
          const mousePointTo = {
            x: (centerX - stage.x()) / oldScale,
            y: (centerY - stage.y()) / oldScale,
          };
          
          const newPos = {
            x: centerX - mousePointTo.x * newScale,
            y: centerY - mousePointTo.y * newScale,
          };
          
          // Update stage directly
          stage.scale({ x: newScale, y: newScale });
          stage.position(newPos);
          
          // Update React state for UI consistency
          setScale(newScale);
          setPos(newPos);
        }}
        onReset={() => {
          const stage = stageRef.current!;
          
          // Reset stage directly
          stage.scale({ x: 1, y: 1 });
          stage.position({ x: 0, y: 0 });
          
          // Update React state for UI consistency
          setScale(1);
          setPos({ x: 0, y: 0 });
        }}
      />
    </div>
  );
};
