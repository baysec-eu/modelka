// src/components/diagram/element-node/ElementNode.tsx
import React from 'react';
import { DiagramElement } from '../../../types/diagram';
import { ProcessElement } from './ProcessElement';
import { ExternalEntityElement } from './ExternalEntityElement';
import { DataStoreElement } from './DataStoreElement';
import { TrustBoundaryElement } from './TrustBoundaryElement';

interface ElementNodeProps {
  element: DiagramElement;
  selected: boolean;
  onClick: () => void;
  onDragEnd: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
}

/**
 * Renders a STRIDE element using specialized components for each type.
 * Delegates to appropriate component based on element type.
 */
export const ElementNode: React.FC<ElementNodeProps> = ({ 
  element, 
  selected, 
  onClick, 
  onDragEnd,
  onDragMove
}) => {
  const sharedProps = { element, selected, onClick, onDragEnd, onDragMove };

  switch (element.type) {
    case 'process':
      return <ProcessElement {...sharedProps} />;
    
    case 'external-entity':
      return <ExternalEntityElement {...sharedProps} />;
    
    case 'data-store':
      return <DataStoreElement {...sharedProps} />;
    
    case 'trust-boundary':
      return <TrustBoundaryElement {...sharedProps} />;
    
    default:
      // Fallback for data-flow or unknown types
      return null;
  }
};

