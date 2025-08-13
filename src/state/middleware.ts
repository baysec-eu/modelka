// src/state/middleware.ts - Storage middleware for automatic persistence
import { DiagramState } from './diagramReducer';
import { Action, StateActions } from './diagramActions';
import { StorageService } from './storage';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

/**
 * Middleware function type
 */
export type Middleware = (
  state: DiagramState,
  action: Action,
  dispatch: (action: Action) => void
) => void;

/**
 * Storage persistence middleware
 * Automatically saves state to LocalStorage when needed
 */
export const storageMiddleware: Middleware = (state, action, dispatch) => {
  // Actions that should trigger automatic save
  const autoSaveActions = [
    'APPLY_LOCAL_EVENTS',
    'APPLY_REMOTE_EVENTS',
    'INITIALIZE_FROM_HISTORY',
    'REPLACE_WITH_FULL_HISTORY',
  ];

  if (autoSaveActions.includes(action.type)) {
    try {
      const events = Array.from(state.eventStore.getAllEvents());
      const success = StorageService.saveEvents(events);
      
      if (!success) {
        dispatch(StateActions.setError('Failed to save to storage', action.type));
      }
    } catch (error) {
      console.error('Storage middleware error:', error);
      dispatch(StateActions.setError(
        `Storage error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action.type
      ));
    }
  }
};

/**
 * WebRTC sync middleware
 * Handles P2P synchronization automatically
 */
export const webrtcMiddleware: Middleware = (state, action, dispatch) => {
  if (!state.rtc || !state.isConnected) return;

  switch (action.type) {
    case 'APPLY_LOCAL_EVENTS': {
      // Send local events to peers
      try {
        const events = Array.from(state.eventStore.getAllEvents());
        const unsent = events.slice(-action.payload.events.length); // Get the newly added events
        if (unsent.length > 0) {
          state.rtc.send('events', unsent);
        }
      } catch (error) {
        console.error('Failed to send events to peers:', error);
        dispatch(StateActions.setError('Failed to sync with peers', 'WEBRTC_SYNC'));
      }
      break;
    }

    case 'SET_CONNECTION': {
      // Set up WebRTC event handlers
      const { rtc, userId } = action.payload;
      setupWebRTCHandlers(rtc, userId, dispatch, state);
      break;
    }
  }
};

/**
 * Error recovery middleware
 * Handles automatic error recovery and retry logic
 */
export const errorRecoveryMiddleware: Middleware = (state, action, dispatch) => {
  // Auto-clear errors after successful operations
  const successActions = [
    'APPLY_LOCAL_EVENTS',
    'APPLY_REMOTE_EVENTS',
    'SAVE_TO_STORAGE',
    'LOAD_FROM_STORAGE',
  ];

  if (successActions.includes(action.type) && state.error) {
    dispatch(StateActions.clearError());
  }

  // Retry storage operations on failure
  if (action.type === 'SET_ERROR' && action.payload.context === 'SAVE_TO_STORAGE') {
    setTimeout(() => {
      dispatch(StateActions.saveToStorage());
    }, 5000); // Retry after 5 seconds
  }
};

/**
 * Logging middleware for development
 */
export const loggingMiddleware: Middleware = (state, action, _dispatch) => {
  if (process.env.NODE_ENV === 'development') {
    console.group(`🔄 Action: ${action.type}`);
    console.log('State before:', state);
    console.log('Action payload:', action.payload);
    console.log('Event count:', state.eventStore.getAllEvents().length);
    console.log('Element count:', Object.keys(state.view.elements).length);
    console.groupEnd();
  }
};

/**
 * Performance monitoring middleware
 */
export const performanceMiddleware: Middleware = (_state, action, _dispatch) => {
  const startTime = performance.now();
  
  // Monitor expensive operations
  const expensiveActions = [
    'INITIALIZE_FROM_HISTORY',
    'REPLACE_WITH_FULL_HISTORY',
    'LOAD_FROM_STORAGE',
  ];

  if (expensiveActions.includes(action.type)) {
    setTimeout(() => {
      const duration = performance.now() - startTime;
      if (duration > 100) { // Log if operation takes more than 100ms
        console.warn(`Slow operation detected: ${action.type} took ${duration.toFixed(2)}ms`);
      }
    }, 0);
  }
};

/**
 * Setup WebRTC event handlers
 */
const setupWebRTCHandlers = (
  rtc: ServerlessWebRTC,
  userId: string,
  dispatch: (action: Action) => void,
  state: DiagramState
) => {
  // Handle incoming events
  rtc.on('events', (events: any, from: string) => {
    if (from === userId) return;
    
    try {
      dispatch(StateActions.applyRemoteEvents(events));
    } catch (error) {
      console.error('Failed to apply remote events:', error);
      dispatch(StateActions.setError('Failed to apply remote changes', 'WEBRTC_EVENTS'));
    }
  });

  // Handle full history requests
  rtc.on('request_history', (_data: any, from: string) => {
    if (from === userId) return;
    
    try {
      const allEvents = Array.from(state.eventStore.getAllEvents());
      rtc.send('full_history', allEvents);
    } catch (error) {
      console.error('Failed to send history:', error);
    }
  });

  // Handle full history reception
  rtc.on('full_history', (events: any, from: string) => {
    if (from === userId) return;
    
    try {
      dispatch(StateActions.replaceWithFullHistory(events));
    } catch (error) {
      console.error('Failed to apply full history:', error);
      dispatch(StateActions.setError('Failed to sync full history', 'WEBRTC_FULL_HISTORY'));
    }
  });

  // Handle user presence
  rtc.on('user_presence', (_data: any, from: string) => {
    if (from === userId) return;
    
    dispatch(StateActions.updateUserPresence({
      id: from,
      color: `hsl(${Math.abs(Number(from) || 0) % 360} 70% 60%)`,
      name: `User ${from}`,
    }));
  });

  // Handle user disconnection
  rtc.on('user_disconnect', (_data: any, from: string) => {
    dispatch(StateActions.removeUser(from));
  });

  // Request history from peers
  try {
    rtc.send('request_history', {});
  } catch (error) {
    console.warn('Failed to request history:', error);
  }

  // Announce presence
  try {
    rtc.send('user_presence', { userId });
  } catch (error) {
    console.warn('Failed to announce presence:', error);
  }
};

/**
 * Compose multiple middleware functions
 */
export const composeMiddleware = (...middlewares: Middleware[]): Middleware => {
  return (state, action, dispatch) => {
    middlewares.forEach(middleware => {
      try {
        middleware(state, action, dispatch);
      } catch (error) {
        console.error('Middleware error:', error);
      }
    });
  };
};

/**
 * Default middleware stack
 */
export const defaultMiddleware = composeMiddleware(
  errorRecoveryMiddleware,
  storageMiddleware,
  webrtcMiddleware,
  performanceMiddleware,
  loggingMiddleware
);

/**
 * Production middleware stack (without logging)
 */
export const productionMiddleware = composeMiddleware(
  errorRecoveryMiddleware,
  storageMiddleware,
  webrtcMiddleware,
  performanceMiddleware
);