// src/state/diagramActions.ts - Clean action creators with no duplicates
import { DiagramElement, ThreatActor } from '../types/diagram';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';
import { DiagramEvent, UserPresence } from './DiagramContext';

/**
 * Core diagram event action creators
 * These create the raw events that will be processed by the reducer
 */
export const DiagramEventActions = {
  // Element operations
  createElement: (element: DiagramElement): Omit<DiagramEvent, 'seq' | 'actor'> => ({
    type: 'element.insert',
    data: element,
  }),

  updateElement: (id: string, patch: Partial<DiagramElement>): Omit<DiagramEvent, 'seq' | 'actor'> => ({
    type: 'element.update',
    id,
    patch,
  }),

  deleteElement: (id: string): Omit<DiagramEvent, 'seq' | 'actor'> => ({
    type: 'element.delete',
    id,
  }),

  // Threat actor operations
  createThreatActor: (threatActor: ThreatActor): Omit<DiagramEvent, 'seq' | 'actor'> => ({
    type: 'threatActor.insert',
    data: threatActor,
  }),

  updateThreatActor: (id: string, patch: Partial<ThreatActor>): Omit<DiagramEvent, 'seq' | 'actor'> => ({
    type: 'threatActor.update',
    id,
    patch,
  }),

  deleteThreatActor: (id: string): Omit<DiagramEvent, 'seq' | 'actor'> => ({
    type: 'threatActor.delete',
    id,
  }),
};

/**
 * State management action creators
 * These create actions for the main reducer
 */
export const StateActions = {
  // Event operations
  applyLocalEvents: (events: Omit<DiagramEvent, 'seq' | 'actor'>[]): Action => ({
    type: 'APPLY_LOCAL_EVENTS',
    payload: { events },
  }),

  applyRemoteEvents: (events: DiagramEvent[]): Action => ({
    type: 'APPLY_REMOTE_EVENTS',
    payload: { events },
  }),

  initializeFromHistory: (events: DiagramEvent[]): Action => ({
    type: 'INITIALIZE_FROM_HISTORY',
    payload: { events },
  }),

  replaceWithFullHistory: (events: DiagramEvent[]): Action => ({
    type: 'REPLACE_WITH_FULL_HISTORY',
    payload: { events },
  }),

  // Connection management
  setConnection: (rtc: ServerlessWebRTC, userId: string): Action => ({
    type: 'SET_CONNECTION',
    payload: { rtc, userId },
  }),

  disconnect: (): Action => ({
    type: 'DISCONNECT',
    payload: {},
  }),

  // User management
  updateUserPresence: (user: UserPresence): Action => ({
    type: 'UPDATE_USER_PRESENCE',
    payload: { user },
  }),

  removeUser: (userId: string): Action => ({
    type: 'REMOVE_USER',
    payload: { userId },
  }),

  // Selection management
  selectElement: (elementId: string | null): Action => ({
    type: 'SELECT_ELEMENT',
    payload: { elementId },
  }),

  // Storage operations
  loadFromStorage: (): Action => ({
    type: 'LOAD_FROM_STORAGE',
    payload: {},
  }),

  saveToStorage: (): Action => ({
    type: 'SAVE_TO_STORAGE',
    payload: {},
  }),

  clearStorage: (): Action => ({
    type: 'CLEAR_STORAGE',
    payload: {},
  }),

  // Error handling
  setError: (error: string, context?: string): Action => ({
    type: 'SET_ERROR',
    payload: { error, context },
  }),

  clearError: (): Action => ({
    type: 'CLEAR_ERROR',
    payload: {},
  }),

  // Loading states
  setLoading: (isLoading: boolean, context?: string): Action => ({
    type: 'SET_LOADING',
    payload: { isLoading, context },
  }),
};

/**
 * High-level composite actions
 * These combine multiple actions for common operations
 */
export const CompositeActions = {
  // Batch element updates
  updateElements: (updates: Array<{ id: string; patch: Partial<DiagramElement> }>): Omit<DiagramEvent, 'seq' | 'actor'>[] => 
    updates.map(({ id, patch }) => DiagramEventActions.updateElement(id, patch)),

  // Create data flow connection
  createDataFlow: (
    sourceId: string, 
    targetId: string, 
    flowData: Partial<DiagramElement> = {}
  ): Omit<DiagramEvent, 'seq' | 'actor'> => {
    const dataFlow: DiagramElement = {
      id: `data-flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'data-flow',
      name: flowData.name || 'Data Flow',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      sourceId,
      targetId,
      threats: [],
      technologies: [],
      description: flowData.description || '',
      notes: flowData.notes || '',
      assets: [],
      ...flowData,
    } as DiagramElement;

    return DiagramEventActions.createElement(dataFlow);
  },

  // Delete element and all connected flows
  deleteElementWithConnections: (elementId: string, allElements: DiagramElement[]): Omit<DiagramEvent, 'seq' | 'actor'>[] => {
    const actions: Omit<DiagramEvent, 'seq' | 'actor'>[] = [];
    
    // Delete the main element
    actions.push(DiagramEventActions.deleteElement(elementId));
    
    // Delete all connected data flows
    const connectedFlows = allElements.filter(el => 
      el.type === 'data-flow' && 
      ((el as any).sourceId === elementId || (el as any).targetId === elementId)
    );
    
    connectedFlows.forEach(flow => {
      actions.push(DiagramEventActions.deleteElement(flow.id));
    });
    
    return actions;
  },

  // Import diagram data
  importDiagram: (elements: DiagramElement[], threatActors: ThreatActor[]): Omit<DiagramEvent, 'seq' | 'actor'>[] => [
    ...elements.map(element => DiagramEventActions.createElement(element)),
    ...threatActors.map(threatActor => DiagramEventActions.createThreatActor(threatActor)),
  ],
};

/**
 * Action type definitions
 */
export type Action = 
  | { type: 'APPLY_LOCAL_EVENTS'; payload: { events: Omit<DiagramEvent, 'seq' | 'actor'>[] } }
  | { type: 'APPLY_REMOTE_EVENTS'; payload: { events: DiagramEvent[] } }
  | { type: 'INITIALIZE_FROM_HISTORY'; payload: { events: DiagramEvent[] } }
  | { type: 'REPLACE_WITH_FULL_HISTORY'; payload: { events: DiagramEvent[] } }
  | { type: 'SET_CONNECTION'; payload: { rtc: ServerlessWebRTC; userId: string } }
  | { type: 'DISCONNECT'; payload: {} }
  | { type: 'UPDATE_USER_PRESENCE'; payload: { user: UserPresence } }
  | { type: 'REMOVE_USER'; payload: { userId: string } }
  | { type: 'SELECT_ELEMENT'; payload: { elementId: string | null } }
  | { type: 'LOAD_FROM_STORAGE'; payload: {} }
  | { type: 'SAVE_TO_STORAGE'; payload: {} }
  | { type: 'CLEAR_STORAGE'; payload: {} }
  | { type: 'SET_ERROR'; payload: { error: string; context?: string } }
  | { type: 'CLEAR_ERROR'; payload: {} }
  | { type: 'SET_LOADING'; payload: { isLoading: boolean; context?: string } };

/**
 * Utility functions for action validation
 */
export const ActionValidators = {
  isValidElement: (element: any): element is DiagramElement => {
    return element && 
           typeof element.id === 'string' && 
           typeof element.type === 'string' && 
           element.position && 
           typeof element.position.x === 'number' && 
           typeof element.position.y === 'number' &&
           element.size &&
           typeof element.size.width === 'number' &&
           typeof element.size.height === 'number';
  },

  isValidThreatActor: (threatActor: any): threatActor is ThreatActor => {
    return threatActor && 
           typeof threatActor.id === 'string' &&
           typeof threatActor.name === 'string';
  },

  isValidEvent: (event: any): event is DiagramEvent => {
    return event &&
           typeof event.type === 'string' &&
           typeof event.seq === 'number' &&
           typeof event.actor === 'string' &&
           event.seq >= 0;
  },
};

export type DiagramEventAction = ReturnType<typeof DiagramEventActions[keyof typeof DiagramEventActions]>;
export type StateAction = ReturnType<typeof StateActions[keyof typeof StateActions]>;
export type CompositeAction = ReturnType<typeof CompositeActions[keyof typeof CompositeActions]>;