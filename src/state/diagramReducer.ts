// src/state/diagramReducer.ts - Clean, unified reducer with no duplicates
import { DiagramElement, ThreatActor } from '../types/diagram';
import { DiagramEvent, UserPresence } from './DiagramContext';
import { Action } from './diagramActions';
import { StorageService } from './storage';

/**
 * Lightweight EventStore for managing diagram events
 */
export class EventStore {
  private events: DiagramEvent[] = [];

  constructor(initialEvents: DiagramEvent[] = []) {
    this.events = [...initialEvents].sort((a, b) => a.seq - b.seq);
  }

  append(rawEvents: Omit<DiagramEvent, 'seq' | 'actor'>[], actor: string): DiagramEvent[] {
    const startSeq = this.getClock() + 1;
    const newEvents: DiagramEvent[] = rawEvents.map((event, index) => ({
      ...event,
      seq: startSeq + index,
      actor,
    }));

    this.events = [...this.events, ...newEvents];
    return newEvents;
  }

  merge(remoteEvents: DiagramEvent[]): DiagramEvent[] {
    const existingEventKeys = new Set(this.events.map(e => `${e.seq}-${e.actor}`));
    const newEvents = remoteEvents.filter(e => !existingEventKeys.has(`${e.seq}-${e.actor}`));

    if (newEvents.length > 0) {
      this.events = [...this.events, ...newEvents].sort((a, b) => a.seq - b.seq);
    }

    return newEvents;
  }

  replaceAll(newEvents: DiagramEvent[]): void {
    this.events = [...newEvents].sort((a, b) => a.seq - b.seq);
  }

  getAllEvents(): readonly DiagramEvent[] {
    return this.events;
  }

  getEventsAfter(seq: number): readonly DiagramEvent[] {
    return this.events.filter(e => e.seq > seq);
  }

  getClock(): number {
    return this.events.length > 0 ? this.events[this.events.length - 1].seq : 0;
  }
}

/**
 * Core application state interface
 */
export interface DiagramState {
  // Data layer
  view: {
    elements: Record<string, DiagramElement>;
    threatActors: Record<string, ThreatActor>;
  };
  eventStore: EventStore;
  
  // UI state
  selectedElementId: string | null;
  users: Record<string, UserPresence>;
  
  // Connection state
  rtc: any | null; // ServerlessWebRTC
  userId: string;
  isConnected: boolean;
  
  // App state
  isLoading: boolean;
  error: string | null;
  errorContext: string | null;
  lastSaved: number | null;
}

/**
 * Initial state factory
 */
export const createInitialState = (): DiagramState => {
  const userPreferences = StorageService.loadUserPreferences();
  const savedEvents = StorageService.loadEvents();
  const eventStore = new EventStore(savedEvents);
  
  return {
    view: {
      elements: {},
      threatActors: {},
    },
    eventStore,
    selectedElementId: null,
    users: {},
    rtc: null,
    userId: userPreferences.userId,
    isConnected: false,
    isLoading: false,
    error: null,
    errorContext: null,
    lastSaved: StorageService.getMetadata()?.lastModified || null,
  };
};

/**
 * Event replay function - rebuilds view from events
 */
const replayEvents = (events: readonly DiagramEvent[]): DiagramState['view'] => {
  const view: DiagramState['view'] = {
    elements: {},
    threatActors: {},
  };

  for (const event of events) {
    try {
      switch (event.type) {
        case 'element.insert':
          if (event.data && event.data.id && 'type' in event.data && typeof event.data.type === 'string') {
            view.elements[event.data.id] = event.data as DiagramElement;
          }
          break;

        case 'element.update':
          if (event.id && view.elements[event.id] && event.patch) {
            view.elements[event.id] = { ...view.elements[event.id], ...event.patch } as DiagramElement;
          }
          break;

        case 'element.delete':
          if (event.id) {
            delete view.elements[event.id];
            // Also remove connected data flows
            Object.keys(view.elements).forEach(elementId => {
              const element = view.elements[elementId];
              if (element.type === 'data-flow') {
                const flow = element as any;
                if (flow.sourceId === event.id || flow.targetId === event.id) {
                  delete view.elements[elementId];
                }
              }
            });
          }
          break;

        case 'threatActor.insert':
          if (event.data && event.data.id && 'skill' in event.data) {
            view.threatActors[event.data.id] = event.data as ThreatActor;
          }
          break;

        case 'threatActor.update':
          if (event.id && view.threatActors[event.id] && event.patch) {
            view.threatActors[event.id] = { ...view.threatActors[event.id], ...event.patch } as ThreatActor;
          }
          break;

        case 'threatActor.delete':
          if (event.id) {
            delete view.threatActors[event.id];
          }
          break;
      }
    } catch (error) {
      console.error('Error replaying event:', event, error);
    }
  }

  return view;
};

/**
 * Main reducer function
 */
export const diagramReducer = (state: DiagramState, action: Action): DiagramState => {
  try {
    switch (action.type) {
      case 'APPLY_LOCAL_EVENTS': {
        state.eventStore.append(action.payload.events, state.userId);
        const newView = replayEvents(state.eventStore.getAllEvents());
        
        // Auto-save to storage
        StorageService.saveEvents(Array.from(state.eventStore.getAllEvents()));
        
        return {
          ...state,
          view: newView,
          lastSaved: Date.now(),
          error: null,
          errorContext: null,
        };
      }

      case 'APPLY_REMOTE_EVENTS': {
        const appliedEvents = state.eventStore.merge(action.payload.events);
        if (appliedEvents.length === 0) {
          return state; // No changes
        }
        
        const newView = replayEvents(state.eventStore.getAllEvents());
        
        // Save merged state
        StorageService.saveEvents(Array.from(state.eventStore.getAllEvents()));
        
        return {
          ...state,
          view: newView,
          lastSaved: Date.now(),
          error: null,
          errorContext: null,
        };
      }

      case 'INITIALIZE_FROM_HISTORY':
      case 'REPLACE_WITH_FULL_HISTORY': {
        const newEventStore = new EventStore(action.payload.events);
        const newView = replayEvents(newEventStore.getAllEvents());
        
        // Save to storage
        StorageService.saveEvents(action.payload.events);
        
        return {
          ...state,
          eventStore: newEventStore,
          view: newView,
          lastSaved: Date.now(),
          error: null,
          errorContext: null,
        };
      }

      case 'SET_CONNECTION': {
        return {
          ...state,
          rtc: action.payload.rtc,
          userId: action.payload.userId,
          isConnected: true,
          error: null,
          errorContext: null,
        };
      }

      case 'DISCONNECT': {
        return {
          ...state,
          rtc: null,
          isConnected: false,
          users: {}, // Clear remote users
        };
      }

      case 'UPDATE_USER_PRESENCE': {
        return {
          ...state,
          users: {
            ...state.users,
            [action.payload.user.id]: action.payload.user,
          },
        };
      }

      case 'REMOVE_USER': {
        const users = { ...state.users };
        delete users[action.payload.userId];
        return {
          ...state,
          users,
        };
      }

      case 'SELECT_ELEMENT': {
        return {
          ...state,
          selectedElementId: action.payload.elementId,
        };
      }

      case 'LOAD_FROM_STORAGE': {
        const savedEvents = StorageService.loadEvents();
        if (savedEvents.length > 0) {
          const newEventStore = new EventStore(savedEvents);
          const newView = replayEvents(newEventStore.getAllEvents());
          
          return {
            ...state,
            eventStore: newEventStore,
            view: newView,
            lastSaved: StorageService.getMetadata()?.lastModified || null,
            isLoading: false,
            error: null,
            errorContext: null,
          };
        }
        return {
          ...state,
          isLoading: false,
        };
      }

      case 'SAVE_TO_STORAGE': {
        const success = StorageService.saveEvents(Array.from(state.eventStore.getAllEvents()));
        return {
          ...state,
          lastSaved: success ? Date.now() : state.lastSaved,
          error: success ? null : 'Failed to save to storage',
          errorContext: success ? null : 'SAVE_TO_STORAGE',
        };
      }

      case 'CLEAR_STORAGE': {
        StorageService.clearStorage();
        const newEventStore = new EventStore([]);
        return {
          ...state,
          eventStore: newEventStore,
          view: { elements: {}, threatActors: {} },
          lastSaved: null,
          error: null,
          errorContext: null,
        };
      }

      case 'SET_ERROR': {
        return {
          ...state,
          error: action.payload.error,
          errorContext: action.payload.context || null,
        };
      }

      case 'CLEAR_ERROR': {
        return {
          ...state,
          error: null,
          errorContext: null,
        };
      }

      case 'SET_LOADING': {
        return {
          ...state,
          isLoading: action.payload.isLoading,
        };
      }

      default:
        return state;
    }
  } catch (error) {
    console.error('Reducer error:', error, 'Action:', action);
    return {
      ...state,
      error: `Reducer error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errorContext: action.type,
    };
  }
};

/**
 * Selector functions for derived state
 */
export const selectors = {
  // Basic selectors
  getElements: (state: DiagramState): DiagramElement[] => 
    Object.values(state.view.elements),
  
  getThreatActors: (state: DiagramState): ThreatActor[] => 
    Object.values(state.view.threatActors),
  
  getSelectedElement: (state: DiagramState): DiagramElement | null => 
    state.selectedElementId ? state.view.elements[state.selectedElementId] || null : null,
  
  getUsers: (state: DiagramState): UserPresence[] => 
    Object.values(state.users),
  
  // Derived selectors
  getDataFlows: (state: DiagramState): DiagramElement[] =>
    Object.values(state.view.elements).filter(el => el.type === 'data-flow'),
  
  getNonFlowElements: (state: DiagramState): DiagramElement[] =>
    Object.values(state.view.elements).filter(el => el.type !== 'data-flow'),
  
  getConnectedElements: (state: DiagramState, elementId: string): DiagramElement[] => {
    const flows = selectors.getDataFlows(state);
    const connectedIds = new Set<string>();
    
    flows.forEach(flow => {
      const flowData = flow as any;
      if (flowData.sourceId === elementId) {
        connectedIds.add(flowData.targetId);
      } else if (flowData.targetId === elementId) {
        connectedIds.add(flowData.sourceId);
      }
    });
    
    return Array.from(connectedIds)
      .map(id => state.view.elements[id])
      .filter(Boolean);
  },
  
  // Statistics
  getStats: (state: DiagramState) => ({
    elementCount: Object.keys(state.view.elements).length,
    threatActorCount: Object.keys(state.view.threatActors).length,
    eventCount: state.eventStore.getAllEvents().length,
    userCount: Object.keys(state.users).length + (state.isConnected ? 1 : 0),
    isConnected: state.isConnected,
    lastSaved: state.lastSaved,
    storageStats: StorageService.getStorageStats(),
  }),
  
  // Error state
  hasError: (state: DiagramState): boolean => !!state.error,
  getError: (state: DiagramState): { message: string; context: string | null } | null => 
    state.error ? { message: state.error, context: state.errorContext } : null,
};