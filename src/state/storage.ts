// src/state/storage.ts - Robust LocalStorage service
import { DiagramEvent } from './DiagramContext';

const STORAGE_KEYS = {
  EVENTS: 'diagram_events',
  METADATA: 'diagram_metadata',
  USER_PREFERENCES: 'user_preferences',
} as const;

export interface StorageMetadata {
  version: string;
  lastModified: number;
  eventCount: number;
  checksum: string;
}

export interface UserPreferences {
  userId: string;
  userName?: string;
  theme?: string;
  autoSave: boolean;
}

/**
 * Robust LocalStorage service with error handling, validation, and data integrity
 */
export class StorageService {
  private static readonly VERSION = '1.0.0';
  private static readonly MAX_EVENTS = 10000; // Prevent memory issues

  /**
   * Save events to LocalStorage with metadata and checksum validation
   */
  static saveEvents(events: DiagramEvent[]): boolean {
    try {
      if (events.length > this.MAX_EVENTS) {
        console.warn(`Event limit exceeded (${events.length}/${this.MAX_EVENTS}). Truncating oldest events.`);
        events = events.slice(-this.MAX_EVENTS);
      }

      const serialized = JSON.stringify(events);
      const checksum = this.generateChecksum(serialized);
      
      const metadata: StorageMetadata = {
        version: this.VERSION,
        lastModified: Date.now(),
        eventCount: events.length,
        checksum,
      };

      localStorage.setItem(STORAGE_KEYS.EVENTS, serialized);
      localStorage.setItem(STORAGE_KEYS.METADATA, JSON.stringify(metadata));
      
      return true;
    } catch (error) {
      console.error('Failed to save events to storage:', error);
      return false;
    }
  }

  /**
   * Load events from LocalStorage with validation
   */
  static loadEvents(): DiagramEvent[] {
    try {
      const metadataStr = localStorage.getItem(STORAGE_KEYS.METADATA);
      const eventsStr = localStorage.getItem(STORAGE_KEYS.EVENTS);

      if (!metadataStr || !eventsStr) {
        return [];
      }

      const metadata: StorageMetadata = JSON.parse(metadataStr);
      
      // Version compatibility check
      if (metadata.version !== this.VERSION) {
        console.warn(`Storage version mismatch. Expected ${this.VERSION}, got ${metadata.version}. Clearing storage.`);
        this.clearStorage();
        return [];
      }

      // Checksum validation
      const expectedChecksum = this.generateChecksum(eventsStr);
      if (metadata.checksum !== expectedChecksum) {
        console.error('Storage checksum mismatch. Data may be corrupted. Clearing storage.');
        this.clearStorage();
        return [];
      }

      const events: DiagramEvent[] = JSON.parse(eventsStr);
      
      // Validate event count
      if (events.length !== metadata.eventCount) {
        console.error('Event count mismatch. Data may be corrupted. Clearing storage.');
        this.clearStorage();
        return [];
      }

      return events;
    } catch (error) {
      console.error('Failed to load events from storage:', error);
      this.clearStorage();
      return [];
    }
  }

  /**
   * Save user preferences
   */
  static saveUserPreferences(preferences: UserPreferences): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
      return true;
    } catch (error) {
      console.error('Failed to save user preferences:', error);
      return false;
    }
  }

  /**
   * Load user preferences with defaults
   */
  static loadUserPreferences(): UserPreferences {
    try {
      const str = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
      if (!str) {
        return this.getDefaultPreferences();
      }

      const preferences = JSON.parse(str);
      return { ...this.getDefaultPreferences(), ...preferences };
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Get storage metadata
   */
  static getMetadata(): StorageMetadata | null {
    try {
      const str = localStorage.getItem(STORAGE_KEYS.METADATA);
      return str ? JSON.parse(str) : null;
    } catch (error) {
      console.error('Failed to get storage metadata:', error);
      return null;
    }
  }

  /**
   * Clear all diagram storage
   */
  static clearStorage(): void {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  /**
   * Get storage usage statistics
   */
  static getStorageStats() {
    try {
      const metadata = this.getMetadata();
      const eventsSize = localStorage.getItem(STORAGE_KEYS.EVENTS)?.length || 0;
      const metadataSize = localStorage.getItem(STORAGE_KEYS.METADATA)?.length || 0;
      const preferencesSize = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES)?.length || 0;
      
      return {
        totalSize: eventsSize + metadataSize + preferencesSize,
        eventsSize,
        metadataSize,
        preferencesSize,
        eventCount: metadata?.eventCount || 0,
        lastModified: metadata?.lastModified || 0,
        isStorageAvailable: this.isStorageAvailable(),
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return null;
    }
  }

  /**
   * Check if localStorage is available
   */
  static isStorageAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate simple checksum for data integrity
   */
  private static generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get default user preferences
   */
  private static getDefaultPreferences(): UserPreferences {
    return {
      userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      autoSave: true,
    };
  }

  // Instance methods for compatibility with DistributedStateManager
  
  /**
   * Save state for a specific room (instance method)
   */
  saveState(roomId: string, state: any): boolean {
    try {
      const key = `modelka_room_${roomId}_state`;
      
      // Enhance state with metadata for integrity checking
      const enhancedState = {
        ...state,
        savedAt: Date.now(),
        version: state.version || 1,
        checksum: this.generateChecksum(JSON.stringify(state)),
      };
      
      const serialized = JSON.stringify(enhancedState);
      localStorage.setItem(key, serialized);
      console.log(`💾 Saved state for room ${roomId}:`, Object.keys(state), `(${state.elements?.length || 0} elements)`);
      return true;
    } catch (error) {
      console.error(`Failed to save state for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Load state for a specific room (instance method)
   */
  loadState(roomId: string): any {
    try {
      const key = `modelka_room_${roomId}_state`;
      const serialized = localStorage.getItem(key);
      if (!serialized) {
        return null;
      }
      
      const state = JSON.parse(serialized);
      
      // Validate checksum if available
      if (state.checksum) {
        const { checksum, savedAt, ...stateWithoutMeta } = state;
        const expectedChecksum = this.generateChecksum(JSON.stringify(stateWithoutMeta));
        
        if (checksum !== expectedChecksum) {
          console.error(`Checksum validation failed for room ${roomId}. Data may be corrupted.`);
          return null;
        }
      }
      
      console.log(`📂 Loaded state for room ${roomId}:`, Object.keys(state), `(${state.elements?.length || 0} elements)`);
      return state;
    } catch (error) {
      console.error(`Failed to load state for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Generate simple checksum for data integrity (private method made available)
   */
  private generateChecksum(data: string): string {
    return StorageService.generateChecksum(data);
  }
}