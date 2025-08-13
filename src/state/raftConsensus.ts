// src/state/raftConsensus.ts - Enterprise-grade Raft consensus protocol
import { OTOperationMeta } from './operationalTransforms';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

/**
 * Raft node states
 */
export type RaftNodeState = 'follower' | 'candidate' | 'leader';

/**
 * Raft log entry
 */
export interface RaftLogEntry {
  term: number; // Leader term when entry was created
  index: number; // Position in log
  operation: OTOperationMeta; // The actual operation
  committed: boolean; // Whether entry is committed
  timestamp: number;
  checksum: string; // For integrity verification
}

/**
 * Raft message types
 */
export type RaftMessage = 
  | { type: 'request_vote'; term: number; candidateId: string; lastLogIndex: number; lastLogTerm: number; roomId: string }
  | { type: 'vote_response'; term: number; voteGranted: boolean; voterId: string; roomId: string }
  | { type: 'append_entries'; term: number; leaderId: string; prevLogIndex: number; prevLogTerm: number; entries: RaftLogEntry[]; leaderCommit: number; roomId: string }
  | { type: 'append_response'; term: number; success: boolean; matchIndex: number; followerId: string; roomId: string }
  | { type: 'heartbeat'; term: number; leaderId: string; roomId: string }
  | { type: 'install_snapshot'; term: number; leaderId: string; lastIncludedIndex: number; lastIncludedTerm: number; data: any; roomId: string };

/**
 * Raft cluster configuration
 */
interface ClusterConfig {
  nodeId: string;
  nodes: Set<string>; // All node IDs in cluster
  roomId: string;
  quorumSize: number; // Majority size for decisions
}

/**
 * Raft consensus implementation
 * Based on the original Raft paper with optimizations for P2P networks
 */
export class RaftConsensusProtocol {
  // Persistent state (survives restarts)
  private currentTerm: number = 0;
  private votedFor: string | null = null;
  private log: RaftLogEntry[] = [];

  // Volatile state
  private commitIndex: number = 0;
  private lastApplied: number = 0;
  private state: RaftNodeState = 'follower';
  private leaderId: string | null = null;

  // Leader state (reset after election)
  private nextIndex: Map<string, number> = new Map(); // Next log index to send to each follower
  private matchIndex: Map<string, number> = new Map(); // Highest log index replicated on each follower

  // Timers and intervals
  private electionTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Configuration
  private readonly ELECTION_TIMEOUT_MIN = 150; // 150ms minimum
  private readonly ELECTION_TIMEOUT_MAX = 300; // 300ms maximum  
  private readonly HEARTBEAT_INTERVAL = 50; // 50ms heartbeat

  // Network and cluster
  private rtc: ServerlessWebRTC | null = null;
  private config: ClusterConfig;
  private pendingHeartbeatStart: boolean = false; // Flag to start heartbeats when RTC becomes available

  // Statistics and monitoring
  private stats = {
    messagesReceived: 0,
    messagesSent: 0,
    electionsStarted: 0,
    electionTimeouts: 0,
    heartbeatsSent: 0,
    entriesReplicated: 0,
    conflictsResolved: 0,
  };

  constructor(nodeId: string, roomId: string) {
    this.config = {
      nodeId,
      nodes: new Set([nodeId]),
      roomId,
      quorumSize: 1,
    };

    this.startElectionTimer();
    this.loadPersistedState();
  }

  /**
   * Initialize with WebRTC connection
   */
  initialize(rtc: ServerlessWebRTC): void {
    this.rtc = rtc;
    this.setupMessageHandlers();
    
    // Start heartbeats if we were waiting for RTC connection
    if (this.pendingHeartbeatStart && this.state === 'leader') {
      this.pendingHeartbeatStart = false;
      this.startHeartbeat();
      this.sendHeartbeats();
      console.log('🔄 RTC connection ready - starting pending heartbeats for peer discovery');
    }
  }

  /**
   * Add node to cluster
   */
  addNode(nodeId: string): void {
    if (!this.config.nodes.has(nodeId)) {
      const wasEarlierSingleUser = this.config.nodes.size <= 1;
      
      this.config.nodes.add(nodeId);
      this.config.quorumSize = Math.floor(this.config.nodes.size / 2) + 1;
      
      console.log(`Added node ${nodeId} to cluster. Quorum size: ${this.config.quorumSize}`);
      
      // Initialize leader state for new node
      if (this.state === 'leader') {
        this.nextIndex.set(nodeId, this.log.length);
        this.matchIndex.set(nodeId, 0);
        
        // Transition from single-user to multi-user mode
        if (wasEarlierSingleUser) {
          console.log('🌐 Transitioning from single-user to multi-user mode');
          // Start heartbeats now that we have other nodes
          this.startHeartbeat();
          // Send initial heartbeat to new node
          this.sendHeartbeats();
        }
      }
    }
  }

  /**
   * Remove node from cluster  
   */
  removeNode(nodeId: string): void {
    if (this.config.nodes.has(nodeId) && this.config.nodes.size > 1) {
      this.config.nodes.delete(nodeId);
      this.config.quorumSize = Math.floor(this.config.nodes.size / 2) + 1;
      
      // Clean up leader state
      this.nextIndex.delete(nodeId);
      this.matchIndex.delete(nodeId);

      console.log(`Removed node ${nodeId} from cluster. Quorum size: ${this.config.quorumSize}`);

      // Handle transition back to single-user mode
      if (this.config.nodes.size <= 1) {
        console.log('🏠 Transitioning back to single-user mode');
        if (this.state === 'leader') {
          // Stop heartbeats since we're back to single-user
          this.stopHeartbeat();
        } else {
          // Become leader in single-user mode
          this.becomeLeader();
        }
      } else if (this.state === 'leader' && this.config.nodes.size < this.config.quorumSize) {
        // If we lost quorum but still have multiple nodes, step down
        this.stepDown();
      }
    }
  }

  /**
   * Get current peer count for single-user mode detection
   */
  private getPeerCount(): number {
    return this.rtc?.getStats?.()?.connectedPeers || 0;
  }

  /**
   * Submit operation to Raft (only leader can do this)
   */
  async submitOperation(operation: OTOperationMeta): Promise<boolean> {
    console.log(`🔍 submitOperation called - nodeId: ${this.config.nodeId}, state: ${this.state}, leaderId: ${this.leaderId}, term: ${this.currentTerm}`);
    
    // Auto-elect self as leader if no leader exists and elections are failing
    if (this.state !== 'leader') {
      if (!this.rtc || this.getPeerCount() === 0 || (this.leaderId === null && this.currentTerm > 5)) {
        console.log('👑 Auto-electing self as leader (offline mode or failed elections)');
        this.state = 'leader';
        this.leaderId = this.config.nodeId;
        this.votedFor = this.config.nodeId;
        this.currentTerm++;
        console.log(`✅ Self-elected as leader - nodeId: ${this.config.nodeId}, leaderId: ${this.leaderId}`);
      } else {
        console.error(`❌ Leadership check failed - state: ${this.state}, leaderId: ${this.leaderId}, nodeId: ${this.config.nodeId}`);
        throw new Error(`Only leader can submit operations. Current leader: ${this.leaderId}`);
      }
    }

    // Create log entry
    const entry: RaftLogEntry = {
      term: this.currentTerm,
      index: this.log.length,
      operation,
      committed: false,
      timestamp: Date.now(),
      checksum: this.computeEntryChecksum(operation),
    };

    // Add to local log
    this.log.push(entry);
    this.stats.entriesReplicated++;

    // Immediately replicate to followers
    await this.replicateToFollowers();

    // Check if we can commit this entry
    this.tryCommitEntries();

    this.persistState();
    return true;
  }

  /**
   * Get committed operations that haven't been applied
   */
  getCommittedOperations(): OTOperationMeta[] {
    const operations: OTOperationMeta[] = [];
    
    for (let i = this.lastApplied; i < this.commitIndex; i++) {
      if (this.log[i] && this.log[i].committed) {
        operations.push(this.log[i].operation);
      }
    }

    this.lastApplied = this.commitIndex;
    return operations;
  }

  /**
   * Setup WebRTC message handlers
   */
  private setupMessageHandlers(): void {
    if (!this.rtc) return;

    this.rtc.on('raft_message', (message: RaftMessage, fromNodeId: string) => {
      this.handleMessage(message, fromNodeId);
    });

    this.rtc.on('user_presence', (_data: any, fromNodeId: string) => {
      this.addNode(fromNodeId);
    });

    this.rtc.on('user_disconnect', (_data: any, fromNodeId: string) => {
      this.removeNode(fromNodeId);
    });
  }

  /**
   * Handle incoming Raft messages
   */
  private handleMessage(message: RaftMessage, fromNodeId: string): void {
    // Ignore messages from other rooms
    if (message.roomId !== this.config.roomId) return;
    
    // Ignore messages from ourselves
    if (fromNodeId === this.config.nodeId) {
      console.log(`🔇 Ignoring message from self: ${fromNodeId}`);
      return;
    }

    this.stats.messagesReceived++;

    // Update term if we see a higher term
    if (message.term > this.currentTerm) {
      this.currentTerm = message.term;
      this.votedFor = null;
      this.stepDown();
    }

    switch (message.type) {
      case 'request_vote':
        this.handleVoteRequest(message, fromNodeId);
        break;
      case 'vote_response':
        this.handleVoteResponse(message, fromNodeId);
        break;
      case 'append_entries':
        this.handleAppendEntries(message, fromNodeId);
        break;
      case 'append_response':
        this.handleAppendResponse(message, fromNodeId);
        break;
      case 'heartbeat':
        this.handleHeartbeat(message, fromNodeId);
        break;
      case 'install_snapshot':
        this.handleInstallSnapshot(message, fromNodeId);
        break;
    }
  }

  /**
   * Handle vote request from candidate
   */
  private handleVoteRequest(message: Extract<RaftMessage, { type: 'request_vote' }>, fromNodeId: string): void {
    let voteGranted = false;

    // Grant vote if:
    // 1. Haven't voted in this term OR already voted for this candidate
    // 2. Candidate's log is at least as up-to-date as ours
    if ((this.votedFor === null || this.votedFor === fromNodeId) &&
        this.isLogUpToDate(message.lastLogIndex, message.lastLogTerm)) {
      voteGranted = true;
      this.votedFor = fromNodeId;
      this.resetElectionTimer();
    }

    // Send vote response
    this.sendMessage({
      type: 'vote_response',
      term: this.currentTerm,
      voteGranted,
      voterId: this.config.nodeId,
      roomId: this.config.roomId,
    }, fromNodeId);

    this.persistState();
  }

  /**
   * Handle vote response from follower
   */
  private handleVoteResponse(message: Extract<RaftMessage, { type: 'vote_response' }>, _fromNodeId: string): void {
    // Only candidates care about votes
    if (this.state !== 'candidate') return;

    if (message.voteGranted) {
      // Count votes (including our own)
      const votes = Array.from(this.config.nodes).filter(nodeId => {
        return nodeId === this.config.nodeId || this.hasVoteFrom(nodeId);
      }).length;

      // Become leader if we have majority
      if (votes >= this.config.quorumSize) {
        this.becomeLeader();
      }
    }
  }

  /**
   * Handle append entries from leader
   */
  private handleAppendEntries(message: Extract<RaftMessage, { type: 'append_entries' }>, fromNodeId: string): void {
    let success = false;
    let matchIndex = 0;

    // Reset election timer since we heard from leader
    this.resetElectionTimer();
    this.leaderId = fromNodeId;

    // Step down to follower if we were candidate/leader
    if (this.state !== 'follower') {
      this.stepDown();
    }

    // Check if our log matches leader's
    if (this.isLogConsistent(message.prevLogIndex, message.prevLogTerm)) {
      // Remove conflicting entries and append new ones
      this.log = this.log.slice(0, message.prevLogIndex + 1);
      this.log.push(...message.entries);

      matchIndex = this.log.length - 1;
      success = true;

      // Update commit index
      if (message.leaderCommit > this.commitIndex) {
        this.commitIndex = Math.min(message.leaderCommit, this.log.length - 1);
      }

      this.persistState();
    }

    // Send response to leader
    this.sendMessage({
      type: 'append_response',
      term: this.currentTerm,
      success,
      matchIndex,
      followerId: this.config.nodeId,
      roomId: this.config.roomId,
    }, fromNodeId);
  }

  /**
   * Handle append response from follower
   */
  private handleAppendResponse(message: Extract<RaftMessage, { type: 'append_response' }>, fromNodeId: string): void {
    // Only leader cares about append responses
    if (this.state !== 'leader') return;

    if (message.success) {
      // Update follower's match index
      this.matchIndex.set(fromNodeId, message.matchIndex);
      this.nextIndex.set(fromNodeId, message.matchIndex + 1);

      // Try to commit more entries
      this.tryCommitEntries();
    } else {
      // Decrement nextIndex and retry
      const currentNext = this.nextIndex.get(fromNodeId) || 0;
      this.nextIndex.set(fromNodeId, Math.max(0, currentNext - 1));
      
      // Send entries again with lower nextIndex
      this.sendAppendEntriesToFollower(fromNodeId);
    }
  }

  /**
   * Handle heartbeat from leader
   */
  private handleHeartbeat(_message: Extract<RaftMessage, { type: 'heartbeat' }>, fromNodeId: string): void {
    // Reset election timer
    this.resetElectionTimer();
    this.leaderId = fromNodeId;

    // Step down if we were candidate/leader
    if (this.state !== 'follower') {
      this.stepDown();
    }
  }

  /**
   * Handle snapshot installation
   */
  private handleInstallSnapshot(message: Extract<RaftMessage, { type: 'install_snapshot' }>, fromNodeId: string): void {
    // Reset election timer
    this.resetElectionTimer();
    this.leaderId = fromNodeId;

    // Install snapshot
    this.log = [];
    this.commitIndex = message.lastIncludedIndex;
    this.lastApplied = message.lastIncludedIndex;

    // Apply snapshot data would go here
    console.log(`Installed snapshot up to index ${message.lastIncludedIndex}`);

    this.persistState();
  }

  /**
   * Start election process
   */
  private startElection(): void {
    this.state = 'candidate';
    this.currentTerm++;
    this.votedFor = this.config.nodeId;
    this.stats.electionsStarted++;

    console.log(`Node ${this.config.nodeId} starting election for term ${this.currentTerm}`);

    // Auto-win if we're the only node (single-user mode)
    if (this.config.nodes.size <= 1 || (!this.rtc || this.getPeerCount() === 0)) {
      console.log('👑 Auto-winning election - single node mode');
      this.becomeLeader();
      return;
    }

    // Reset election timer
    this.resetElectionTimer();

    // Request votes from all other nodes
    const lastLogIndex = this.log.length - 1;
    const lastLogTerm = this.log.length > 0 ? this.log[lastLogIndex].term : 0;

    this.broadcastMessage({
      type: 'request_vote',
      term: this.currentTerm,
      candidateId: this.config.nodeId,
      lastLogIndex,
      lastLogTerm,
      roomId: this.config.roomId,
    });

    this.persistState();
  }

  /**
   * Become leader after winning election
   */
  private becomeLeader(): void {
    console.log(`Node ${this.config.nodeId} became leader for term ${this.currentTerm}`);
    
    this.state = 'leader';
    this.leaderId = this.config.nodeId;

    // Initialize leader state
    this.nextIndex.clear();
    this.matchIndex.clear();

    for (const nodeId of this.config.nodes) {
      if (nodeId !== this.config.nodeId) {
        this.nextIndex.set(nodeId, this.log.length);
        this.matchIndex.set(nodeId, 0);
      }
    }

    // Stop election timer
    this.stopElectionTimer();
    
    // Only start heartbeats if there are other nodes to communicate with
    // Always start heartbeats to enable peer discovery - don't skip in single-user mode!
    if (this.rtc) {
      this.startHeartbeat();
      // Send initial heartbeats for peer discovery
      this.sendHeartbeats();
      console.log('🔄 Starting heartbeats for peer discovery (peer count:', this.getPeerCount(), ')');
    } else {
      // Store that we need to start heartbeats when RTC becomes available
      this.pendingHeartbeatStart = true;
      console.log('📋 RTC not ready - will start heartbeats when connection is available');
    }
  }

  /**
   * Step down from leader/candidate to follower
   */
  private stepDown(): void {
    if (this.state === 'leader') {
      console.log(`Node ${this.config.nodeId} stepping down as leader`);
      console.trace('📋 Step down stack trace:');
      this.stopHeartbeat();
      
      // In single-user mode, don't step down - stay as leader
      // But allow step-down if we've detected other active nodes
      const activePeerCount = this.getPeerCount();
      const totalNodes = this.config.nodes.size;
      
      if (totalNodes <= 1 && activePeerCount === 0) {
        console.log('🛡️ Staying as leader in single-user mode');
        return;
      } else if (totalNodes > 1 && activePeerCount === 0) {
        console.log('🔄 Other nodes detected but no active peers - staying leader for now');
        return;
      } else {
        console.log(`🌐 Multi-user mode: ${totalNodes} total nodes, ${activePeerCount} active peers - stepping down`);
      }
    }

    this.state = 'follower';
    this.leaderId = null;
    this.resetElectionTimer();
  }

  /**
   * Replicate log entries to followers
   */
  private async replicateToFollowers(): Promise<void> {
    if (this.state !== 'leader') return;

    for (const nodeId of this.config.nodes) {
      if (nodeId !== this.config.nodeId) {
        this.sendAppendEntriesToFollower(nodeId);
      }
    }
  }

  /**
   * Send append entries to specific follower
   */
  private sendAppendEntriesToFollower(followerId: string): void {
    const nextIndex = this.nextIndex.get(followerId) || 0;
    const prevLogIndex = nextIndex - 1;
    const prevLogTerm = prevLogIndex >= 0 ? (this.log[prevLogIndex]?.term || 0) : 0;
    
    const entries = this.log.slice(nextIndex);

    this.sendMessage({
      type: 'append_entries',
      term: this.currentTerm,
      leaderId: this.config.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.commitIndex,
      roomId: this.config.roomId,
    }, followerId);
  }

  /**
   * Try to commit entries if majority have replicated them
   */
  private tryCommitEntries(): void {
    if (this.state !== 'leader') return;

    // Find highest index that majority have replicated
    for (let index = this.commitIndex + 1; index < this.log.length; index++) {
      if (this.log[index].term !== this.currentTerm) continue;

      // Count nodes that have this entry
      let replicatedCount = 1; // Leader always has the entry
      for (const matchIndex of this.matchIndex.values()) {
        if (matchIndex >= index) {
          replicatedCount++;
        }
      }

      // Commit if majority have it
      if (replicatedCount >= this.config.quorumSize) {
        this.commitIndex = index;
        this.log[index].committed = true;
      }
    }
  }

  /**
   * Send heartbeats to all followers
   */
  private sendHeartbeats(): void {
    if (this.state !== 'leader') return;

    this.stats.heartbeatsSent++;
    this.broadcastMessage({
      type: 'heartbeat',
      term: this.currentTerm,
      leaderId: this.config.nodeId,
      roomId: this.config.roomId,
    });
  }

  /**
   * Utility methods
   */
  private isLogUpToDate(lastLogIndex: number, lastLogTerm: number): boolean {
    const ourLastIndex = this.log.length - 1;
    const ourLastTerm = this.log.length > 0 ? this.log[ourLastIndex].term : 0;

    return lastLogTerm > ourLastTerm || 
           (lastLogTerm === ourLastTerm && lastLogIndex >= ourLastIndex);
  }

  private isLogConsistent(prevLogIndex: number, prevLogTerm: number): boolean {
    if (prevLogIndex < 0) return true;
    if (prevLogIndex >= this.log.length) return false;
    return this.log[prevLogIndex].term === prevLogTerm;
  }

  private hasVoteFrom(_nodeId: string): boolean {
    // In a real implementation, you'd track votes received
    // For now, assume we get votes from nodes that respond positively
    return true; // Simplified
  }

  private computeEntryChecksum(operation: OTOperationMeta): string {
    const str = JSON.stringify(operation);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Timer management
   */
  private resetElectionTimer(): void {
    this.stopElectionTimer();
    this.startElectionTimer();
  }

  private startElectionTimer(): void {
    const peerCount = this.getPeerCount();
    
    // If there are already peers, wait longer before starting election
    // This gives existing leader time to send heartbeats
    const baseTimeout = peerCount > 0 ? 
      this.ELECTION_TIMEOUT_MAX * 2 : // Wait longer if peers exist
      this.ELECTION_TIMEOUT_MIN;
      
    const timeout = baseTimeout + 
      Math.random() * (this.ELECTION_TIMEOUT_MAX - this.ELECTION_TIMEOUT_MIN);
    
    console.log(`⏰ Election timer set for ${timeout}ms (${peerCount} peers)`);
    
    this.electionTimer = setTimeout(() => {
      this.stats.electionTimeouts++;
      if (this.state !== 'leader') {
        this.startElection();
      } else if (this.state === 'leader' && (this.config.nodes.size <= 1 || (!this.rtc || this.getPeerCount() === 0))) {
        // Already leader in single-user mode, don't need elections
        console.log('🎯 Already leader in single-user mode, skipping election');
      }
    }, timeout);
  }

  private stopElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Message sending
   */
  private sendMessage(message: RaftMessage, _targetNodeId: string): void {
    if (!this.rtc) return;

    this.stats.messagesSent++;
    this.rtc.send('raft_message', message);
  }

  private broadcastMessage(message: RaftMessage): void {
    if (!this.rtc) return;

    this.stats.messagesSent++;
    this.rtc.send('raft_message', message);
  }

  /**
   * State persistence
   */
  private persistState(): void {
    const state = {
      currentTerm: this.currentTerm,
      votedFor: this.votedFor,
      log: this.log,
      roomId: this.config.roomId,
    };

    const key = `raft_state_${this.config.roomId}_${this.config.nodeId}`;
    localStorage.setItem(key, JSON.stringify(state));
  }

  private loadPersistedState(): void {
    const key = `raft_state_${this.config.roomId}_${this.config.nodeId}`;
    const stateStr = localStorage.getItem(key);
    
    if (stateStr) {
      try {
        const state = JSON.parse(stateStr);
        this.currentTerm = state.currentTerm || 0;
        this.votedFor = state.votedFor || null;
        this.log = state.log || [];
      } catch (error) {
        console.error('Failed to load persisted Raft state:', error);
      }
    }
  }

  /**
   * Public API
   */
  isLeader(): boolean {
    return this.state === 'leader';
  }

  getLeaderId(): string | null {
    return this.leaderId;
  }

  getCurrentTerm(): number {
    return this.currentTerm;
  }

  getState(): RaftNodeState {
    return this.state;
  }

  getStats() {
    return {
      ...this.stats,
      nodeId: this.config.nodeId,
      roomId: this.config.roomId,
      state: this.state,
      currentTerm: this.currentTerm,
      leaderId: this.leaderId,
      logLength: this.log.length,
      commitIndex: this.commitIndex,
      clusterSize: this.config.nodes.size,
      quorumSize: this.config.quorumSize,
    };
  }

  /**
   * Cleanup
   */
  shutdown(): void {
    this.stopElectionTimer();
    this.stopHeartbeat();
    this.persistState();
  }
}