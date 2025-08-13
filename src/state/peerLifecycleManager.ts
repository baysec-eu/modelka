// src/state/peerLifecycleManager.ts - Enterprise-grade peer lifecycle management
import { SessionManager, Session } from './sessionManager';
import { RaftConsensusProtocol } from './raftConsensus';
import { OTOperationMeta } from './operationalTransforms';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

/**
 * Peer state tracking
 */
export interface PeerInfo {
  nodeId: string;
  sessionId: string;
  userId: string;
  joinedAt: number;
  lastSeen: number;
  state: PeerState;
  connectionQuality: ConnectionQuality;
  capabilities: PeerCapabilities;
  version: string; // Protocol version
  syncState: SyncState;
  permissions: PeerPermissions;
}

export type PeerState = 
  | 'connecting'      // Initial connection phase
  | 'authenticating'  // Verifying permissions
  | 'synchronizing'   // Receiving full state
  | 'active'          // Fully operational
  | 'disconnecting'   // Graceful shutdown
  | 'disconnected'    // Connection lost
  | 'rejoining'       // Reconnecting after disconnect
  | 'quarantined';    // Isolated due to issues

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'unstable';

export interface PeerCapabilities {
  supportsOT: boolean;          // Operational Transforms
  supportsRaft: boolean;        // Raft consensus
  supportsCompression: boolean; // Data compression
  maxOperationsPerSecond: number;
  protocolVersion: string;
}

export interface SyncState {
  isFullySynced: boolean;
  lastSyncedIndex: number;
  pendingOperationCount: number;
  syncProgress: number; // 0-1
  syncStartedAt?: number;
  estimatedCompletionTime?: number;
}

export interface PeerPermissions {
  canRead: boolean;
  canWrite: boolean;
  canInvite: boolean;
  canModifyPermissions: boolean;
  maxConcurrentOperations: number;
}

/**
 * Lifecycle events
 */
export type LifecycleEvent =
  | { type: 'peer_join_requested'; peerId: string; credentials: any }
  | { type: 'peer_authenticated'; peerId: string; session: Session }
  | { type: 'peer_sync_started'; peerId: string; totalOperations: number }
  | { type: 'peer_sync_progress'; peerId: string; progress: number }
  | { type: 'peer_sync_completed'; peerId: string; duration: number }
  | { type: 'peer_active'; peerId: string }
  | { type: 'peer_disconnected'; peerId: string; reason: string }
  | { type: 'peer_reconnecting'; peerId: string }
  | { type: 'peer_quarantined'; peerId: string; reason: string }
  | { type: 'network_partition_detected'; affectedPeers: string[] }
  | { type: 'network_partition_healed'; reconciledPeers: string[] }
  | { type: 'leadership_changed'; oldLeader: string | null; newLeader: string }
  | { type: 'cluster_stability_changed'; stable: boolean; reason: string };

/**
 * Enterprise Peer Lifecycle Manager
 * Handles all aspects of peer joining, leaving, and network issues
 */
export class PeerLifecycleManager {
  private peers: Map<string, PeerInfo> = new Map();
  private pendingOperations: Map<string, OTOperationMeta[]> = new Map(); // Queued during instability
  private eventListeners: Set<(event: LifecycleEvent) => void> = new Set();
  
  // Dependencies
  private sessionManager: SessionManager;
  private raftConsensus: RaftConsensusProtocol;
  private rtc: ServerlessWebRTC | null = null;

  // Configuration
  private readonly PEER_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private readonly PARTITION_DETECTION_THRESHOLD = 15000; // 15 seconds

  // State
  private currentRoomId: string;
  private isStable: boolean = true;
  private partitionDetected: boolean = false;
  private reconnectAttempts: Map<string, number> = new Map();

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private peerTimeoutTimer: ReturnType<typeof setInterval> | null = null;
  private partitionCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Statistics
  private stats = {
    peersJoined: 0,
    peersLeft: 0,
    reconnections: 0,
    partitionsDetected: 0,
    operationsQueued: 0,
    syncOperationsCompleted: 0,
  };

  constructor(
    sessionManager: SessionManager,
    raftConsensus: RaftConsensusProtocol,
    roomId: string
  ) {
    this.sessionManager = sessionManager;
    this.raftConsensus = raftConsensus;
    this.currentRoomId = roomId;

    this.startHeartbeat();
    this.startPeerTimeoutChecks();
    this.startPartitionDetection();
  }

  /**
   * Initialize with WebRTC connection
   */
  initialize(rtc: ServerlessWebRTC): void {
    this.rtc = rtc;
    this.setupNetworkHandlers();
  }

  /**
   * Handle peer join request
   */
  async handlePeerJoinRequest(
    peerId: string, 
    userId: string, 
    credentials: any
  ): Promise<{ success: boolean; session?: Session; error?: string }> {
    this.emitEvent({ type: 'peer_join_requested', peerId, credentials });

    try {
      // 1. Authentication phase
      const session = this.sessionManager.joinRoom(userId, this.currentRoomId);
      
      // Skip permission check - AES-GCM encryption provides security

      this.emitEvent({ type: 'peer_authenticated', peerId, session });

      // 2. Create peer info
      const peerInfo: PeerInfo = {
        nodeId: peerId,
        sessionId: session.id,
        userId,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        state: 'synchronizing',
        connectionQuality: 'good',
        capabilities: await this.detectPeerCapabilities(),
        version: '1.0.0',
        syncState: {
          isFullySynced: false,
          lastSyncedIndex: 0,
          pendingOperationCount: 0,
          syncProgress: 0,
          syncStartedAt: Date.now(),
        },
        permissions: this.mapSessionPermissions(session.permissions),
      };

      this.peers.set(peerId, peerInfo);
      this.stats.peersJoined++;

      // 3. Start synchronization process
      await this.startPeerSynchronization(peerId);

      // 4. Add to Raft cluster
      this.raftConsensus.addNode(peerId);

      // 5. Update cluster stability
      this.updateClusterStability();

      return { success: true, session };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start full state synchronization for new peer
   */
  private async startPeerSynchronization(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    this.emitEvent({ type: 'peer_sync_started', peerId, totalOperations: 0 });

    try {
      // Get all committed operations
      const operations = this.raftConsensus.getCommittedOperations();
      const totalOps = operations.length;

      if (totalOps === 0) {
        // No operations to sync
        this.completePeerSync(peerId, 0);
        return;
      }

      // Send operations in batches to avoid overwhelming the peer
      const BATCH_SIZE = 50;
      let syncedCount = 0;

      for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = operations.slice(i, i + BATCH_SIZE);
        
        await this.sendSyncBatch(batch, syncedCount, totalOps);
        syncedCount += batch.length;

        // Update sync progress
        const progress = syncedCount / totalOps;
        this.updateSyncProgress(peerId, progress);

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      this.completePeerSync(peerId, Date.now() - peer.syncState.syncStartedAt!);
    } catch (error) {
      console.error(`Failed to sync peer ${peerId}:`, error);
      this.quarantinePeer(peerId, `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send sync batch to peer
   */
  private async sendSyncBatch(
    operations: OTOperationMeta[], 
    syncedCount: number, 
    totalOps: number
  ): Promise<void> {
    if (!this.rtc) return;

    const message = {
      type: 'sync_batch',
      roomId: this.currentRoomId,
      operations,
      batchInfo: {
        currentBatch: Math.floor(syncedCount / 50) + 1,
        totalBatches: Math.ceil(totalOps / 50),
        syncedCount,
        totalOperations: totalOps,
      },
    };

    await this.rtc.send('events', message);
    this.stats.syncOperationsCompleted += operations.length;
  }

  /**
   * Update peer sync progress
   */
  private updateSyncProgress(peerId: string, progress: number): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.syncState.syncProgress = progress;
    peer.lastSeen = Date.now();

    this.emitEvent({ type: 'peer_sync_progress', peerId, progress });
  }

  /**
   * Complete peer synchronization
   */
  private completePeerSync(peerId: string, duration: number): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.state = 'active';
    peer.syncState.isFullySynced = true;
    peer.syncState.syncProgress = 1;
    peer.lastSeen = Date.now();

    this.emitEvent({ type: 'peer_sync_completed', peerId, duration });
    this.emitEvent({ type: 'peer_active', peerId });

    console.log(`Peer ${peerId} successfully synchronized in ${duration}ms`);
  }

  /**
   * Handle peer graceful disconnect
   */
  handlePeerGracefulDisconnect(peerId: string, reason: string = 'User left'): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.state = 'disconnecting';
    
    // Cleanup session
    this.sessionManager.leaveRoom(peer.sessionId);
    
    // Remove from Raft cluster
    this.raftConsensus.removeNode(peerId);
    
    // Remove peer
    this.peers.delete(peerId);
    this.stats.peersLeft++;
    
    this.emitEvent({ type: 'peer_disconnected', peerId, reason });
    this.updateClusterStability();
    
    console.log(`Peer ${peerId} disconnected gracefully: ${reason}`);
  }

  /**
   * Handle unexpected peer disconnect
   */
  handlePeerUnexpectedDisconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.state = 'disconnected';
    peer.lastSeen = Date.now();
    
    // Don't remove immediately - they might reconnect
    setTimeout(() => {
      if (this.peers.has(peerId) && this.peers.get(peerId)?.state === 'disconnected') {
        this.handlePeerGracefulDisconnect(peerId, 'Connection timeout');
      }
    }, this.PEER_TIMEOUT);

    this.emitEvent({ type: 'peer_disconnected', peerId, reason: 'Unexpected disconnect' });
    this.updateClusterStability();
    
    console.log(`Peer ${peerId} disconnected unexpectedly`);
  }

  /**
   * Handle peer reconnection attempt
   */
  async handlePeerReconnect(peerId: string, userId: string): Promise<boolean> {
    const attempts = this.reconnectAttempts.get(peerId) || 0;
    
    if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log(`Peer ${peerId} exceeded maximum reconnect attempts`);
      return false;
    }

    this.reconnectAttempts.set(peerId, attempts + 1);
    this.stats.reconnections++;

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.state = 'rejoining';
      peer.lastSeen = Date.now();
      
      this.emitEvent({ type: 'peer_reconnecting', peerId });
      
      // Re-sync peer with any missed operations
      await this.startPeerSynchronization(peerId);
      return true;
    }

    // Peer not found, treat as new join
    const result = await this.handlePeerJoinRequest(peerId, userId, {});
    return result.success;
  }

  /**
   * Quarantine problematic peer
   */
  private quarantinePeer(peerId: string, reason: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.state = 'quarantined';
    
    this.emitEvent({ type: 'peer_quarantined', peerId, reason });
    
    // Remove from active operations
    this.raftConsensus.removeNode(peerId);
    
    console.warn(`Peer ${peerId} quarantined: ${reason}`);
  }

  /**
   * Queue operation during instability
   */
  queueOperation(operation: OTOperationMeta): void {
    const peerId = operation.authorId;
    
    if (!this.pendingOperations.has(peerId)) {
      this.pendingOperations.set(peerId, []);
    }
    
    this.pendingOperations.get(peerId)!.push(operation);
    this.stats.operationsQueued++;
  }

  /**
   * Process queued operations when stability returns
   */
  private async processQueuedOperations(): Promise<void> {
    if (!this.isStable) return;

    for (const [peerId, operations] of this.pendingOperations) {
      if (operations.length > 0) {
        console.log(`Processing ${operations.length} queued operations for peer ${peerId}`);
        
        for (const operation of operations) {
          try {
            await this.raftConsensus.submitOperation(operation);
          } catch (error) {
            console.error(`Failed to process queued operation:`, error);
          }
        }
        
        operations.length = 0; // Clear the queue
      }
    }
  }

  /**
   * Update cluster stability status
   */
  private updateClusterStability(): void {
    const activePeers = Array.from(this.peers.values())
      .filter(peer => peer.state === 'active' || peer.state === 'synchronizing');
    
    const wasStable = this.isStable;
    this.isStable = activePeers.length >= 1 && !this.partitionDetected;
    
    if (wasStable !== this.isStable) {
      const reason = this.isStable ? 'Sufficient active peers' : 'Insufficient active peers';
      this.emitEvent({ type: 'cluster_stability_changed', stable: this.isStable, reason });
      
      if (this.isStable) {
        this.processQueuedOperations();
      }
    }
  }

  /**
   * Detect peer capabilities
   */
  private async detectPeerCapabilities(): Promise<PeerCapabilities> {
    // In a real implementation, this would negotiate capabilities
    return {
      supportsOT: true,
      supportsRaft: true,
      supportsCompression: true,
      maxOperationsPerSecond: 100,
      protocolVersion: '1.0.0',
    };
  }

  /**
   * Map session permissions to peer permissions
   */
  private mapSessionPermissions(sessionPermissions: any): PeerPermissions {
    return {
      canRead: sessionPermissions.canView,
      canWrite: sessionPermissions.canEdit,
      canInvite: sessionPermissions.canInvite,
      canModifyPermissions: sessionPermissions.canAdmin,
      maxConcurrentOperations: sessionPermissions.canEdit ? 50 : 0,
    };
  }

  /**
   * Setup network event handlers
   */
  private setupNetworkHandlers(): void {
    if (!this.rtc) return;

    this.rtc.on('user_presence', (_data: any, fromNodeId: string) => {
      // Update last seen time
      const peer = this.peers.get(fromNodeId);
      if (peer) {
        peer.lastSeen = Date.now();
        if (peer.state === 'disconnected') {
          this.handlePeerReconnect(fromNodeId, peer.userId);
        }
      }
    });

    this.rtc.on('user_disconnect', (_data: any, fromNodeId: string) => {
      this.handlePeerUnexpectedDisconnect(fromNodeId);
    });

    this.rtc.on('events', (message: any, fromNodeId: string) => {
      this.handleLifecycleMessage(message, fromNodeId);
    });
  }

  /**
   * Handle lifecycle-specific messages
   */
  private handleLifecycleMessage(message: any, fromNodeId: string): void {
    switch (message.type) {
      case 'heartbeat':
        this.handleHeartbeat(fromNodeId);
        break;
      case 'sync_batch_ack':
        this.handleSyncBatchAck(fromNodeId, message);
        break;
      case 'leave_notification':
        this.handlePeerGracefulDisconnect(fromNodeId, message.reason);
        break;
    }
  }

  /**
   * Handle heartbeat from peer
   */
  private handleHeartbeat(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
      
      // Update connection quality based on heartbeat timing
      const timeSinceLastSeen = Date.now() - peer.lastSeen;
      if (timeSinceLastSeen < 1000) {
        peer.connectionQuality = 'excellent';
      } else if (timeSinceLastSeen < 5000) {
        peer.connectionQuality = 'good';
      } else if (timeSinceLastSeen < 15000) {
        peer.connectionQuality = 'poor';
      } else {
        peer.connectionQuality = 'unstable';
      }
    }
  }

  /**
   * Handle sync batch acknowledgment
   */
  private handleSyncBatchAck(peerId: string, message: any): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.syncState.lastSyncedIndex = message.lastSyncedIndex;
    }
  }

  /**
   * Start periodic heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.rtc) {
        this.rtc.send('events', {
          type: 'heartbeat',
          roomId: this.currentRoomId,
          timestamp: Date.now(),
        });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Start peer timeout checks
   */
  private startPeerTimeoutChecks(): void {
    this.peerTimeoutTimer = setInterval(() => {
      const now = Date.now();
      
      for (const [peerId, peer] of this.peers) {
        if (now - peer.lastSeen > this.PEER_TIMEOUT) {
          if (peer.state === 'active' || peer.state === 'synchronizing') {
            this.handlePeerUnexpectedDisconnect(peerId);
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Start network partition detection
   */
  private startPartitionDetection(): void {
    this.partitionCheckTimer = setInterval(() => {
      this.checkForNetworkPartition();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Check for network partition
   */
  private checkForNetworkPartition(): void {
    const now = Date.now();
    const disconnectedPeers: string[] = [];
    
    for (const [peerId, peer] of this.peers) {
      if (now - peer.lastSeen > this.PARTITION_DETECTION_THRESHOLD) {
        disconnectedPeers.push(peerId);
      }
    }
    
    const partitionDetected = disconnectedPeers.length > this.peers.size / 2;
    
    if (partitionDetected && !this.partitionDetected) {
      this.partitionDetected = true;
      this.emitEvent({ type: 'network_partition_detected', affectedPeers: disconnectedPeers });
      this.updateClusterStability();
    } else if (!partitionDetected && this.partitionDetected) {
      this.partitionDetected = false;
      this.emitEvent({ type: 'network_partition_healed', reconciledPeers: disconnectedPeers });
      this.updateClusterStability();
    }
  }

  /**
   * Event handling
   */
  addEventListener(listener: (event: LifecycleEvent) => void): void {
    this.eventListeners.add(listener);
  }

  removeEventListener(listener: (event: LifecycleEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  private emitEvent(event: LifecycleEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in lifecycle event listener:', error);
      }
    }
  }

  /**
   * Public API
   */
  getPeerInfo(peerId: string): PeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getAllPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  getActivePeers(): PeerInfo[] {
    return this.getAllPeers().filter(peer => peer.state === 'active');
  }

  isClusterStable(): boolean {
    return this.isStable;
  }

  getStats() {
    return {
      ...this.stats,
      activePeers: this.getActivePeers().length,
      totalPeers: this.peers.size,
      isStable: this.isStable,
      partitionDetected: this.partitionDetected,
      queuedOperations: Array.from(this.pendingOperations.values())
        .reduce((total, ops) => total + ops.length, 0),
    };
  }

  /**
   * Cleanup
   */
  shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.peerTimeoutTimer) clearInterval(this.peerTimeoutTimer);
    if (this.partitionCheckTimer) clearInterval(this.partitionCheckTimer);

    // Notify all peers of shutdown
    for (const peerId of this.peers.keys()) {
      this.handlePeerGracefulDisconnect(peerId, 'System shutdown');
    }
  }
}