// src/hooks/useApplicationServices.ts - React hook for StrictMode-compatible service lifecycle
import { useEffect, useRef } from 'react';
import { useApplicationStore, ApplicationConfig } from '../stores/useApplicationStore';

export interface UseApplicationServicesOptions {
  userId: string;
  roomId: string;
  passphrase?: string | null;
  p2pEnabled?: boolean;
}

export function useApplicationServices(options: UseApplicationServicesOptions) {
  const store = useApplicationStore();
  const initializationRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isUnmountingRef = useRef(false);

  // Create config object
  const config: ApplicationConfig = {
    userId: options.userId,
    roomId: options.roomId,
    passphrase: options.passphrase,
    p2pEnabled: options.p2pEnabled ?? true,
  };

  // Initialize services when config changes (room switching) - StrictMode safe
  useEffect(() => {
    const configKey = `${config.userId}-${config.roomId}-${config.p2pEnabled}`;
    
    // Skip if already initialized for this config or if unmounting
    if (initializationRef.current === configKey || isUnmountingRef.current) {
      console.log('⚡ Skipping initialization - already done or unmounting:', configKey);
      return;
    }

    // CRITICAL: Cleanup previous initialization if needed to prevent socket leaks
    if (cleanupRef.current && !isUnmountingRef.current) {
      console.log('🧹 Cleaning up previous initialization to prevent socket exhaustion...');
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Mark as initializing for this config
    initializationRef.current = configKey;
    
    console.log('🎯 Initializing services for config (StrictMode-safe):', configKey);
    
    // Initialize with the store only if not unmounting
    if (!isUnmountingRef.current) {
      store.initialize(config).catch(error => {
        console.error('❌ Service initialization failed:', error);
      });
    }

    // Cleanup function for unmount or config change
    cleanupRef.current = () => {
      // Skip cleanup if we're in an unmounting cycle (StrictMode protection)
      if (isUnmountingRef.current) {
        console.log('⚡ Skipping cleanup - component unmounting');
        return;
      }
      
      console.log('🧹 Cleaning up services for config (preventing socket leaks):', configKey);
      
      // Only dispose if this is still the current config
      if (initializationRef.current === configKey) {
        // CRITICAL: Force immediate cleanup to prevent socket exhaustion
        store.dispose().catch(error => {
          console.warn('⚠️ Service disposal failed:', error);
        });
        initializationRef.current = null;
      }
    };

    // Cleanup on unmount or config change
    return cleanupRef.current;
  }, [config.userId, config.roomId]); // Re-initialize when room changes

  // Cleanup on unmount to prevent socket leaks
  useEffect(() => {
    return () => {
      console.log('🧹 Component unmounting - marking for cleanup...');
      isUnmountingRef.current = true;
      
      // Only run cleanup if we have one and we're not in a StrictMode double-mount
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return {
    // State from store
    state: store.state,
    error: store.error,
    retryCount: store.retryCount,
    services: store.services,
    
    // Actions
    toggleP2P: store.toggleP2P,
    retry: store.retry,
    reset: store.reset,
    
    // Computed properties
    isReady: store.isReady(),
    isLoading: store.isLoading(),
    isConnected: store.isConnected(),
    isPrivateMode: store.isPrivateMode(),
    canRetry: store.canRetry(),
    
    // Additional computed
    isInitializing: store.isInitializing,
  };
}