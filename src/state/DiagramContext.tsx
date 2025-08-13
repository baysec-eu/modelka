// src/state/DiagramContext.tsx - Enterprise-grade distributed context
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { DiagramElement, ThreatActor } from '../types/diagram';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';
import { 
  DistributedStateManager, 
  DistributedStateEvent, 
  DistributedStateStats,
  StateSnapshot 
} from './distributedStateManager';
import { Session } from './sessionManager';

/* ------------------------------------------------------------------------- */
/* Types                                                                     */
/* ------------------------------------------------------------------------- */

export interface DiagramEvent {
  type: 'element.insert' | 'element.update' | 'element.delete' | 
        'threatActor.insert' | 'threatActor.update' | 'threatActor.delete';
  data?: DiagramElement | ThreatActor;
  id?: string;
  patch?: Partial<DiagramElement> | Partial<ThreatActor>;
  seq: number;
  actor: string;
}

export interface UserPresence {
  id: string;
  color: string;
  cursor?: { x: number; y: number };
  name?: string;
}

/**
 * Enterprise distributed context state
 */
interface DistributedContextState {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Session info
  currentSession: Session | null;
  currentRoom: string | null;
  userId: string | null;
  
  // Diagram state
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  selectedElementId: string | null;
  
  // Collaboration state
  users: UserPresence[];
  isSyncing: boolean;
  syncProgress: number;
  
  // Statistics
  stats: DistributedStateStats;
}

/* ------------------------------------------------------------------------- */
/* Context Definition                                                        */
/* ------------------------------------------------------------------------- */

interface DiagramContextValue {
  // State
  state: DistributedContextState;
  
  // Selectors (computed)
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  selectedElement: DiagramElement | null;
  users: UserPresence[];
  stats: DistributedStateStats;
  
  // Connection properties
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions - Room management
  initializeRoom: (userId: string, roomId: string) => Promise<void>;
  switchRoom: (roomId: string) => Promise<void>;
  
  // Actions - Element operations
  createElement: (element: DiagramElement) => Promise<boolean>;
  updateElement: (id: string, patch: Partial<DiagramElement>) => Promise<boolean>;
  deleteElement: (id: string) => Promise<boolean>;
  updateElements: (updates: Array<{ id: string; patch: Partial<DiagramElement> }>) => Promise<boolean>;
  deleteElementWithConnections: (elementId: string) => Promise<boolean>;
  moveElement: (elementId: string, position: { x: number; y: number }) => Promise<boolean>;
  
  // Actions - Threat actor operations
  createThreatActor: (threatActor: ThreatActor) => Promise<boolean>;
  updateThreatActor: (id: string, patch: Partial<ThreatActor>) => Promise<boolean>;
  deleteThreatActor: (id: string) => Promise<boolean>;
  
  // Actions - UI operations
  selectElement: (elementId: string | null) => void;
  
  // Actions - Connection operations
  connect: (rtc: ServerlessWebRTC, userId: string) => Promise<void>;
  disconnect: () => void;
  
  // Actions - Storage operations
  saveToStorage: () => void;
  loadFromStorage: () => void;
  clearStorage: () => void;
  
  // Actions - Import/Export
  importDiagram: (elements: DiagramElement[], threatActors: ThreatActor[]) => Promise<boolean>;
  exportDiagram: () => { elements: DiagramElement[]; threatActors: ThreatActor[] };
  
  // Utility functions
  getConnectedElements: (elementId: string) => DiagramElement[];
  clearError: () => void;
  
  // Enterprise features
  getCurrentStateSnapshot: () => StateSnapshot;
  addEventListener: (listener: (event: DistributedStateEvent) => void) => void;
  removeEventListener: (listener: (event: DistributedStateEvent) => void) => void;
}

const DiagramContext = createContext<DiagramContextValue | null>(null);

/* ------------------------------------------------------------------------- */
/* Hook                                                                      */
/* ------------------------------------------------------------------------- */

export const useDiagramContext = (): DiagramContextValue => {
  const context = useContext(DiagramContext);
  if (!context) {
    throw new Error('useDiagramContext must be used within DiagramProvider');
  }
  return context;
};

/* ------------------------------------------------------------------------- */
/* Provider Component                                                        */
/* ------------------------------------------------------------------------- */

interface DiagramProviderProps {
  children: ReactNode;
  userId?: string; // For initial user ID
  roomId?: string; // For initial room ID
}

// Global initialization tracker to prevent multiple instances
let globalInitializationInProgress = false;
let globalRoomId: string | null = null;

export const DiagramProvider: React.FC<DiagramProviderProps> = ({ 
  children,
  userId: initialUserId,
  roomId: initialRoomId
}) => {
  // Distributed state manager instance
  const distributedStateManager = useRef<DistributedStateManager | null>(null);
  
  // Local state
  const [state, setState] = useState<DistributedContextState>({
    isConnected: false,
    isLoading: false,
    error: null,
    currentSession: null,
    currentRoom: null,
    userId: null,
    elements: [],
    threatActors: [],
    selectedElementId: null,
    users: [],
    isSyncing: false,
    syncProgress: 0,
    stats: {
      isConnected: false,
      isLeader: false,
      connectedPeers: 0,
      isStable: true,
      currentRoom: null,
      currentSession: null,
      operationsApplied: 0,
      conflictsResolved: 0,
      transformationsPerformed: 0,
      eventsStored: 0,
      snapshotsCreated: 0,
      messagesReceived: 0,
      messagesSent: 0,
      networkPartitions: 0,
      electionsStarted: 0,
      currentTerm: 0,
      averageTransformTime: 0,
      peakOperationsPerSecond: 0,
    },
  });
  
  // Extract event handler setup into separate function
  const setupEventHandlers = () => {
    if (!distributedStateManager.current) return;
    
    // Clear global initialization flag - we're done initializing
    globalInitializationInProgress = false;
    console.log('✅ DiagramContext: Initialization completed, clearing global flag');

    // Setup event listeners
    const handleDistributedEvent = (event: DistributedStateEvent) => {
        switch (event.type) {
          case 'state_initialized':
            setState(prev => ({
              ...prev,
              currentSession: event.session,
              currentRoom: event.roomId,
              isLoading: false,
            }));
            break;
            
          case 'state_updated':
            setState(prev => ({
              ...prev,
              elements: event.elements,
              threatActors: event.threatActors,
            }));
            break;
            
          case 'connection_status_changed':
            setState(prev => ({
              ...prev,
              isConnected: event.isConnected,
              stats: {
                ...prev.stats,
                isConnected: event.isConnected,
                connectedPeers: event.peerCount,
              },
            }));
            break;
            
          case 'leadership_changed':
            setState(prev => ({
              ...prev,
              stats: {
                ...prev.stats,
                isLeader: event.isLeader,
              },
            }));
            break;
            
          case 'sync_status_changed':
            setState(prev => ({
              ...prev,
              isSyncing: event.isSyncing,
              syncProgress: event.progress || 0,
            }));
            break;
            
          case 'error_occurred':
            setState(prev => ({
              ...prev,
              error: event.error,
            }));
            break;
        }
      };
      
      distributedStateManager.current.addEventListener(handleDistributedEvent);
      
      // Auto-initialize if userId and roomId provided
      if (initialUserId && initialRoomId) {
        distributedStateManager.current.initializeRoom(initialUserId, initialRoomId)
          .then(() => {
            setState(prev => ({ ...prev, userId: initialUserId }));
          })
          .catch((error) => {
            setState(prev => ({
              ...prev,
              error: error instanceof Error ? error.message : 'Failed to initialize room',
              isLoading: false,
            }));
          });
      }
    };
  
  // Initialize distributed state manager properly - no hacks  
  useEffect(() => {
    if (!initialUserId || !initialRoomId) return; // Wait for required params
    if (distributedStateManager.current) return; // Prevent duplicate initialization
    
    // Global guard against multiple initializations
    if (globalInitializationInProgress && globalRoomId === initialRoomId) {
      console.log('⏸️ Skipping initialization - already in progress for room:', initialRoomId);
      return;
    }
    
    globalInitializationInProgress = true;
    globalRoomId = initialRoomId;
    
    console.log('🚀 DiagramContext: Starting initialization for', { initialUserId, initialRoomId });
    
    // Create standalone distributed state manager
    console.log('🆕 Creating standalone distributed state manager');
    distributedStateManager.current = new DistributedStateManager();
    setupEventHandlers();
  }, [initialUserId, initialRoomId]);
  
  // Update stats periodically - pause when tab is hidden
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    const startStatsUpdates = () => {
      if (interval) return; // Already running
      interval = setInterval(() => {
        if (distributedStateManager.current && !document.hidden) {
          const newStats = distributedStateManager.current.getStats();
          setState(prev => ({ ...prev, stats: newStats }));
        }
      }, document.hidden ? 60000 : 15000); // Much slower - only for connection status display
    };
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden - clear interval to prevent Safari storage exhaustion
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        // Tab visible - restart updates
        startStatsUpdates();
      }
    };
    
    // Start initial updates
    startStatsUpdates();
    
    // Listen for tab visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Computed values
  const elements = state.elements;
  const threatActors = state.threatActors;
  const selectedElement = React.useMemo(() => 
    elements.find(el => el.id === state.selectedElementId) || null, 
    [elements, state.selectedElementId]
  );
  const users = state.users;
  const stats = state.stats;

  // Action creators
  const contextValue: DiagramContextValue = React.useMemo(() => ({
    // State
    state,
    
    // Computed values
    elements,
    threatActors,
    selectedElement,
    users,
    stats,
    
    // Connection properties
    isConnected: state.isConnected,
    isLoading: state.isLoading,
    error: state.error,
    
    // Room management
    initializeRoom: async (userId: string, roomId: string) => {
      if (!distributedStateManager.current) return;
      
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      try {
        await distributedStateManager.current.initializeRoom(userId, roomId);
        setState(prev => ({
          ...prev,
          userId,
          currentRoom: roomId,
          isLoading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to initialize room',
          isLoading: false,
        }));
      }
    },
    
    switchRoom: async (roomId: string) => {
      if (!distributedStateManager.current || !state.userId) return;
      
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      try {
        await distributedStateManager.current.initializeRoom(state.userId, roomId);
        setState(prev => ({
          ...prev,
          currentRoom: roomId,
          isLoading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to switch room',
          isLoading: false,
        }));
      }
    },
    
    // Element operations
    createElement: async (element: DiagramElement) => {
      if (!distributedStateManager.current) return false;
      return distributedStateManager.current.createElement(element);
    },
    
    updateElement: async (id: string, patch: Partial<DiagramElement>) => {
      if (!distributedStateManager.current) return false;
      return distributedStateManager.current.updateElement(id, patch);
    },
    
    deleteElement: async (id: string) => {
      if (!distributedStateManager.current) return false;
      return distributedStateManager.current.deleteElement(id);
    },
    
    updateElements: async (updates: Array<{ id: string; patch: Partial<DiagramElement> }>) => {
      if (!distributedStateManager.current) return false;
      
      let allSuccess = true;
      for (const update of updates) {
        const success = await distributedStateManager.current.updateElement(update.id, update.patch);
        if (!success) allSuccess = false;
      }
      return allSuccess;
    },
    
    deleteElementWithConnections: async (elementId: string) => {
      if (!distributedStateManager.current) return false;
      
      // Find connected elements
      const connectedElements = getConnectedElements(elementId);
      
      // Delete connections first
      for (const _connected of connectedElements) {
        // In a real implementation, you'd delete the connections
        // For now, we'll just delete the main element
      }
      
      return distributedStateManager.current.deleteElement(elementId);
    },
    
    moveElement: async (elementId: string, position: { x: number; y: number }) => {
      if (!distributedStateManager.current) return false;
      return distributedStateManager.current.moveElement(elementId, position);
    },
    
    // Threat actor operations
    createThreatActor: async (threatActor: ThreatActor) => {
      // For now, use legacy approach - would be implemented in distributed manager
      setState(prev => ({
        ...prev,
        threatActors: [...prev.threatActors, threatActor],
      }));
      return true;
    },
    
    updateThreatActor: async (id: string, patch: Partial<ThreatActor>) => {
      setState(prev => ({
        ...prev,
        threatActors: prev.threatActors.map(ta => 
          ta.id === id ? { ...ta, ...patch } : ta
        ),
      }));
      return true;
    },
    
    deleteThreatActor: async (id: string) => {
      setState(prev => ({
        ...prev,
        threatActors: prev.threatActors.filter(ta => ta.id !== id),
      }));
      return true;
    },
    
    // UI operations
    selectElement: (elementId: string | null) => {
      setState(prev => ({ ...prev, selectedElementId: elementId }));
    },
    
    // Connection operations
    connect: async (rtc: ServerlessWebRTC, userId: string) => {
      if (!distributedStateManager.current) return;
      
      setState(prev => ({ ...prev, isLoading: true }));
      
      try {
        await distributedStateManager.current.connect(rtc, userId);
        setState(prev => ({
          ...prev,
          isConnected: true,
          userId,
          isLoading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to connect',
          isLoading: false,
        }));
      }
    },
    
    disconnect: () => {
      if (distributedStateManager.current) {
        distributedStateManager.current.shutdown();
      }
      setState(prev => ({
        ...prev,
        isConnected: false,
        currentSession: null,
      }));
    },
    
    // Storage operations (legacy compatibility)
    saveToStorage: () => {
      // In distributed system, this happens automatically
      console.log('Auto-save handled by distributed state manager');
    },
    
    loadFromStorage: () => {
      // In distributed system, this happens automatically
      console.log('Auto-load handled by distributed state manager');
    },
    
    clearStorage: () => {
      setState({
        isConnected: false,
        isLoading: false,
        error: null,
        currentSession: null,
        currentRoom: null,
        userId: null,
        elements: [],
        threatActors: [],
        selectedElementId: null,
        users: [],
        isSyncing: false,
        syncProgress: 0,
        stats: state.stats, // Keep stats
      });
    },
    
    // Import/Export
    importDiagram: async (elements: DiagramElement[], threatActors: ThreatActor[]) => {
      if (!distributedStateManager.current) return false;
      
      let allSuccess = true;
      
      // Import elements
      for (const element of elements) {
        const success = await distributedStateManager.current.createElement(element);
        if (!success) allSuccess = false;
      }
      
      // Import threat actors (legacy approach for now)
      setState(prev => ({
        ...prev,
        threatActors: [...prev.threatActors, ...threatActors],
      }));
      
      return allSuccess;
    },
    
    exportDiagram: () => ({
      elements,
      threatActors,
    }),
    
    // Utility functions
    getConnectedElements: (elementId: string) => {
      // Simple implementation - find elements that reference this element
      return elements.filter(el => 
        JSON.stringify(el).includes(elementId) && el.id !== elementId
      );
    },
    
    clearError: () => {
      setState(prev => ({ ...prev, error: null }));
    },
    
    // Enterprise features
    getCurrentStateSnapshot: () => {
      return distributedStateManager.current?.getCurrentState() || {
        elements: {},
        threatActors: {},
        version: 0,
        lastModified: Date.now(),
        checksum: '',
      };
    },
    
    addEventListener: (listener: (event: DistributedStateEvent) => void) => {
      if (distributedStateManager.current) {
        distributedStateManager.current.addEventListener(listener);
      }
    },
    
    removeEventListener: (listener: (event: DistributedStateEvent) => void) => {
      if (distributedStateManager.current) {
        distributedStateManager.current.removeEventListener(listener);
      }
    },
    
  }), [
    state,
    elements,
    threatActors,
    selectedElement,
    users,
    stats
  ]);

  return (
    <DiagramContext.Provider value={contextValue}>
      {children}
    </DiagramContext.Provider>
  );
};

/* ------------------------------------------------------------------------- */
/* Export legacy compatibility helpers                                       */
/* ------------------------------------------------------------------------- */

/**
 * Legacy hook for backwards compatibility
 * @deprecated Use useDiagramContext instead
 */
export const useDiagram = useDiagramContext;

/**
 * Helper function to get connected elements (moved from selectors)
 */
function getConnectedElements(_elementId: string): DiagramElement[] {
  // This would be implemented based on your connection logic
  return [];
}