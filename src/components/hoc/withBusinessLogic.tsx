// src/components/hoc/withBusinessLogic.tsx - Enterprise HOC for distributed business logic
import { ComponentType } from 'react';
import { useDiagramContext } from '../../state/DiagramContext';
import { DiagramElement, ThreatActor } from '../../types/diagram';
import { DistributedStateStats, StateSnapshot, DistributedStateEvent } from '../../state/distributedStateManager';

/**
 * Enterprise business logic interface exposed to UI components
 */
export interface DiagramBusinessLogic {
  // State
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  selectedElementId: string | null;
  
  // Connection status
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Statistics and monitoring
  stats: DistributedStateStats;
  
  // Room management
  initializeRoom: (userId: string, roomId: string) => Promise<void>;
  switchRoom: (roomId: string) => Promise<void>;
  
  // Element operations
  createElement: (element: DiagramElement) => Promise<boolean>;
  updateElement: (id: string, patch: Partial<DiagramElement>) => Promise<boolean>;
  deleteElement: (id: string) => Promise<boolean>;
  updateElements: (updates: Array<{ id: string; patch: Partial<DiagramElement> }>) => Promise<boolean>;
  deleteElementWithConnections: (elementId: string) => Promise<boolean>;
  moveElement: (elementId: string, position: { x: number; y: number }) => Promise<boolean>;
  
  // Threat actor operations
  createThreatActor: (threatActor: ThreatActor) => Promise<boolean>;
  updateThreatActor: (id: string, patch: Partial<ThreatActor>) => Promise<boolean>;
  deleteThreatActor: (id: string) => Promise<boolean>;
  
  // UI operations
  selectElement: (elementId: string | null) => void;
  
  // Connection operations
  connect: (rtc: any, userId: string) => Promise<void>;
  disconnect: () => void;
  
  // Storage operations
  saveToStorage: () => void;
  clearStorage: () => void;
  
  // Import/Export
  importDiagram: (elements: DiagramElement[], threatActors: ThreatActor[]) => Promise<boolean>;
  exportDiagram: () => { elements: DiagramElement[]; threatActors: ThreatActor[] };
  
  // Utility
  getConnectedElements: (elementId: string) => DiagramElement[];
  clearError: () => void;
  
  // Enterprise features
  getCurrentStateSnapshot: () => StateSnapshot;
  addEventListener: (listener: (event: DistributedStateEvent) => void) => void;
  removeEventListener: (listener: (event: DistributedStateEvent) => void) => void;
}

/**
 * Props injected by the HOC
 */
export interface BusinessLogicProps {
  businessLogic: DiagramBusinessLogic;
}

/**
 * Props for UI components (excluding business logic)
 */
export type UIOnlyProps<T> = Omit<T, keyof BusinessLogicProps>;

/**
 * Higher Order Component that provides enterprise business logic to UI components
 * Completely separates UI concerns from distributed state management
 */
export function withBusinessLogic<TProps extends BusinessLogicProps>(
  WrappedComponent: ComponentType<TProps>
) {
  const WithBusinessLogicComponent = (props: UIOnlyProps<TProps> & any) => {
    // Get business logic from distributed context
    const context = useDiagramContext();
    
    // Adapt context to business logic interface
    const businessLogic: DiagramBusinessLogic = {
      // State
      elements: context.elements,
      threatActors: context.threatActors,
      selectedElementId: context.state.selectedElementId,
      
      // Connection status
      isConnected: context.isConnected,
      isLoading: context.isLoading,
      error: context.error,
      
      // Statistics
      stats: context.stats,
      
      // Room management
      initializeRoom: context.initializeRoom,
      switchRoom: context.switchRoom,
      
      // Element operations
      createElement: context.createElement,
      updateElement: context.updateElement,
      deleteElement: context.deleteElement,
      updateElements: context.updateElements,
      deleteElementWithConnections: context.deleteElementWithConnections,
      moveElement: context.moveElement,
      
      // Threat actor operations
      createThreatActor: context.createThreatActor,
      updateThreatActor: context.updateThreatActor,
      deleteThreatActor: context.deleteThreatActor,
      
      // UI operations
      selectElement: context.selectElement,
      
      // Connection operations
      connect: context.connect,
      disconnect: context.disconnect,
      
      // Storage operations
      saveToStorage: context.saveToStorage,
      clearStorage: context.clearStorage,
      
      // Import/Export
      importDiagram: context.importDiagram,
      exportDiagram: context.exportDiagram,
      
      // Utility
      getConnectedElements: context.getConnectedElements,
      clearError: context.clearError,
      
      // Enterprise features
      getCurrentStateSnapshot: context.getCurrentStateSnapshot,
      addEventListener: context.addEventListener,
      removeEventListener: context.removeEventListener,
    };
    
    // Inject business logic into component props
    const enhancedProps = {
      ...props,
      businessLogic,
    } as TProps;

    return <WrappedComponent {...enhancedProps} />;
  };

  // Set display name for debugging
  WithBusinessLogicComponent.displayName = `withBusinessLogic(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithBusinessLogicComponent;
}

/**
 * Hook for accessing business logic in functional components
 * Alternative to HOC for components that prefer hooks
 */
export const useBusinessLogic = (): DiagramBusinessLogic => {
  const context = useDiagramContext();
  
  return {
    // State
    elements: context.elements,
    threatActors: context.threatActors,
    selectedElementId: context.state.selectedElementId,
    
    // Connection status
    isConnected: context.isConnected,
    isLoading: context.isLoading,
    error: context.error,
    
    // Statistics
    stats: context.stats,
    
    // Room management
    initializeRoom: context.initializeRoom,
    switchRoom: context.switchRoom,
    
    // Element operations
    createElement: context.createElement,
    updateElement: context.updateElement,
    deleteElement: context.deleteElement,
    updateElements: context.updateElements,
    deleteElementWithConnections: context.deleteElementWithConnections,
    moveElement: context.moveElement,
    
    // Threat actor operations
    createThreatActor: context.createThreatActor,
    updateThreatActor: context.updateThreatActor,
    deleteThreatActor: context.deleteThreatActor,
    
    // UI operations
    selectElement: context.selectElement,
    
    // Connection operations
    connect: context.connect,
    disconnect: context.disconnect,
    
    // Storage operations
    saveToStorage: context.saveToStorage,
    clearStorage: context.clearStorage,
    
    // Import/Export
    importDiagram: context.importDiagram,
    exportDiagram: context.exportDiagram,
    
    // Utility
    getConnectedElements: context.getConnectedElements,
    clearError: context.clearError,
    
    // Enterprise features
    getCurrentStateSnapshot: context.getCurrentStateSnapshot,
    addEventListener: context.addEventListener,
    removeEventListener: context.removeEventListener,
  };
};