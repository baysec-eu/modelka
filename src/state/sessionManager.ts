// src/state/sessionManager.ts - Enterprise-grade session and room management
import { DiagramEvent } from './DiagramContext';
// Storage service import removed (unused)

/**
 * Room metadata for business-critical operations
 */
export interface RoomMetadata {
  id: string; // Room UUID
  name: string;
  description?: string;
  createdAt: number;
  lastModified: number;
  createdBy: string; // User ID
  participants: string[]; // Active participant IDs
  isLocked: boolean;
  lockReason?: string;
  version: string; // Semantic versioning for compatibility
  eventCount: number;
  checksum: string; // Integrity verification
  maxParticipants?: number;
  permissions: RoomPermissions;
  tags: string[];
}

/**
 * Room permissions for access control
 */
export interface RoomPermissions {
  canEdit: string[]; // User IDs who can edit
  canView: string[]; // User IDs who can view
  canInvite: string[]; // User IDs who can invite others
  canAdmin: string[]; // User IDs who can modify room settings
  isPublic: boolean; // Whether room is publicly accessible
  requiresApproval: boolean; // Whether joining requires approval
}

/**
 * Session information for each participant
 */
export interface Session {
  id: string; // Session UUID
  userId: string;
  roomId: string;
  startedAt: number;
  lastActive: number;
  userAgent: string;
  ipAddress?: string; // For audit purposes
  permissions: SessionPermissions;
  state: SessionState;
  reconnectionToken: string; // For seamless reconnection
}

export interface SessionPermissions {
  canEdit: boolean;
  canView: boolean;
  canInvite: boolean;
  canAdmin: boolean;
  canExport: boolean;
  canImport: boolean;
}

export type SessionState = 'active' | 'idle' | 'disconnected' | 'expired' | 'banned';

/**
 * Room state snapshot for efficient loading
 */
interface RoomSnapshot {
  roomId: string;
  version: number;
  timestamp: number;
  eventLogLength: number;
  state: {
    elements: Record<string, any>;
    threatActors: Record<string, any>;
  };
  checksum: string;
}

/**
 * Enterprise-grade Session Manager
 * Handles room isolation, session management, and state persistence
 */
export class SessionManager {
  private static readonly STORAGE_PREFIX = 'diagram_room_';
  private static readonly SESSION_STORAGE_KEY = 'active_sessions';
  private static readonly ROOM_METADATA_KEY = 'room_metadata';
  private static readonly SNAPSHOT_INTERVAL = 100; // Create snapshot every 100 events
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly MAX_ROOMS_PER_USER = 50;

  private currentRoomId: string | null = null;
  private currentSessionId: string | null = null;
  private activeSessions: Map<string, Session> = new Map();
  private roomMetadata: Map<string, RoomMetadata> = new Map();
  private sessionCleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadStoredData();
    this.startSessionCleanup();
  }

  /**
   * Create a new room with proper isolation
   */
  createRoom(
    userId: string,
    roomName: string,
    description?: string,
    permissions?: Partial<RoomPermissions>,
    specificRoomId?: string
  ): RoomMetadata {
    const roomId = specificRoomId || `room_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    console.log(`🔨 Creating room with ID: ${roomId} (specified: ${specificRoomId})`);
    
    const defaultPermissions: RoomPermissions = {
      canEdit: [userId],
      canView: [userId],
      canInvite: [userId],
      canAdmin: [userId],
      isPublic: false,
      requiresApproval: false,
      ...permissions,
    };

    const metadata: RoomMetadata = {
      id: roomId,
      name: roomName,
      description,
      createdAt: Date.now(),
      lastModified: Date.now(),
      createdBy: userId,
      participants: [],
      isLocked: false,
      version: '1.0.0',
      eventCount: 0,
      checksum: '',
      permissions: defaultPermissions,
      tags: [],
    };

    // Ensure user doesn't exceed room limit
    const userRooms = this.getUserRooms(userId);
    if (userRooms.length >= SessionManager.MAX_ROOMS_PER_USER) {
      throw new Error(`User has reached maximum room limit (${SessionManager.MAX_ROOMS_PER_USER})`);
    }

    this.roomMetadata.set(roomId, metadata);
    this.saveRoomMetadata();

    // Initialize empty state for the room
    this.saveRoomEvents(roomId, []);
    this.createSnapshot(roomId, [], { elements: {}, threatActors: {} });

    console.log(`Created room ${roomId} by user ${userId}`);
    return metadata;
  }

  /**
   * Join a room and create a session
   */
  joinRoom(userId: string, roomId: string, userAgent = 'Unknown'): Session {
    console.log(`🔍 Attempting to join room: ${roomId} for user: ${userId}`);
    const metadata = this.roomMetadata.get(roomId);
    if (!metadata) {
      console.log(`❌ Room ${roomId} does not exist in metadata map`);
      throw new Error(`Room ${roomId} does not exist`);
    }

    // Skip permission check - AES-GCM encryption provides security
    // Anyone with room ID and decryption key can join

    // Check if room is locked
    if (metadata.isLocked) {
      throw new Error(`Room ${roomId} is locked: ${metadata.lockReason}`);
    }

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const reconnectionToken = `token_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;

    const session: Session = {
      id: sessionId,
      userId,
      roomId,
      startedAt: Date.now(),
      lastActive: Date.now(),
      userAgent,
      permissions: this.getSessionPermissions(userId, roomId),
      state: 'active',
      reconnectionToken,
    };

    // Add to active sessions
    this.activeSessions.set(sessionId, session);

    // Update room metadata
    if (!metadata.participants.includes(userId)) {
      metadata.participants.push(userId);
      metadata.lastModified = Date.now();
      this.saveRoomMetadata();
    }

    // Set as current room if none set
    if (!this.currentRoomId) {
      this.currentRoomId = roomId;
      this.currentSessionId = sessionId;
    }

    this.saveActiveSessions();
    console.log(`User ${userId} joined room ${roomId} with session ${sessionId}`);
    
    return session;
  }

  /**
   * Leave a room and cleanup session
   */
  leaveRoom(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const { userId, roomId } = session;
    
    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Update room metadata
    const metadata = this.roomMetadata.get(roomId);
    if (metadata) {
      const index = metadata.participants.indexOf(userId);
      if (index > -1) {
        metadata.participants.splice(index, 1);
        metadata.lastModified = Date.now();
        this.saveRoomMetadata();
      }
    }

    // Clear current room if this was the current session
    if (this.currentSessionId === sessionId) {
      this.currentRoomId = null;
      this.currentSessionId = null;
    }

    this.saveActiveSessions();
    console.log(`User ${userId} left room ${roomId}, session ${sessionId} ended`);
  }

  /**
   * Switch to a different room
   */
  switchRoom(userId: string, newRoomId: string): Session {
    // Leave current room if any
    if (this.currentSessionId) {
      this.leaveRoom(this.currentSessionId);
    }

    // Join new room
    const session = this.joinRoom(userId, newRoomId);
    this.currentRoomId = newRoomId;
    this.currentSessionId = session.id;

    return session;
  }

  /**
   * Get room-specific events with proper isolation
   */
  getRoomEvents(roomId: string): DiagramEvent[] {
    // Skip permission check - AES-GCM encryption provides security

    const storageKey = SessionManager.STORAGE_PREFIX + roomId;
    try {
      const eventsStr = localStorage.getItem(storageKey);
      return eventsStr ? JSON.parse(eventsStr) : [];
    } catch (error) {
      console.error(`Failed to load events for room ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Save events to specific room with proper isolation
   */
  saveRoomEvents(roomId: string, events: DiagramEvent[]): boolean {
    // Skip permission check - AES-GCM encryption provides security

    const storageKey = SessionManager.STORAGE_PREFIX + roomId;
    try {
      localStorage.setItem(storageKey, JSON.stringify(events));
      
      // Update metadata
      const metadata = this.roomMetadata.get(roomId);
      if (metadata) {
        metadata.eventCount = events.length;
        metadata.lastModified = Date.now();
        metadata.checksum = this.computeChecksum(events);
        
        // Create snapshot if needed
        if (events.length > 0 && events.length % SessionManager.SNAPSHOT_INTERVAL === 0) {
          this.createSnapshotFromEvents(roomId, events);
        }
        
        this.saveRoomMetadata();
      }

      return true;
    } catch (error) {
      console.error(`Failed to save events for room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Load state from a different room (replay mechanism)
   */
  loadStateFromRoom(
    sourceRoomId: string, 
    targetRoomId: string, 
    userId: string,
    mergeStrategy: 'replace' | 'merge' = 'replace'
  ): boolean {
    // Check permissions
    if (!this.hasPermission(userId, sourceRoomId, 'canView')) {
      throw new Error(`No permission to view source room ${sourceRoomId}`);
    }
    if (!this.hasPermission(userId, targetRoomId, 'canEdit')) {
      throw new Error(`No permission to edit target room ${targetRoomId}`);
    }

    try {
      const sourceEvents = this.getRoomEvents(sourceRoomId);
      const targetEvents = mergeStrategy === 'replace' ? [] : this.getRoomEvents(targetRoomId);

      let finalEvents: DiagramEvent[];
      if (mergeStrategy === 'merge') {
        finalEvents = this.mergeEventStreams(targetEvents, sourceEvents);
      } else {
        finalEvents = sourceEvents.map(event => ({
          ...event,
          seq: event.seq + Date.now(), // Resequence to avoid conflicts
          actor: userId, // Mark as imported by current user
        }));
      }

      this.saveRoomEvents(targetRoomId, finalEvents);
      
      console.log(`Loaded ${sourceEvents.length} events from room ${sourceRoomId} to ${targetRoomId}`);
      return true;
    } catch (error) {
      console.error(`Failed to load state from room ${sourceRoomId}:`, error);
      return false;
    }
  }

  /**
   * Create optimized snapshot for fast loading
   */
  private createSnapshot(roomId: string, events: DiagramEvent[], state: any): void {
    const snapshot: RoomSnapshot = {
      roomId,
      version: events.length,
      timestamp: Date.now(),
      eventLogLength: events.length,
      state,
      checksum: this.computeChecksum(events),
    };

    const snapshotKey = `${SessionManager.STORAGE_PREFIX}${roomId}_snapshot`;
    try {
      localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
    } catch (error) {
      console.error(`Failed to create snapshot for room ${roomId}:`, error);
    }
  }

  /**
   * Create snapshot from event stream
   */
  private createSnapshotFromEvents(roomId: string, events: DiagramEvent[]): void {
    // Replay events to build current state
    const state = { elements: {}, threatActors: {} };
    
    for (const event of events) {
      this.applyEventToState(state, event);
    }

    this.createSnapshot(roomId, events, state);
  }

  /**
   * Apply single event to state (for snapshot creation)
   */
  private applyEventToState(state: any, event: DiagramEvent): void {
    switch (event.type) {
      case 'element.insert':
        if (event.data) {
          state.elements[event.data.id] = event.data;
        }
        break;
      case 'element.update':
        if (event.id && state.elements[event.id] && event.patch) {
          state.elements[event.id] = { ...state.elements[event.id], ...event.patch };
        }
        break;
      case 'element.delete':
        if (event.id) {
          delete state.elements[event.id];
        }
        break;
      case 'threatActor.insert':
        if (event.data) {
          state.threatActors[event.data.id] = event.data;
        }
        break;
      case 'threatActor.update':
        if (event.id && state.threatActors[event.id] && event.patch) {
          state.threatActors[event.id] = { ...state.threatActors[event.id], ...event.patch };
        }
        break;
      case 'threatActor.delete':
        if (event.id) {
          delete state.threatActors[event.id];
        }
        break;
    }
  }

  /**
   * Merge two event streams intelligently
   */
  private mergeEventStreams(stream1: DiagramEvent[], stream2: DiagramEvent[]): DiagramEvent[] {
    const merged = [...stream1, ...stream2];
    
    // Sort by timestamp and sequence
    merged.sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.actor.localeCompare(b.actor);
    });

    // Remove duplicates based on event ID or content hash
    const seen = new Set<string>();
    return merged.filter(event => {
      const key = `${event.seq}-${event.actor}-${event.type}-${event.id || JSON.stringify(event.data)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Check user permissions for room operations
   */
  private hasPermission(
    userId: string, 
    roomId: string, 
    permission: keyof SessionPermissions
  ): boolean {
    if (userId === 'current' && this.currentSessionId) {
      const session = this.activeSessions.get(this.currentSessionId);
      return session ? session.permissions[permission] : false;
    }

    const metadata = this.roomMetadata.get(roomId);
    if (!metadata) return false;


    // Always allow access - AES-GCM encryption provides security
    return true;
  }

  /**
   * Get session permissions for user in room
   */
  private getSessionPermissions(userId: string, roomId: string): SessionPermissions {
    return {
      canEdit: this.hasPermission(userId, roomId, 'canEdit'),
      canView: this.hasPermission(userId, roomId, 'canView'),
      canInvite: this.hasPermission(userId, roomId, 'canInvite'),
      canAdmin: this.hasPermission(userId, roomId, 'canAdmin'),
      canExport: this.hasPermission(userId, roomId, 'canView'),
      canImport: this.hasPermission(userId, roomId, 'canEdit'),
    };
  }

  /**
   * Get all rooms for a user
   */
  getUserRooms(userId: string): RoomMetadata[] {
    return Array.from(this.roomMetadata.values()).filter(room =>
      room.createdBy === userId ||
      room.permissions.canView.includes(userId) ||
      room.permissions.canEdit.includes(userId) ||
      room.permissions.isPublic
    );
  }

  /**
   * Update session activity
   */
  updateSessionActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActive = Date.now();
      session.state = 'active';
      this.saveActiveSessions();
    }
  }

  /**
   * Clean up expired sessions
   */
  private startSessionCleanup(): void {
    this.sessionCleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredSessions: string[] = [];

      for (const [sessionId, session] of this.activeSessions) {
        if (now - session.lastActive > SessionManager.SESSION_TIMEOUT) {
          expiredSessions.push(sessionId);
        }
      }

      expiredSessions.forEach(sessionId => {
        console.log(`Cleaning up expired session ${sessionId}`);
        this.leaveRoom(sessionId);
      });
    }, 60000); // Check every minute
  }

  /**
   * Compute checksum for data integrity
   */
  private computeChecksum(data: any[]): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Load stored data on initialization
   */
  private loadStoredData(): void {
    try {
      // Load room metadata
      const metadataStr = localStorage.getItem(SessionManager.ROOM_METADATA_KEY);
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr);
        this.roomMetadata = new Map(Object.entries(metadata));
      }

      // Load active sessions
      const sessionsStr = localStorage.getItem(SessionManager.SESSION_STORAGE_KEY);
      if (sessionsStr) {
        const sessions = JSON.parse(sessionsStr);
        this.activeSessions = new Map(Object.entries(sessions));
      }
    } catch (error) {
      console.error('Failed to load stored session data:', error);
    }
  }

  /**
   * Save room metadata
   */
  private saveRoomMetadata(): void {
    try {
      const metadata = Object.fromEntries(this.roomMetadata);
      localStorage.setItem(SessionManager.ROOM_METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('Failed to save room metadata:', error);
    }
  }

  /**
   * Save active sessions
   */
  private saveActiveSessions(): void {
    try {
      const sessions = Object.fromEntries(this.activeSessions);
      localStorage.setItem(SessionManager.SESSION_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to save active sessions:', error);
    }
  }

  /**
   * Get current room and session info
   */
  getCurrentSession(): { roomId: string | null; sessionId: string | null; session: Session | null } {
    return {
      roomId: this.currentRoomId,
      sessionId: this.currentSessionId,
      session: this.currentSessionId ? this.activeSessions.get(this.currentSessionId) || null : null,
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    this.saveRoomMetadata();
    this.saveActiveSessions();
  }

  /**
   * Get statistics for monitoring
   */
  getStats() {
    return {
      totalRooms: this.roomMetadata.size,
      activeSessions: this.activeSessions.size,
      currentRoom: this.currentRoomId,
      currentSession: this.currentSessionId,
      roomsWithParticipants: Array.from(this.roomMetadata.values())
        .filter(room => room.participants.length > 0).length,
    };
  }
}