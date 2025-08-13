// src/state/ApplicationStateMachine.ts - Enterprise-grade state machine for application lifecycle
/**
 * Application state machine for managing P2P threat modeling system states
 * Ensures proper initialization order and handles failure recovery
 */

export type ApplicationState = 
  | 'uninitialized'
  | 'initializing_services'
  | 'initializing_p2p'
  | 'connecting_room'
  | 'syncing_state'
  | 'ready'
  | 'private_mode'
  | 'error'
  | 'reconnecting'
  | 'disposing';

export type ApplicationEvent = 
  | 'INIT_START'
  | 'SERVICES_READY'
  | 'P2P_READY'
  | 'ROOM_CONNECTED'
  | 'STATE_SYNCED'
  | 'P2P_DISABLED'
  | 'P2P_ENABLED'
  | 'CONNECTION_FAILED'
  | 'RETRY'
  | 'RESET'
  | 'DISPOSE';

export interface StateContext {
  userId?: string;
  roomId?: string;
  passphrase?: string | null;
  p2pEnabled: boolean;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  services: string[];
  connectedPeers: number;
}

export interface StateTransition {
  from: ApplicationState;
  event: ApplicationEvent;
  to: ApplicationState;
  guard?: (context: StateContext) => boolean;
  action?: (context: StateContext) => Promise<void> | void;
}

/**
 * Enterprise state machine with fail-safe recovery and audit logging
 */
export class ApplicationStateMachine {
  private state: ApplicationState = 'uninitialized';
  private context: StateContext;
  private transitions: StateTransition[] = [];
  private listeners = new Set<(state: ApplicationState, context: StateContext) => void>();
  private history: Array<{state: ApplicationState; timestamp: number; event?: ApplicationEvent}> = [];

  constructor(initialContext: Partial<StateContext> = {}) {
    this.context = {
      p2pEnabled: true,
      retryCount: 0,
      maxRetries: 3,
      services: [],
      connectedPeers: 0,
      ...initialContext
    };

    this.defineTransitions();
    this.addToHistory(this.state);
    console.log('🎰 Application state machine initialized');
  }

  /**
   * Define all valid state transitions
   */
  private defineTransitions(): void {
    this.transitions = [
      // Initialization flow
      { from: 'uninitialized', event: 'INIT_START', to: 'initializing_services' },
      { from: 'initializing_services', event: 'SERVICES_READY', to: 'initializing_p2p',
        guard: (ctx) => ctx.p2pEnabled },
      { from: 'initializing_services', event: 'P2P_DISABLED', to: 'private_mode' },
      { from: 'initializing_p2p', event: 'P2P_READY', to: 'connecting_room' },
      { from: 'connecting_room', event: 'ROOM_CONNECTED', to: 'syncing_state' },
      { from: 'syncing_state', event: 'STATE_SYNCED', to: 'ready' },

      // P2P mode switching
      { from: 'ready', event: 'P2P_DISABLED', to: 'private_mode' },
      { from: 'private_mode', event: 'P2P_ENABLED', to: 'initializing_p2p' },
      { from: 'ready', event: 'P2P_ENABLED', to: 'ready' }, // No-op if already in P2P
      
      // Handle P2P toggle during initialization
      { from: 'initializing_services', event: 'P2P_DISABLED', to: 'private_mode' },
      { from: 'initializing_p2p', event: 'P2P_DISABLED', to: 'private_mode' },
      { from: 'connecting_room', event: 'P2P_DISABLED', to: 'private_mode' },
      { from: 'syncing_state', event: 'P2P_DISABLED', to: 'private_mode' },

      // Error handling and recovery
      { from: 'initializing_services', event: 'CONNECTION_FAILED', to: 'error' },
      { from: 'initializing_p2p', event: 'CONNECTION_FAILED', to: 'error' },
      { from: 'connecting_room', event: 'CONNECTION_FAILED', to: 'error' },
      { from: 'syncing_state', event: 'CONNECTION_FAILED', to: 'error' },
      { from: 'ready', event: 'CONNECTION_FAILED', to: 'reconnecting' },

      // Retry and recovery
      { from: 'error', event: 'RETRY', to: 'initializing_services',
        guard: (ctx) => ctx.retryCount < ctx.maxRetries },
      { from: 'error', event: 'RETRY', to: 'error', // Stay in error if max retries reached
        guard: (ctx) => ctx.retryCount >= ctx.maxRetries },
      { from: 'reconnecting', event: 'RETRY', to: 'initializing_p2p',
        guard: (ctx) => ctx.p2pEnabled },
      { from: 'reconnecting', event: 'RETRY', to: 'private_mode',
        guard: (ctx) => !ctx.p2pEnabled },

      // Reset and cleanup - allow from any state to prevent hanging
      { from: 'error', event: 'RESET', to: 'uninitialized' },
      { from: 'reconnecting', event: 'RESET', to: 'uninitialized' },
      { from: 'ready', event: 'DISPOSE', to: 'disposing' },
      { from: 'private_mode', event: 'DISPOSE', to: 'disposing' },
      { from: 'initializing_services', event: 'DISPOSE', to: 'disposing' },
      { from: 'initializing_p2p', event: 'DISPOSE', to: 'disposing' },
      { from: 'connecting_room', event: 'DISPOSE', to: 'disposing' },
      { from: 'syncing_state', event: 'DISPOSE', to: 'disposing' },
    ];
  }

  /**
   * Transition to new state with event
   */
  async transition(event: ApplicationEvent, payload?: Partial<StateContext>): Promise<boolean> {
    console.log(`🎰 State machine event: ${this.state} + ${event}`);

    // Update context with payload
    if (payload) {
      this.context = { ...this.context, ...payload };
    }

    // Find valid transition
    const transition = this.transitions.find(t => 
      t.from === this.state && 
      t.event === event &&
      (!t.guard || t.guard(this.context))
    );

    if (!transition) {
      console.warn(`⚠️ Invalid transition: ${this.state} + ${event}`);
      return false;
    }

    const oldState = this.state;
    const newState = transition.to;

    // Execute transition action
    try {
      if (transition.action) {
        await transition.action(this.context);
      }

      // Update state
      this.state = newState;
      this.addToHistory(newState, event);
      
      // Audit sensitive state changes
      this.auditTransition(oldState, newState, event);
      
      // Notify listeners
      this.notifyListeners();
      
      console.log(`✅ State transition: ${oldState} → ${newState}`);
      return true;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ State transition failed: ${oldState} → ${newState} - ${errorMsg}`);
      
      this.context.lastError = errorMsg;
      
      // Attempt error recovery
      await this.transition('CONNECTION_FAILED', { lastError: errorMsg });
      return false;
    }
  }

  /**
   * Get current state and context
   */
  getState(): { state: ApplicationState; context: StateContext } {
    return { state: this.state, context: { ...this.context } };
  }

  /**
   * Check if state machine is in a given state
   */
  is(state: ApplicationState): boolean {
    return this.state === state;
  }

  /**
   * Check if state machine can handle an event
   */
  can(event: ApplicationEvent): boolean {
    return this.transitions.some(t => 
      t.from === this.state && 
      t.event === event &&
      (!t.guard || t.guard(this.context))
    );
  }

  /**
   * Listen to state changes
   */
  onStateChange(listener: (state: ApplicationState, context: StateContext) => void): () => void {
    this.listeners.add(listener);
    
    // Call immediately with current state
    listener(this.state, { ...this.context });
    
    return () => this.listeners.delete(listener);
  }

  /**
   * Get state history for debugging
   */
  getHistory(): Array<{state: ApplicationState; timestamp: number; event?: ApplicationEvent}> {
    return [...this.history];
  }

  /**
   * Reset state machine to initial state
   */
  async reset(): Promise<void> {
    console.log('🔄 Resetting application state machine');
    
    this.state = 'uninitialized';
    this.context.retryCount = 0;
    this.context.lastError = undefined;
    this.history = [];
    this.addToHistory(this.state);
    
    this.notifyListeners();
  }

  /**
   * Get health check information
   */
  getHealth(): {
    state: ApplicationState;
    isHealthy: boolean;
    uptime: number;
    errors: string[];
    retryCount: number;
  } {
    const startTime = this.history[0]?.timestamp || Date.now();
    const isHealthy = !['error', 'disposing'].includes(this.state);
    
    return {
      state: this.state,
      isHealthy,
      uptime: Date.now() - startTime,
      errors: this.context.lastError ? [this.context.lastError] : [],
      retryCount: this.context.retryCount
    };
  }

  private addToHistory(state: ApplicationState, event?: ApplicationEvent): void {
    this.history.push({ state, timestamp: Date.now(), event });
    
    // Keep only last 50 entries to prevent memory bloat
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state, { ...this.context });
      } catch (error) {
        console.warn('⚠️ State machine listener error:', error);
      }
    });
  }

  private auditTransition(from: ApplicationState, to: ApplicationState, event: ApplicationEvent): void {
    // Audit sensitive events for security monitoring
    const sensitiveEvents = ['P2P_DISABLED', 'P2P_ENABLED', 'CONNECTION_FAILED', 'RESET'];
    
    if (sensitiveEvents.includes(event)) {
      console.log(`🔍 AUDIT: State transition ${from} → ${to} via ${event}`, {
        userId: this.context.userId,
        roomId: this.context.roomId,
        timestamp: Date.now(),
        context: { ...this.context }
      });
    }
  }
}

export default ApplicationStateMachine;