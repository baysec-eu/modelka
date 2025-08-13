// src/hooks/useDistributedDiagram.ts - Business logic hook for distributed diagram state
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiagramElement, ThreatActor } from '../types/diagram';
import { ConsensusProtocol } from '../state/consensusProtocol';
import { StorageService } from '../state/storage';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

export interface DiagramBusinessLogic {
  // State
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  selectedElementId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  stats: any;
  
  // Element operations
  createElement: (element: DiagramElement) => Promise<boolean>;
  updateElement: (id: string, patch: Partial<DiagramElement>) => Promise<boolean>;
  deleteElement: (id: string) => Promise<boolean>;
  deleteElementWithConnections: (id: string) => Promise<boolean>;
  updateElements: (updates: Array<{ id: string; patch: Partial<DiagramElement> }>) => Promise<boolean>;
  
  // Threat actor operations
  createThreatActor: (threatActor: ThreatActor) => Promise<boolean>;
  updateThreatActor: (id: string, patch: Partial<ThreatActor>) => Promise<boolean>;
  deleteThreatActor: (id: string) => Promise<boolean>;
  
  // Data flow operations
  createDataFlow: (sourceId: string, targetId: string, flowData?: Partial<DiagramElement>) => Promise<boolean>;
  
  // Selection
  selectElement: (elementId: string | null) => void;
  
  // Connection management
  connect: (rtc: ServerlessWebRTC, userId: string) => void;
  disconnect: () => void;
  
  // Storage operations
  saveToStorage: () => Promise<boolean>;
  loadFromStorage: () => Promise<boolean>;
  clearStorage: () => void;
  
  // Import/Export
  importDiagram: (elements: DiagramElement[], threatActors: ThreatActor[]) => Promise<boolean>;
  exportDiagram: () => { elements: DiagramElement[]; threatActors: ThreatActor[] };
  
  // Utility
  getConnectedElements: (elementId: string) => DiagramElement[];
  clearError: () => void;
}

/**
 * Main business logic hook for distributed diagram management
 */
export const useDistributedDiagram = (nodeId: string): DiagramBusinessLogic => {
  const [consensus] = useState(() => new ConsensusProtocol(nodeId));
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0); // Force re-renders
  
  const rtcRef = useRef<ServerlessWebRTC | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get current state from consensus protocol
  const { elements: elementsMap, threatActors: threatActorsMap } = consensus.getConsensusState();
  
  const elements = useMemo(() => Array.from(elementsMap.values()), [elementsMap, lastUpdate]);
  const threatActors = useMemo(() => Array.from(threatActorsMap.values()), [threatActorsMap, lastUpdate]);
  const stats = useMemo(() => consensus.getStats(), [lastUpdate]);

  // Force periodic re-renders to sync with consensus state
  useEffect(() => {
    updateIntervalRef.current = setInterval(() => {
      setLastUpdate(Date.now());
    }, 1000); // Update every second

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, []);

  // Load from storage on initialization
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        setIsLoading(true);
        const savedEvents = StorageService.loadEvents();
        
        if (savedEvents.length > 0) {
          // Convert saved events to CRDT operations
          for (const event of savedEvents) {
            const operation = consensus.getCRDTState().createOperation(
              event.type.includes('delete') ? 'delete' : 
              event.type.includes('update') ? 'update' : 'insert',
              event.type.includes('threatActor') ? 'threatActor' : 'element',
              event.id || (event.data as any)?.id || '',
              event.data,
              event.patch
            );
            consensus.getCRDTState().addLocalOperation(operation);
          }
        }
      } catch (err) {
        setError(`Failed to load initial state: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [consensus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      consensus.shutdown();
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [consensus]);

  // Element operations
  const createElement = useCallback(async (element: DiagramElement): Promise<boolean> => {
    try {
      const success = await consensus.proposeStateChange('insert', 'element', element.id, element);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to create element: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const updateElement = useCallback(async (id: string, patch: Partial<DiagramElement>): Promise<boolean> => {
    try {
      const success = await consensus.proposeStateChange('update', 'element', id, undefined, patch);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to update element: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const deleteElement = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await consensus.proposeStateChange('delete', 'element', id);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to delete element: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const deleteElementWithConnections = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Find all connected data flows
      const connectedFlows = elements.filter(el => 
        el.type === 'data-flow' && 
        ((el as any).sourceId === id || (el as any).targetId === id)
      );

      // Delete main element
      let success = await consensus.proposeStateChange('delete', 'element', id);
      
      // Delete connected flows
      for (const flow of connectedFlows) {
        if (success) {
          success = await consensus.proposeStateChange('delete', 'element', flow.id);
        }
      }

      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to delete element with connections: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus, elements]);

  const updateElements = useCallback(async (updates: Array<{ id: string; patch: Partial<DiagramElement> }>): Promise<boolean> => {
    try {
      let allSuccess = true;
      for (const { id, patch } of updates) {
        const success = await consensus.proposeStateChange('update', 'element', id, undefined, patch);
        if (!success) allSuccess = false;
      }
      
      if (allSuccess) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return allSuccess;
    } catch (err) {
      setError(`Failed to update elements: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  // Threat actor operations
  const createThreatActor = useCallback(async (threatActor: ThreatActor): Promise<boolean> => {
    try {
      const success = await consensus.proposeStateChange('insert', 'threatActor', threatActor.id, threatActor);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to create threat actor: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const updateThreatActor = useCallback(async (id: string, patch: Partial<ThreatActor>): Promise<boolean> => {
    try {
      const success = await consensus.proposeStateChange('update', 'threatActor', id, undefined, patch);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to update threat actor: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const deleteThreatActor = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await consensus.proposeStateChange('delete', 'threatActor', id);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to delete threat actor: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  // Data flow operations
  const createDataFlow = useCallback(async (sourceId: string, targetId: string, flowData?: Partial<DiagramElement>): Promise<boolean> => {
    try {
      const dataFlow: DiagramElement = {
        id: `data-flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'data-flow',
        name: flowData?.name || 'Data Flow',
        position: { x: 0, y: 0 },
        size: { width: 0, height: 0 },
        sourceId,
        targetId,
        threats: [],
        technologies: [],
        description: flowData?.description || '',
        notes: flowData?.notes || '',
        assets: [],
        ...flowData,
      } as DiagramElement;

      const success = await consensus.proposeStateChange('insert', 'element', dataFlow.id, dataFlow);
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      return success;
    } catch (err) {
      setError(`Failed to create data flow: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  // Connection management
  const connect = useCallback((rtc: ServerlessWebRTC, _userId: string) => {
    rtcRef.current = rtc;
    consensus.initialize(rtc);
    setIsConnected(true);
    setError(null);
  }, [consensus]);

  const disconnect = useCallback(() => {
    if (rtcRef.current) {
      consensus.shutdown();
      rtcRef.current = null;
      setIsConnected(false);
    }
  }, [consensus]);

  // Storage operations
  const saveToStorageInternal = useCallback(async (): Promise<boolean> => {
    try {
      const operations = consensus.getCRDTState().getAllOperations();
      const events = operations.map(op => ({
        type: `${op.entity}.${op.type}` as any,
        data: op.data,
        id: op.entityId,
        patch: op.patch,
        seq: Math.max(...Object.values(op.timestamp.serialize())),
        actor: op.nodeId,
      }));
      
      return StorageService.saveEvents(events);
    } catch (err) {
      setError(`Failed to save to storage: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const saveToStorage = useCallback(async (): Promise<boolean> => {
    return await saveToStorageInternal();
  }, [saveToStorageInternal]);

  const loadFromStorage = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      // Events are already loaded in useEffect
      return true;
    } catch (err) {
      setError(`Failed to load from storage: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearStorage = useCallback(() => {
    StorageService.clearStorage();
    // Reset consensus state would require recreating the instance
    setLastUpdate(Date.now());
  }, []);

  // Import/Export
  const importDiagram = useCallback(async (elements: DiagramElement[], threatActors: ThreatActor[]): Promise<boolean> => {
    try {
      let success = true;
      
      for (const element of elements) {
        const result = await consensus.proposeStateChange('insert', 'element', element.id, element);
        if (!result) success = false;
      }
      
      for (const threatActor of threatActors) {
        const result = await consensus.proposeStateChange('insert', 'threatActor', threatActor.id, threatActor);
        if (!result) success = false;
      }
      
      if (success) {
        setLastUpdate(Date.now());
        await saveToStorageInternal();
      }
      
      return success;
    } catch (err) {
      setError(`Failed to import diagram: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  }, [consensus]);

  const exportDiagram = useCallback((): { elements: DiagramElement[]; threatActors: ThreatActor[] } => {
    return { elements, threatActors };
  }, [elements, threatActors]);

  // Utility functions
  const getConnectedElements = useCallback((elementId: string): DiagramElement[] => {
    const flows = elements.filter(el => el.type === 'data-flow');
    const connectedIds = new Set<string>();
    
    flows.forEach(flow => {
      const flowData = flow as any;
      if (flowData.sourceId === elementId) {
        connectedIds.add(flowData.targetId);
      } else if (flowData.targetId === elementId) {
        connectedIds.add(flowData.sourceId);
      }
    });
    
    return elements.filter(el => connectedIds.has(el.id));
  }, [elements]);

  const selectElement = useCallback((elementId: string | null) => {
    setSelectedElementId(elementId);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    elements,
    threatActors,
    selectedElementId,
    isConnected,
    isLoading,
    error,
    stats,
    
    // Operations
    createElement,
    updateElement,
    deleteElement,
    deleteElementWithConnections,
    updateElements,
    createThreatActor,
    updateThreatActor,
    deleteThreatActor,
    createDataFlow,
    selectElement,
    connect,
    disconnect,
    saveToStorage,
    loadFromStorage,
    clearStorage,
    importDiagram,
    exportDiagram,
    getConnectedElements,
    clearError,
  };
};