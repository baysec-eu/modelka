// src/state/distributedStateManager.ts - Enterprise-grade distributed state orchestrator
import { SessionManager, Session } from './sessionManager';
import { RaftConsensusProtocol } from './raftConsensus';
import { OperationalTransformEngine, OTOperation, OTOperationMeta } from './operationalTransforms';
import { PeerLifecycleManager, LifecycleEvent } from './peerLifecycleManager';
import { StorageService } from './storage';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';
import { DiagramElement, ThreatActor } from '../types/diagram';

/**
 * Replay options for state loading
 */
export interface ReplayOptions {
  mergeStrategy?: 'replace' | 'merge';
  preserveTimestamps?: boolean;
  skipValidation?: boolean;
  batchSize?: number;
}

/**
 * Room export data structure
 */
export interface RoomExport {
  roomId: string;
  exportedAt: number;
  exportedBy: string;
  version: string;
  snapshot: StateSnapshot;
  events: any[]; // DiagramEvent[]
  statistics: DistributedStateStats;
  checksum: string;
}

/**
 * Import options for room state
 */
export interface ImportOptions {
  preserveExisting?: boolean;
  validateIntegrity?: boolean;
  createBackup?: boolean;
}
/**
 * Distributed state events for UI layer
 */
export type DistributedStateEvent =
  | { type: 'state_initialized'; roomId: string; session: Session }
  | { type: 'state_updated'; elements: DiagramElement[]; threatActors: ThreatActor[] }
  | { type: 'peer_joined'; peerId: string; userId: string }
  | { type: 'peer_left'; peerId: string; userId: string }
  | { type: 'leadership_changed'; isLeader: boolean; leaderId: string | null }
  | { type: 'sync_status_changed'; isSyncing: boolean; progress?: number }
  | { type: 'connection_status_changed'; isConnected: boolean; peerCount: number }
  | { type: 'conflict_resolved'; operationId: string; resolution: string }
  | { type: 'error_occurred'; error: string; context?: any };

/**
 * Current state snapshot
 */
export interface StateSnapshot {
  elements: Record<string, DiagramElement>;
  threatActors: Record<string, ThreatActor>;
  version: number;
  lastModified: number;
  checksum: string;
}

/**
 * Statistics for monitoring and debugging
 */
export interface DistributedStateStats {
  // System health
  isConnected: boolean;
  isLeader: boolean;
  connectedPeers: number;
  isStable: boolean;
  
  // Session info
  currentRoom: string | null;
  currentSession: string | null;
  
  // Operations
  operationsApplied: number;
  conflictsResolved: number;
  transformationsPerformed: number;
  
  // Storage
  eventsStored: number;
  snapshotsCreated: number;
  
  // Network
  messagesReceived: number;
  messagesSent: number;
  networkPartitions: number;
  
  // Leadership
  electionsStarted: number;
  currentTerm: number;
  
  // Performance
  averageTransformTime: number;
  peakOperationsPerSecond: number;
}

/**
 * Enterprise Distributed State Manager
 * Orchestrates all distributed systems components for business-critical reliability
 */
export class DistributedStateManager {
  // Core components
  private sessionManager: SessionManager | null = null;
  private raftConsensus: RaftConsensusProtocol | null = null;
  private operationalTransforms: OperationalTransformEngine | null = null;
  private peerLifecycle: PeerLifecycleManager | null = null;
  private storageService: StorageService;
  
  // Current state
  private currentState: StateSnapshot = {
    elements: {},
    threatActors: {},
    version: 0,
    lastModified: Date.now(),
    checksum: '',
  };
  
  
  // Event handling
  private eventListeners: Set<(event: DistributedStateEvent) => void> = new Set();
  
  // Network connection
  private rtc: ServerlessWebRTC | null = null;
  private isConnected: boolean = false;
  private userId: string | null = null;
  private nodeId: string;
  
  // Vector clock for causal ordering
  private vectorClock: Record<string, number> = {};
  
  // Performance monitoring
  private stats: DistributedStateStats = {
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
  };
  
  constructor() {
    this.nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.storageService = new StorageService();
    
    // Initialize vector clock
    this.vectorClock[this.nodeId] = 0;
    
    this.loadPersistedState();
  }
  
  /**
   * Initialize distributed system for a room
   */
  async initializeRoom(userId: string, roomId: string): Promise<Session> {
    this.userId = userId;
    
    // Clear any existing state to prevent room cross-contamination
    console.log(`🧹 Clearing state before initializing room: ${roomId} (previous room: ${this.stats.currentRoom || 'none'})`);
    
    // If changing rooms, ensure complete state isolation
    if (this.stats.currentRoom && this.stats.currentRoom !== roomId) {
      console.log(`🔄 Room switch detected: ${this.stats.currentRoom} → ${roomId} - performing deep cleanup`);
      this.dispose(); // Complete cleanup
    }
    
    this.clearCurrentState();
    
    // Initialize core components (but don't initialize Raft consensus until WebRTC is ready)
    this.sessionManager = new SessionManager();
    this.raftConsensus = new RaftConsensusProtocol(this.nodeId, roomId);
    this.operationalTransforms = new OperationalTransformEngine();
    this.peerLifecycle = new PeerLifecycleManager(
      this.sessionManager,
      this.raftConsensus,
      roomId
    );
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Join or create session
    let session: Session;
    try {
      session = this.sessionManager.joinRoom(userId, roomId);
      console.log(`✅ Joined existing room: ${roomId}`);
    } catch (error) {
      // Room doesn't exist, create it
      console.log(`🔨 Creating new room: ${roomId} for user: ${userId}`);
      const metadata = this.sessionManager.createRoom(userId, `Room ${roomId}`, undefined, undefined, roomId);
      console.log(`✅ Created room metadata:`, metadata);
      session = this.sessionManager.joinRoom(userId, roomId);
      console.log(`✅ Joined newly created room: ${roomId}`);
    }
    
    // State will be requested when P2P connection is ready
    // See setupNetworkHandlers() for peer state request logic
    
    // Update stats
    this.stats.currentRoom = roomId;
    this.stats.currentSession = session.id;
    
    this.emitEvent({ type: 'state_initialized', roomId, session });
    
    console.log(`✅ Distributed state initialized for room: "${roomId}", user: "${userId}"`);
    return session;
  }
  
  /**
   * Connect to WebRTC network
   */
  async connect(rtc: ServerlessWebRTC, userId: string): Promise<void> {
    this.rtc = rtc;
    this.userId = userId;
    
    // Initialize components with WebRTC
    if (this.raftConsensus) this.raftConsensus.initialize(rtc);
    if (this.peerLifecycle) this.peerLifecycle.initialize(rtc);
    
    // Setup network event handlers
    this.setupNetworkHandlers();
    
    this.isConnected = true;
    this.stats.isConnected = true;
    
    this.emitEvent({ 
      type: 'connection_status_changed', 
      isConnected: true, 
      peerCount: this.stats.connectedPeers 
    });
  }
  
  /**
   * Create a new diagram element
   */
  async createElement(element: DiagramElement): Promise<boolean> {
    // Allow creation even when not connected (offline/single-user mode)
    if (!this.userId) {
      console.warn('No userId available for create operation');
      return false;
    }
    
    // Increment vector clock
    this.vectorClock[this.nodeId]++;
    
    // Create operation
    const operation: OTOperation = {
      type: 'insert_element',
      elementId: element.id,
      element,
      position: Object.keys(this.currentState.elements).length,
    };
    
    const opMeta = this.operationalTransforms?.createOperation(
      operation,
      this.userId,
      this.stats.currentSession || '',
      this.stats.currentRoom || '',
      { ...this.vectorClock }
    );
    
    if (!opMeta) return false;
    return this.submitOperation(opMeta);
  }
  
  /**
   * Update diagram element
   */
  async updateElement(elementId: string, updates: Partial<DiagramElement>): Promise<boolean> {
    // Allow updates even when not connected (offline/single-user mode)
    if (!this.userId) {
      console.warn('No userId available for update operation');
      return false;
    }
    
    const currentElement = this.currentState.elements[elementId];
    if (!currentElement) {
      console.warn(`Element ${elementId} not found in current state`);
      return false; // Graceful failure instead of throwing
    }
    
    // Increment vector clock
    this.vectorClock[this.nodeId]++;
    
    // Create property update operations for each changed field
    const operations: OTOperationMeta[] = [];
    
    for (const [property, newValue] of Object.entries(updates)) {
      const oldValue = (currentElement as any)[property];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        const operation: OTOperation = {
          type: 'update_element_property',
          elementId,
          property,
          oldValue,
          newValue,
        };
        
        const opMeta = this.operationalTransforms?.createOperation(
          operation,
          this.userId,
          this.stats.currentSession || '',
          this.stats.currentRoom || '',
          { ...this.vectorClock }
        );
        
        if (opMeta) {
          operations.push(opMeta);
        }
      }
    }
    
    // Submit all operations
    return this.submitOperations(operations);
  }
  
  /**
   * Delete diagram element
   */
  async deleteElement(elementId: string): Promise<boolean> {
    // Allow deletion even when not connected (offline/single-user mode)  
    if (!this.userId) {
      console.warn('No userId available for delete operation');
      return false;
    }
    
    const element = this.currentState.elements[elementId];
    if (!element) {
      return true; // Already deleted
    }
    
    // Increment vector clock
    this.vectorClock[this.nodeId]++;
    
    const operation: OTOperation = {
      type: 'delete_element',
      elementId,
      element,
      position: Object.values(this.currentState.elements).indexOf(element),
    };
    
    const opMeta = this.operationalTransforms?.createOperation(
      operation,
      this.userId,
      this.stats.currentSession || '',
      this.stats.currentRoom || '',
      { ...this.vectorClock }
    );
    
    if (!opMeta) return false;
    return this.submitOperation(opMeta);
  }
  
  /**
   * Move element to new position
   */
  async moveElement(elementId: string, newPosition: { x: number; y: number }): Promise<boolean> {
    const element = this.currentState.elements[elementId];
    if (!element) {
      throw new Error(`Element ${elementId} not found`);
    }
    
    // Increment vector clock
    this.vectorClock[this.nodeId]++;
    
    const operation: OTOperation = {
      type: 'move_element',
      elementId,
      oldPos: element.position,
      newPos: newPosition,
    };
    
    const opMeta = this.operationalTransforms?.createOperation(
      operation,
      this.userId!,
      this.stats.currentSession || '',
      this.stats.currentRoom || '',
      { ...this.vectorClock }
    );
    
    return this.submitOperation(opMeta);
  }
  
  /**
   * Submit operation through Raft consensus
   */
  private async submitOperation(operation: OTOperationMeta | undefined): Promise<boolean> {
    if (!this.raftConsensus || !operation) return false;
    
    try {
      const start = Date.now();
      const success = await this.raftConsensus.submitOperation(operation);
      const duration = Date.now() - start;
      
      // Update performance metrics
      this.updateTransformationMetrics(duration);
      
      if (success) {
        this.stats.operationsApplied++;
        this.applyOperationToState(operation);
        this.persistCurrentState();
        
        // Emit UI update for local operations too
        this.emitStateUpdate();
        
        // CRITICAL FIX: Broadcast operation directly to peers for real-time sync
        this.broadcastOperationToPeers(operation);
      }
      
      return success;
    } catch (error) {
      console.error('Failed to submit operation:', error);
      this.emitEvent({ 
        type: 'error_occurred', 
        error: error instanceof Error ? error.message : 'Unknown error',
        context: { operation: operation.id }
      });
      return false;
    }
  }
  
  /**
   * Submit multiple operations as batch
   */
  private async submitOperations(operations: (OTOperationMeta | undefined)[]): Promise<boolean> {
    const validOperations = operations.filter((op): op is OTOperationMeta => op !== undefined);
    if (validOperations.length === 0) return true;
    
    let allSuccess = true;
    for (const operation of validOperations) {
      const success = await this.submitOperation(operation);
      if (!success) allSuccess = false;
    }
    
    return allSuccess;
  }
  
  /**
   * Broadcast operation to all connected peers for real-time synchronization
   */
  private broadcastOperationToPeers(operation: OTOperationMeta): void {
    if (!this.rtc || !this.isConnected) {
      console.log('📡 Skipping broadcast - no P2P connection');
      return;
    }

    const peers = this.rtc.getPeers();
    if (peers.length === 0) {
      console.log('📡 No peers connected to broadcast operation');
      return;
    }

    console.log(`📡 Broadcasting operation to ${peers.length} peers:`, operation.operation.type, operation.operation);
    
    // Send operation directly to peers using the 'events' channel
    try {
      this.rtc.send('events', {
        type: 'distributed_operation',
        operation: operation,
        timestamp: Date.now(),
        fromUserId: this.userId,
        roomId: this.stats.currentRoom
      });
      
      console.log('✅ Operation broadcasted successfully');
    } catch (error) {
      console.error('❌ Failed to broadcast operation:', error);
    }
  }

  /**
   * Apply operation to local state
   */
  private applyOperationToState(operation: OTOperationMeta): void {
    const op = operation.operation;
    
    switch (op.type) {
      case 'insert_element':
        this.currentState.elements[op.elementId] = op.element;
        break;
        
      case 'delete_element':
        delete this.currentState.elements[op.elementId];
        break;
        
      case 'move_element':
        if (this.currentState.elements[op.elementId]) {
          this.currentState.elements[op.elementId].position = op.newPos;
        }
        break;
        
      case 'update_element_property':
        if (this.currentState.elements[op.elementId]) {
          (this.currentState.elements[op.elementId] as any)[op.property] = op.newValue;
        }
        break;
        
      case 'insert_threat_actor':
        this.currentState.threatActors[op.actorId] = op.actor;
        break;
        
      case 'delete_threat_actor':
        delete this.currentState.threatActors[op.actorId];
        break;
        
      case 'update_threat_actor':
        if (this.currentState.threatActors[op.actorId]) {
          (this.currentState.threatActors[op.actorId] as any)[op.property] = op.newValue;
        }
        break;
    }
    
    // Update state metadata
    this.currentState.version++;
    this.currentState.lastModified = Date.now();
    this.currentState.checksum = this.computeStateChecksum();
    
    // Emit state update
    this.emitEvent({
      type: 'state_updated',
      elements: Object.values(this.currentState.elements),
      threatActors: Object.values(this.currentState.threatActors),
    });
  }
  
  /**
   * Setup event handlers for distributed components
   */
  private setupEventHandlers(): void {
    // Peer lifecycle events
    if (this.peerLifecycle) {
      this.peerLifecycle.addEventListener((event: LifecycleEvent) => {
        this.handlePeerLifecycleEvent(event);
      });
    }
    
    // Raft consensus events (would need to be added to RaftConsensusProtocol)
    // Leadership changes, network partitions, etc.
  }
  
  /**
   * Handle peer lifecycle events
   */
  private handlePeerLifecycleEvent(event: LifecycleEvent): void {
    switch (event.type) {
      case 'peer_active':
        this.stats.connectedPeers = this.peerLifecycle?.getActivePeers().length || 0;
        this.emitEvent({
          type: 'connection_status_changed',
          isConnected: this.isConnected,
          peerCount: this.stats.connectedPeers,
        });
        break;
        
      case 'peer_disconnected':
        this.stats.connectedPeers = this.peerLifecycle?.getActivePeers().length || 0;
        this.emitEvent({
          type: 'connection_status_changed',
          isConnected: this.isConnected,
          peerCount: this.stats.connectedPeers,
        });
        break;
        
      case 'leadership_changed':
        this.stats.isLeader = event.newLeader === this.nodeId;
        this.emitEvent({
          type: 'leadership_changed',
          isLeader: this.stats.isLeader,
          leaderId: event.newLeader,
        });
        break;
        
      case 'cluster_stability_changed':
        this.stats.isStable = event.stable;
        break;
        
      case 'network_partition_detected':
        this.stats.networkPartitions++;
        this.emitEvent({
          type: 'error_occurred',
          error: 'Network partition detected',
          context: { affectedPeers: event.affectedPeers },
        });
        break;
    }
  }
  
  /**
   * Setup network handlers
   */
  private setupNetworkHandlers(): void {
    if (!this.rtc) return;
    
    console.log('🔗 Setting up network handlers for distributed state...');
    
    // Handle peer presence events
    this.rtc.on('user_presence', (_data: any, userId: string) => {
      console.log('👋 Peer joined:', userId);
      const wasAlone = this.stats.connectedPeers === 0;
      this.stats.connectedPeers = this.rtc!.getPeers().length;
      
      // If we were alone and this is our first peer, request state
      if (wasAlone && Object.keys(this.currentState.elements).length === 0) {
        console.log('📤 We were alone, requesting state from new peer:', userId);
        this.requestStateFromPeersOrFallback(this.stats.currentRoom || '');
      } 
      // Send current state to new peer if we have data
      else if (this.rtc && Object.keys(this.currentState.elements).length > 0) {
        console.log('📤 Sending current state to new peer:', userId);
        this.rtc.send('full_history', {
          snapshot: this.currentState,
          version: this.stats.eventsStored
        }, userId);
      }
      
      this.emitEvent({ 
        type: 'peer_joined', 
        peerId: userId, 
        userId 
      });
      this.emitEvent({ 
        type: 'connection_status_changed', 
        isConnected: this.isConnected, 
        peerCount: this.stats.connectedPeers 
      });
    });
    
    this.rtc.on('user_disconnect', (_data: any, userId: string) => {
      console.log('👋 Peer left:', userId);
      this.stats.connectedPeers = this.rtc!.getPeers().length;
      this.emitEvent({ 
        type: 'peer_left', 
        peerId: userId, 
        userId 
      });
      this.emitEvent({ 
        type: 'connection_status_changed', 
        isConnected: this.isConnected, 
        peerCount: this.stats.connectedPeers 
      });
    });
    
    // Handle incoming operations from other peers
    this.rtc.on('events', async (data: any) => {
      console.log('📥 Received P2P event:', data.type, data);
      if (data.type === 'distributed_operation') {
        console.log('🔄 Processing remote operation:', data.operation.operation.type);
        await this.handleRemoteOperation(data.operation);
      }
    });
    
    // Handle request for state history from new peers
    this.rtc.on('request_history', async (_data: any, fromUserId: string) => {
      console.log('📜 Peer requested history from:', fromUserId, 'current state has', Object.keys(this.currentState.elements).length, 'elements');
      // Send current state snapshot to the requesting peer
      if (this.rtc) {
        this.rtc.send('full_history', {
          snapshot: this.currentState,
          version: this.stats.eventsStored
        }, fromUserId);
      }
    });
    
    // Handle full history response
    this.rtc.on('full_history', async (data: any, fromUserId: string) => {
      console.log('📥 Received history from peer:', fromUserId, 'snapshot has', Object.keys(data.snapshot?.elements || {}).length, 'elements');
      // If we're new and have no state, apply the history
      if (Object.keys(this.currentState.elements).length === 0 && data.snapshot) {
        console.log('🔄 Applying initial state from peer...');
        this.currentState = { ...data.snapshot };
        
        console.log(`📦 Loaded state from peer: ${Object.keys(this.currentState.elements).length} elements, ${Object.keys(this.currentState.threatActors).length} threat actors`);
        
        // Use consistent state update method
        this.emitStateUpdate();
        
        console.log('✅ Initial state synchronized from peer');
      }
    });
    
    console.log('✅ Network handlers setup complete');
  }
  
  /**
   * Handle operation from remote peer
   */
  private async handleRemoteOperation(operation: OTOperationMeta): Promise<void> {
    console.log('📥 Received remote operation:', operation.operation.type, 'from peer');
    
    // Update vector clock with remote operation
    for (const [author, time] of Object.entries(operation.vectorClock)) {
      this.vectorClock[author] = Math.max(this.vectorClock[author] || 0, time);
    }
    
    // Transform against concurrent local operations if needed
    // This would involve more sophisticated conflict resolution
    
    // Apply to local state (this will update the UI)
    this.applyOperationToState(operation);
    
    // Emit UI update event
    this.emitStateUpdate();
    
    console.log('✅ Remote operation applied and UI updated');
  }

  /**
   * Emit state update to UI layer
   */
  private emitStateUpdate(): void {
    const elements = Object.values(this.currentState.elements);
    const threatActors = Object.values(this.currentState.threatActors);
    
    this.emitEvent({
      type: 'state_updated',
      elements,
      threatActors,
    });
  }
  
  /**
   * Reset for room switch - ensures complete isolation between rooms
   */
  resetForRoomSwitch(): void {
    console.log('🔄 Resetting distributed state for room switch...');
    this.dispose();
  }

  /**
   * Clear current state to prevent room cross-contamination
   */
  private clearCurrentState(): void {
    console.log('🧹 Clearing current state to prevent room isolation issues');
    
    // Reset state completely
    this.currentState = {
      elements: {},
      threatActors: {},
      version: 0,
      lastModified: Date.now(),
      checksum: '',
    };
    
    // Reset vector clock for new room
    this.vectorClock = { [this.nodeId]: 0 };
    
    
    // Reset statistics for new room
    this.stats.operationsApplied = 0;
    this.stats.conflictsResolved = 0;
    this.stats.transformationsPerformed = 0;
    this.stats.eventsStored = 0;
    
    // Emit state update with cleared state
    this.emitEvent({
      type: 'state_updated',
      elements: [],
      threatActors: [],
    });
    
    console.log('✅ State cleared successfully');
  }
  
  /**
   * Smart state loading: request from peers first, fallback to localStorage
   */
  private async requestStateFromPeersOrFallback(roomId: string): Promise<void> {
    if (!this.isConnected || !this.rtc) {
      console.log('🔌 No P2P connection - loading from localStorage');
      await this.loadRoomState(roomId);
      return;
    }

    const peers = this.rtc.getPeers();
    if (peers.length === 0) {
      console.log('👤 No peers available - loading from localStorage');
      await this.loadRoomState(roomId);
      return;
    }

    console.log(`📤 Requesting state from ${peers.length} peers...`);
    
    // Set a flag to track if we got state from peers
    let receivedPeerState = false;
    
    // Listen for peer responses with timeout
    const stateRequestTimeout = setTimeout(async () => {
      if (!receivedPeerState) {
        console.log('⏰ No peer state received, falling back to localStorage');
        await this.loadRoomState(roomId);
      }
    }, 2000); // 2 second timeout
    
    // Set up temporary listener for peer state
    const handlePeerState = (data: any) => {
      if (data.snapshot && Object.keys(data.snapshot.elements || {}).length > 0) {
        console.log('📥 Received state from peers - using peer data');
        receivedPeerState = true;
        clearTimeout(stateRequestTimeout);
        
        // Apply peer state
        this.currentState = { ...data.snapshot };
        this.emitStateUpdate();
      }
    };
    
    this.rtc.on('full_history', handlePeerState);
    
    // Request state from peers
    this.rtc.send('request_history', { since: 0 });
    
    // Cleanup listener after timeout
    setTimeout(() => {
      // this.rtc?.off('full_history', handlePeerState); // off method not implemented
    }, 3000);
  }

  /**
   * Load room state from storage
   */
  private async loadRoomState(roomId: string): Promise<void> {
    try {
      // First try to load saved state directly
      const savedState = this.storageService.loadState(roomId);
      if (savedState && savedState.elements) {
        console.log(`📂 Loading saved state for room ${roomId}:`);
        console.log(`   - ${Object.keys(savedState.elements).length} elements`);
        console.log(`   - ${Object.keys(savedState.threatActors || {}).length} threat actors`);
        
        // Restore the state - convert arrays back to objects keyed by ID
        this.currentState.elements = {};
        this.currentState.threatActors = {};
        
        // Convert elements array to object
        if (Array.isArray(savedState.elements)) {
          for (const element of savedState.elements) {
            this.currentState.elements[element.id] = element;
          }
        } else if (savedState.elements) {
          // Already in object format
          this.currentState.elements = savedState.elements;
        }
        
        // Convert threat actors array to object
        if (Array.isArray(savedState.threatActors)) {
          for (const actor of savedState.threatActors) {
            this.currentState.threatActors[actor.id] = actor;
          }
        } else if (savedState.threatActors) {
          // Already in object format
          this.currentState.threatActors = savedState.threatActors;
        }
        this.currentState.version = savedState.version || 0;
        this.currentState.lastModified = savedState.timestamp || Date.now();
        this.currentState.checksum = this.computeStateChecksum();
        
        // Emit state update to UI
        this.emitEvent({
          type: 'state_updated',
          elements: Object.values(this.currentState.elements),
          threatActors: Object.values(this.currentState.threatActors),
        });
        
        console.log(`✅ Restored state for room ${roomId}, version: ${this.currentState.version}`);
        return;
      }
      
      // Fallback: try loading from events if no saved state
      if (this.sessionManager) {
        const events = this.sessionManager.getRoomEvents(roomId);
        
        // Replay events to rebuild state
        let version = 0;
        for (const event of events) {
          // Convert legacy events to operations and apply
          const operation = this.convertEventToOperation(event);
          if (operation) {
            this.applyOperationToState(operation);
            version++;
          }
        }
        
        console.log(`Loaded ${events.length} events for room ${roomId}, state version: ${version}`);
      } else {
        console.log(`No saved state or events found for room ${roomId}`);
      }
    } catch (error) {
      console.error(`Failed to load room state for ${roomId}:`, error);
    }
  }
  
  /**
   * Convert legacy event to operation (for backward compatibility)
   */
  private convertEventToOperation(_event: any): OTOperationMeta | null {
    // Implementation would depend on the legacy event format
    // This is a simplified conversion
    return null;
  }
  
  /**
   * Persist current state to storage
   */
  private persistCurrentState(): void {
    try {
      this.storageService.saveState(this.stats.currentRoom!, {
        elements: Object.values(this.currentState.elements),
        threatActors: Object.values(this.currentState.threatActors),
        timestamp: Date.now(),
        version: this.currentState.version,
      });
      
      this.stats.eventsStored++;
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }
  
  /**
   * Load persisted state on initialization
   */
  private loadPersistedState(): void {
    try {
      // Load from storage service when available
      // For now, initialize empty state
      console.log('Initialized with empty state');
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }
  
  /**
   * Compute state checksum for integrity verification
   */
  private computeStateChecksum(): string {
    const stateStr = JSON.stringify({
      elements: this.currentState.elements,
      threatActors: this.currentState.threatActors,
    });
    
    let hash = 0;
    for (let i = 0; i < stateStr.length; i++) {
      const char = stateStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Update performance metrics
   */
  private updateTransformationMetrics(duration: number): void {
    this.stats.transformationsPerformed++;
    
    // Update average transform time (exponential moving average)
    const alpha = 0.1;
    this.stats.averageTransformTime = 
      alpha * duration + (1 - alpha) * this.stats.averageTransformTime;
  }
  
  /**
   * Get current state snapshot
   */
  getCurrentState(): StateSnapshot {
    return { ...this.currentState };
  }
  
  /**
   * Get elements array (for compatibility)
   */
  getElements(): DiagramElement[] {
    return Object.values(this.currentState.elements);
  }
  
  /**
   * Get threat actors array (for compatibility)
   */
  getThreatActors(): ThreatActor[] {
    return Object.values(this.currentState.threatActors);
  }
  
  /**
   * Get statistics
   */
  getStats(): DistributedStateStats {
    // Update dynamic stats
    if (this.raftConsensus) {
      const raftStats = this.raftConsensus.getStats();
      this.stats.currentTerm = raftStats.currentTerm;
      this.stats.electionsStarted = raftStats.electionsStarted;
      this.stats.isLeader = raftStats.state === 'leader';
    }
    
    if (this.peerLifecycle) {
      const peerStats = this.peerLifecycle.getStats();
      this.stats.connectedPeers = peerStats.activePeers;
      this.stats.isStable = peerStats.isStable;
    }
    
    if (this.operationalTransforms) {
      const otStats = this.operationalTransforms.getStats();
      this.stats.conflictsResolved = otStats.conflictsResolved;
    }
    
    return { ...this.stats };
  }
  
  /**
   * Dispose of all resources and clean up for room switching
   */
  dispose(): void {
    console.log('🗑️ Disposing distributed state manager...');
    
    // Clear current state completely
    this.clearCurrentState();
    
    // Reset all flags
    this.isConnected = false;
    
    // Clear components
    this.rtc = null;
    this.sessionManager = null;
    this.raftConsensus = null;
    this.operationalTransforms = null;
    this.peerLifecycle = null;
    
    // Reset stats (keep the structure but reset values)
    this.stats.isConnected = false;
    this.stats.isLeader = false;
    this.stats.connectedPeers = 0;
    this.stats.isStable = false;
    this.stats.currentRoom = null;
    this.stats.currentSession = null;
    
    console.log('✅ Distributed state manager disposed');
  }
  
  /**
   * Event handling
   */
  addEventListener(listener: (event: DistributedStateEvent) => void): void {
    this.eventListeners.add(listener);
  }
  
  removeEventListener(listener: (event: DistributedStateEvent) => void): void {
    this.eventListeners.delete(listener);
  }
  
  private emitEvent(event: DistributedStateEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in distributed state event listener:', error);
      }
    }
  }
  
  /**
   * Replay state from a different room (cross-room loading)
   */
  async replayStateFromRoom(
    sourceRoomId: string,
    targetRoomId?: string,
    replayOptions: ReplayOptions = {}
  ): Promise<boolean> {
    if (!this.sessionManager || !this.userId) {
      throw new Error('Session manager not initialized');
    }
    
    const finalTargetRoomId = targetRoomId || this.stats.currentRoom;
    if (!finalTargetRoomId) {
      throw new Error('No target room specified');
    }
    
    try {
      this.emitEvent({ 
        type: 'sync_status_changed', 
        isSyncing: true, 
        progress: 0 
      });
      
      // Load state with intelligent replay
      const success = await this.sessionManager.loadStateFromRoom(
        sourceRoomId,
        finalTargetRoomId,
        this.userId,
        replayOptions.mergeStrategy || 'replace'
      );
      
      if (success) {
        // Reload current state to reflect changes
        await this.loadRoomState(finalTargetRoomId);
        
        this.emitEvent({ 
          type: 'sync_status_changed', 
          isSyncing: false, 
          progress: 1 
        });
        
        console.log(`Successfully replayed state from room ${sourceRoomId} to ${finalTargetRoomId}`);
      }
      
      return success;
    } catch (error) {
      this.emitEvent({
        type: 'error_occurred',
        error: error instanceof Error ? error.message : 'Replay failed',
        context: { sourceRoom: sourceRoomId, targetRoom: finalTargetRoomId }
      });
      
      this.emitEvent({ 
        type: 'sync_status_changed', 
        isSyncing: false, 
        progress: 0 
      });
      
      return false;
    }
  }
  
  /**
   * Create a state snapshot for point-in-time recovery
   */
  async createStateSnapshot(name?: string): Promise<StateSnapshot> {
    const snapshot: StateSnapshot = {
      ...this.currentState,
      version: this.currentState.version + 1,
      lastModified: Date.now(),
      checksum: this.computeStateChecksum()
    };
    
    // Store snapshot with metadata
    const snapshotMetadata = {
      name: name || `Snapshot ${Date.now()}`,
      roomId: this.stats.currentRoom,
      createdBy: this.userId,
      createdAt: Date.now(),
      operationsCount: this.stats.operationsApplied,
      elementCount: Object.keys(snapshot.elements).length,
      threatActorCount: Object.keys(snapshot.threatActors).length
    };
    
    try {
      const key = `snapshot_${this.stats.currentRoom}_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify({ snapshot, metadata: snapshotMetadata }));
      
      this.stats.snapshotsCreated++;
      console.log(`Created state snapshot: ${snapshotMetadata.name}`);
    } catch (error) {
      console.error('Failed to save state snapshot:', error);
    }
    
    return snapshot;
  }
  
  /**
   * Load state from a specific snapshot
   */
  async loadStateFromSnapshot(snapshotKey: string): Promise<boolean> {
    try {
      const snapshotData = localStorage.getItem(snapshotKey);
      if (!snapshotData) {
        throw new Error('Snapshot not found');
      }
      
      const { snapshot } = JSON.parse(snapshotData);
      
      // Validate snapshot integrity
      const stateStr = JSON.stringify({
        elements: snapshot.elements,
        threatActors: snapshot.threatActors,
      });
      let expectedChecksum = 0;
      for (let i = 0; i < stateStr.length; i++) {
        expectedChecksum = ((expectedChecksum << 5) - expectedChecksum + stateStr.charCodeAt(i)) & 0xffffffff;
      }
      if (snapshot.checksum !== expectedChecksum.toString()) {
        throw new Error('Snapshot integrity check failed');
      }
      
      // Apply snapshot to current state
      this.currentState = { ...snapshot };
      
      // Emit state update
      this.emitEvent({
        type: 'state_updated',
        elements: Object.values(this.currentState.elements),
        threatActors: Object.values(this.currentState.threatActors),
      });
      
      console.log('Successfully loaded state from snapshot');
      return true;
    } catch (error) {
      console.error('Failed to load snapshot:', error);
      return false;
    }
  }
  
  /**
   * List available snapshots for current room
   */
  listAvailableSnapshots(): Array<{ key: string; metadata: any }> {
    const snapshots: Array<{ key: string; metadata: any }> = [];
    const roomId = this.stats.currentRoom;
    
    if (!roomId) return snapshots;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`snapshot_${roomId}_`)) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const { metadata } = JSON.parse(data);
            snapshots.push({ key, metadata });
          }
        } catch (error) {
          console.warn(`Failed to parse snapshot ${key}:`, error);
        }
      }
    }
    
    return snapshots.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  }
  
  /**
   * Replay operations from a specific point in time
   */
  async replayFromTimestamp(
    timestamp: number,
    targetTimestamp?: number
  ): Promise<boolean> {
    if (!this.sessionManager || !this.stats.currentRoom) {
      throw new Error('Session manager or current room not available');
    }
    
    try {
      const events = this.sessionManager.getRoomEvents(this.stats.currentRoom);
      
      // Filter events by timestamp range
      const filteredEvents = events.filter(event => {
        const eventTime = event.seq; // Assuming seq represents timestamp
        return eventTime >= timestamp && 
               (!targetTimestamp || eventTime <= targetTimestamp);
      });
      
      // Reset state to snapshot before replay timestamp
      const snapshotBefore = this.findSnapshotBeforeTimestamp(timestamp);
      if (snapshotBefore) {
        await this.loadStateFromSnapshot(snapshotBefore.key);
      } else {
        // Reset to empty state
        this.currentState = {
          elements: {},
          threatActors: {},
          version: 0,
          lastModified: timestamp,
          checksum: ''
        };
      }
      
      // Replay filtered events
      for (const event of filteredEvents) {
        const operation = this.convertEventToOperation(event);
        if (operation) {
          this.applyOperationToState(operation);
        }
      }
      
      this.emitEvent({
        type: 'state_updated',
        elements: Object.values(this.currentState.elements),
        threatActors: Object.values(this.currentState.threatActors),
      });
      
      console.log(`Replayed ${filteredEvents.length} operations from timestamp ${timestamp}`);
      return true;
    } catch (error) {
      console.error('Failed to replay from timestamp:', error);
      return false;
    }
  }
  
  /**
   * Find the most recent snapshot before a given timestamp
   */
  private findSnapshotBeforeTimestamp(timestamp: number): { key: string; metadata: any } | null {
    const snapshots = this.listAvailableSnapshots();
    
    for (const snapshot of snapshots) {
      if (snapshot.metadata.createdAt < timestamp) {
        return snapshot;
      }
    }
    
    return null;
  }
  
  /**
   * Export room state for backup or migration
   */
  async exportRoomState(roomId?: string): Promise<RoomExport | null> {
    const targetRoomId = roomId || this.stats.currentRoom;
    if (!targetRoomId || !this.sessionManager) {
      return null;
    }
    
    try {
      const events = this.sessionManager.getRoomEvents(targetRoomId);
      const snapshot = await this.createStateSnapshot(`Export ${Date.now()}`);
      
      const exportData: RoomExport = {
        roomId: targetRoomId,
        exportedAt: Date.now(),
        exportedBy: this.userId || 'unknown',
        version: '1.0.0',
        snapshot,
        events,
        statistics: this.getStats(),
        checksum: this.computeChecksum(JSON.stringify({ snapshot, events })),
      };
      
      console.log(`Exported room state for ${targetRoomId}`);
      return exportData;
    } catch (error) {
      console.error('Failed to export room state:', error);
      return null;
    }
  }
  
  /**
   * Import room state from backup
   */
  async importRoomState(
    exportData: RoomExport,
    targetRoomId?: string,
    importOptions: ImportOptions = {}
  ): Promise<boolean> {
    if (!this.sessionManager || !this.userId) {
      throw new Error('Session manager not initialized');
    }
    
    try {
      // Validate export data integrity
      const expectedChecksum = this.computeChecksum(
        JSON.stringify({ 
          snapshot: exportData.snapshot, 
          events: exportData.events 
        })
      );
      
      if (exportData.checksum !== expectedChecksum) {
        throw new Error('Export data integrity check failed');
      }
      
      const finalTargetRoomId = targetRoomId || this.stats.currentRoom;
      if (!finalTargetRoomId) {
        throw new Error('No target room specified');
      }
      
      if (importOptions.preserveExisting) {
        // Merge with existing state
        return this.sessionManager.loadStateFromRoom(
          exportData.roomId,
          finalTargetRoomId,
          this.userId,
          'merge'
        );
      } else {
        // Replace existing state
        const success = await this.sessionManager.saveRoomEvents(
          finalTargetRoomId,
          exportData.events
        );
        
        if (success) {
          // Apply snapshot
          this.currentState = { ...exportData.snapshot };
          
          this.emitEvent({
            type: 'state_updated',
            elements: Object.values(this.currentState.elements),
            threatActors: Object.values(this.currentState.threatActors),
          });
        }
        
        return success;
      }
    } catch (error) {
      console.error('Failed to import room state:', error);
      return false;
    }
  }
  
  /**
   * Enhanced checksum computation for complex data
   */
  private computeChecksum(data: any): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    if (this.sessionManager) this.sessionManager.shutdown();
    if (this.raftConsensus) this.raftConsensus.shutdown();
    if (this.peerLifecycle) this.peerLifecycle.shutdown();
    
    this.eventListeners.clear();
    this.isConnected = false;
    
    console.log('Distributed state manager shut down');
  }
}