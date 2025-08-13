// src/stores/useApplicationStore.ts - Zustand store for React-friendly state management
import { create } from 'zustand';
import { ApplicationStateMachine, ApplicationState } from '../state/ApplicationStateMachine';
import { StorageService } from '../services/storageService';
import { DistributedStateManager } from '../state/distributedStateManager';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

export interface ApplicationConfig {
  userId: string;
  roomId: string;
  passphrase?: string | null;
  p2pEnabled: boolean;
}

export interface Services {
  stateMachine: ApplicationStateMachine;
  storage: StorageService;
  distributedState: DistributedStateManager;
  webrtc?: ServerlessWebRTC;
}

export interface ApplicationStore {
  // State
  state: ApplicationState;
  error: string | null;
  retryCount: number;
  services: Partial<Services>;
  config: ApplicationConfig | null;
  isInitializing: boolean;

  // Actions
  initialize: (config: ApplicationConfig) => Promise<void>;
  initializeP2PServices: (config: ApplicationConfig, stateMachine: ApplicationStateMachine) => Promise<void>;
  toggleP2P: (enabled: boolean) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => Promise<void>;
  dispose: () => Promise<void>;

  // Computed
  isReady: () => boolean;
  isLoading: () => boolean;
  isConnected: () => boolean;
  isPrivateMode: () => boolean;
  canRetry: () => boolean;
}

export const useApplicationStore = create<ApplicationStore>((set, get) => ({
  // Initial state
  state: 'uninitialized',
  error: null,
  retryCount: 0,
  services: {},
  config: null,
  isInitializing: false,

  // Initialize application with proper cleanup on React remounts
  initialize: async (config: ApplicationConfig) => {
    const store = get();
    
    // Create a unique initialization key
    const initKey = `${config.userId}-${config.roomId}-${config.p2pEnabled}`;
    
    // More aggressive check to prevent hanging and double initialization
    if (store.isInitializing) {
      console.log('⚡ Already initializing, aborting to prevent hang...');
      return;
    }
    
    if (store.state === 'ready' || store.state === 'private_mode') {
      // Check if it's the same config
      if (store.config && 
          store.config.userId === config.userId &&
          store.config.roomId === config.roomId &&
          store.config.p2pEnabled === config.p2pEnabled) {
        console.log('⚡ Already initialized with same config, skipping...');
        return;
      }
    }

    console.log('🚀 Starting FAST initialization for:', initKey);
    set({ isInitializing: true, config, error: null, retryCount: 0 });

    try {
      // Timeout the entire initialization to prevent hanging
      const initTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Initialization timeout - taking too long')), 10000); // 10s max
      });
      
      const initProcess = async () => {
        // Create fresh service instances (no singletons)
        console.log('🏗️ Creating fresh service instances...');
        const stateMachine = new ApplicationStateMachine();
        const storage = new StorageService();
        const distributedState = new DistributedStateManager();
        
        // Using DistributedStateManager directly for state management
        
        return { stateMachine, storage, distributedState };
      };
      
      const { stateMachine, storage, distributedState } = await Promise.race([
        initProcess(),
        initTimeout
      ]);

      const services = { stateMachine, storage, distributedState };
      
      // Store services and config FIRST
      set({
        services,
        config,
        state: 'initializing_services',
      });
      
      console.log('✅ Services created and stored, fast-tracking state machine...');

      // Subscribe to state machine changes
      stateMachine.onStateChange((newState, context) => {
        console.log(`🎰 State change: ${get().state} → ${newState}`);
        set({
          state: newState,
          error: context.lastError || null,
          retryCount: context.retryCount,
        });
      });

      // Initialize state machine
      console.log('🚀 Initializing state machine...');
      await stateMachine.transition('INIT_START', {
        userId: config.userId,
        roomId: config.roomId,
        passphrase: config.passphrase,
        p2pEnabled: config.p2pEnabled,
        services: [],
      });

      await stateMachine.transition('SERVICES_READY');
      console.log('✅ Services ready, handling P2P mode...');

      // Handle P2P or private mode - simplified for speed
      if (config.p2pEnabled) {
        console.log('🌐 Starting P2P mode...');
        // Try P2P but with quick timeout
        await get().initializeP2PServices(config, stateMachine);
      } else {
        console.log('🔒 Going to private mode immediately...');
        await stateMachine.transition('P2P_DISABLED');
        console.log('✅ Private mode ready');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Application initialization failed:', errorMessage);
      set({ error: errorMessage, state: 'error', retryCount: get().retryCount + 1 });
    } finally {
      set({ isInitializing: false });
    }
  },

  // Initialize P2P services with timeout and offline fallback
  initializeP2PServices: async (
    config: ApplicationConfig,
    stateMachine: ApplicationStateMachine
  ) => {
    const { services } = get();
    
    try {
      console.log('🌐 Initializing P2P networking...');

      const roomPassphrase = config.passphrase || `modelka_${config.roomId.slice(0, 8)}`;

      // Race P2P connection against timeout
      const connectionPromise = ServerlessWebRTC.connect(
        config.roomId,
        config.userId,
        roomPassphrase,
        {
          autoRequestHistory: true,
          heartbeatMs: 1000,
        }
      );

      const webrtc = await Promise.race([
        connectionPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('P2P connection timeout')), 2000) // Reduced to 2s for faster bootstrap
        ),
      ]);

      // Update services with WebRTC
      set({
        services: { ...services, webrtc },
      });

      await stateMachine.transition('P2P_READY');
      
      // Connect to room
      if (services.distributedState) {
        console.log('🔗 Connecting distributed state to WebRTC...');
        await services.distributedState.connect(webrtc, config.userId);
        await services.distributedState.initializeRoom(config.userId, config.roomId);
        
        await stateMachine.transition('ROOM_CONNECTED');
        await new Promise(resolve => setTimeout(resolve, 500)); // Reduced wait time
        await stateMachine.transition('STATE_SYNCED');
        
        console.log('🎉 P2P mode fully initialized!');
      }

    } catch (error) {
      console.error('❌ P2P initialization failed, staying offline:', error);
      await stateMachine.transition('CONNECTION_FAILED', {
        lastError: error instanceof Error ? error.message : 'P2P connection failed',
      });
    }
  },

  // Toggle P2P mode
  toggleP2P: async (enabled: boolean) => {
    console.log(`🔄 P2P toggle requested: ${enabled ? 'ON' : 'OFF'}`);
    
    const { services, config, isInitializing: _isInitializing } = get();
    const stateMachine = services.stateMachine;
    
    if (!stateMachine || !config) {
      console.log('🔄 P2P toggle during early initialization, updating config...');
      
      // Update config immediately so it takes effect
      const currentStore = get();
      if (currentStore.config) {
        set({ config: { ...currentStore.config, p2pEnabled: enabled } });
        console.log(`✅ P2P preference updated to: ${enabled ? 'ON' : 'OFF'}`);
      }
      return;
    }

    try {
      if (enabled) {
        console.log('🌐 Enabling P2P mode...');
        if (stateMachine.can('P2P_ENABLED')) {
          await stateMachine.transition('P2P_ENABLED');
          await get().initializeP2PServices(config, stateMachine);
        } else if (stateMachine.is('private_mode')) {
          // Transition from private mode to P2P
          console.log('🔄 Transitioning from private mode to P2P...');
          await stateMachine.transition('SERVICES_READY');
          await get().initializeP2PServices(config, stateMachine);
        } else {
          console.log(`ℹ️ P2P already enabled or in state: ${stateMachine.getState().state}`);
        }
      } else {
        console.log('🔒 Disabling P2P mode...');
        if (stateMachine.can('P2P_DISABLED')) {
          await stateMachine.transition('P2P_DISABLED');
          
          // Disconnect WebRTC
          const webrtc = services.webrtc;
          if (webrtc) {
            console.log('🔌 Disconnecting WebRTC...');
            webrtc.disconnect();
            set({ services: { ...services, webrtc: undefined } });
          }
        }
      }
      
      console.log(`✅ P2P toggle completed: ${enabled ? 'ON' : 'OFF'}`);
    } catch (error) {
      console.error('❌ Failed to toggle P2P mode:', error);
    }
  },

  // Retry initialization
  retry: async () => {
    const { services, config } = get();
    const stateMachine = services.stateMachine;
    
    if (stateMachine && stateMachine.can('RETRY') && config) {
      await stateMachine.transition('RETRY');
      // Re-attempt P2P if enabled
      if (config.p2pEnabled) {
        await get().initializeP2PServices(config, stateMachine);
      }
    }
  },

  // Reset application completely
  reset: async () => {
    console.log('🔄 Resetting application...');
    
    const { services } = get();
    
    // Cleanup services
    if (services.webrtc) {
      services.webrtc.disconnect();
    }
    if (services.distributedState) {
      services.distributedState.dispose();
    }
    if (services.stateMachine) {
      await services.stateMachine.reset();
    }

    // Reset state
    set({
      state: 'uninitialized',
      error: null,
      retryCount: 0,
      services: {},
      config: null,
      isInitializing: false,
    });

    console.log('✅ Application reset complete');
  },

  // Dispose all services
  dispose: async () => {
    console.log('🗑️ Disposing application (socket-safe cleanup)...');
    
    const { services } = get();
    
    // CRITICAL: Cleanup WebRTC first to prevent socket exhaustion
    if (services.webrtc) {
      console.log('🔌 Disconnecting WebRTC to free sockets...');
      services.webrtc.disconnect();
    }
    
    // Cleanup other services
    if (services.distributedState) {
      services.distributedState.dispose();
    }
    // Using DistributedStateManager directly for all functionality
    if (services.stateMachine) {
      try {
        await services.stateMachine.transition('DISPOSE');
      } catch (error) {
        console.warn('⚠️ State machine disposal error:', error);
      }
    }
    
    // Reset state
    set({
      state: 'uninitialized',
      error: null,
      retryCount: 0,
      services: {},
      config: null,
      isInitializing: false,
    });
    
    console.log('✅ Application disposed - sockets freed');
  },

  // Computed getters
  isReady: () => {
    const state = get().state;
    return state === 'ready' || state === 'private_mode';
  },

  isLoading: () => {
    const state = get().state;
    return ['initializing_services', 'initializing_p2p', 'connecting_room', 'syncing_state'].includes(state);
  },

  isConnected: () => get().state === 'ready',

  isPrivateMode: () => get().state === 'private_mode',

  canRetry: () => {
    const { state, retryCount } = get();
    return state === 'error' && retryCount < 3;
  },
}));