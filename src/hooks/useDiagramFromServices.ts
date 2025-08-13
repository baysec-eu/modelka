// src/hooks/useDiagramFromServices.ts - Hook for accessing diagram operations from DI services
import { useState, useEffect, useMemo } from 'react';
import { DistributedStateManager, DistributedStateEvent } from '../state/distributedStateManager';
import { DiagramElement, ThreatActor } from '../types/diagram';

/**
 * Hook that provides diagram operations from the injected distributed state manager
 */
export function useDiagramFromServices(distributedState?: DistributedStateManager) {
  const [elements, setElements] = useState<DiagramElement[]>([]);
  const [threatActors, setThreatActors] = useState<ThreatActor[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // Subscribe to state changes from the distributed state manager
  useEffect(() => {
    if (!distributedState) {
      // Clear state when distributedState becomes unavailable (room switching)
      setElements([]);
      setThreatActors([]);
      setSelectedElementId(null);
      setStats(null);
      return;
    }

    const handleStateChange = (event: DistributedStateEvent) => {
      switch (event.type) {
        case 'state_initialized':
          // Room initialized - don't clear UI state, let state_updated handle it
          console.log('🏠 Room initialized for room:', event.roomId);
          break;
        case 'state_updated':
          setElements(event.elements);
          setThreatActors(event.threatActors);
          break;
        case 'connection_status_changed':
          setStats((prev: any) => ({
            ...prev,
            isConnected: event.isConnected,
            connectedPeers: event.peerCount,
          }));
          break;
      }
    };

    distributedState.addEventListener(handleStateChange);
    
    // Initialize with current state
    const currentStats = distributedState.getStats();
    setStats(currentStats);

    return () => {
      distributedState.removeEventListener(handleStateChange);
    };
  }, [distributedState]);

  // Computed values
  const selectedElement = useMemo(() => 
    elements.find(el => el.id === selectedElementId) || null,
    [elements, selectedElementId]
  );

  // Return null if distributed state is not available
  if (!distributedState) {
    return null;
  }

  // Return diagram operations interface
  return {
    // State
    elements,
    threatActors,
    selectedElement,
    selectedElementId,
    stats,

    // Element operations
    createElement: async (element: DiagramElement) => {
      return distributedState.createElement(element);
    },

    updateElement: async (id: string, patch: Partial<DiagramElement>) => {
      return distributedState.updateElement(id, patch);
    },

    deleteElement: async (id: string) => {
      return distributedState.deleteElement(id);
    },

    moveElement: async (id: string, position: { x: number; y: number }) => {
      return distributedState.moveElement(id, position);
    },

    // Threat actor operations
    createThreatActor: async (threatActor: ThreatActor) => {
      // For now, use local state - would be implemented in distributed manager
      setThreatActors(prev => [...prev, threatActor]);
      return true;
    },

    updateThreatActor: async (id: string, patch: Partial<ThreatActor>) => {
      setThreatActors(prev => prev.map(ta => 
        ta.id === id ? { ...ta, ...patch } : ta
      ));
      return true;
    },

    deleteThreatActor: async (id: string) => {
      setThreatActors(prev => prev.filter(ta => ta.id !== id));
      return true;
    },

    // UI operations
    selectElement: (elementId: string | null) => {
      setSelectedElementId(elementId);
    },

    // Export/Import
    exportDiagram: () => ({
      elements,
      threatActors,
    }),

    importDiagram: async (newElements: DiagramElement[], newThreatActors: ThreatActor[]) => {
      // Import elements
      for (const element of newElements) {
        await distributedState.createElement(element);
      }
      
      // Import threat actors (local for now)
      setThreatActors(prev => [...prev, ...newThreatActors]);
      
      return true;
    },

    // Utility
    clearError: () => {
      // Implementation would depend on error state management
    },
  };
}