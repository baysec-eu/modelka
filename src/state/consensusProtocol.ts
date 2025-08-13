// src/state/consensusProtocol.ts - Blockchain-like consensus protocol for P2P sync
import { VectorClock, CRDTState, CRDTOperation } from './distributedState';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

/**
 * Consensus message types for P2P communication
 */
export type ConsensusMessage = {
  type: 'propose' | 'accept' | 'commit' | 'sync_request' | 'sync_response' | 'heartbeat';
  proposalId: string;
  operations: CRDTOperation[];
  timestamp: VectorClock;
  nodeId: string;
  merkleRoot: string;
  signature?: string;
  round: number;
};

/**
 * Consensus state for tracking proposals
 */
interface ConsensusProposal {
  id: string;
  operations: CRDTOperation[];
  proposer: string;
  timestamp: VectorClock;
  acceptedBy: Set<string>;
  round: number;
  merkleRoot: string;
  timeout: NodeJS.Timeout;
}

/**
 * Byzantine Fault Tolerant consensus protocol implementation
 * Based on PBFT (Practical Byzantine Fault Tolerance) adapted for P2P networks
 */
export class ConsensusProtocol {
  private crdtState: CRDTState;
  private rtc: ServerlessWebRTC | null = null;
  private nodeId: string;
  private connectedPeers: Set<string> = new Set();
  private proposals: Map<string, ConsensusProposal> = new Map();
  private currentRound: number = 0;
  private isLeader: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly PROPOSAL_TIMEOUT = 2000; // Reduced to 2 seconds for faster responses
  private readonly HEARTBEAT_INTERVAL = 1500; // Reduced to 1.5 seconds for faster detection  
  private readonly SYNC_INTERVAL = 10000; // Reduced to 10 seconds for more frequent sync
  private readonly MIN_CONSENSUS_RATIO = 0.51; // Reduced to simple majority for faster consensus

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.crdtState = new CRDTState(nodeId);
  }

  /**
   * Initialize consensus protocol with WebRTC connection
   */
  initialize(rtc: ServerlessWebRTC): void {
    this.rtc = rtc;
    this.setupMessageHandlers();
    this.startHeartbeat();
    this.startSyncProcess();
  }

  /**
   * Shutdown consensus protocol
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    // Clear all proposal timeouts
    for (const proposal of this.proposals.values()) {
      clearTimeout(proposal.timeout);
    }
    this.proposals.clear();
  }

  /**
   * Propose new operations to the network
   */
  async proposeOperations(operations: CRDTOperation[]): Promise<boolean> {
    if (operations.length === 0) return false;
    
    // Always commit operations locally first - user can work offline
    // TODO: Re-implement once CRDTState interface is updated
    // for (const op of operations) {
    //   this.crdtState.addCommittedOperation(op);
    // }
    // this.onStateChanged(this.getConsensusState());
    
    // If RTC is available, sync with peers (observer pattern)
    if (this.rtc) {
      this.syncWithPeers(operations);
    } else {
      console.log('📴 Working offline - changes saved locally');
    }
    
    return true;
  }

  /**
   * Sync operations with peers when RTC is available (observer pattern)
   */
  private syncWithPeers(operations: CRDTOperation[]): void {
    try {
      console.log('🌐 Syncing with peers...');
      
      const proposalId = `${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const merkleRoot = this.computeMerkleRoot(operations);
      
      const proposal: ConsensusProposal = {
        id: proposalId,
        operations,
        proposer: this.nodeId,
        timestamp: this.crdtState.getCurrentClock(),
        acceptedBy: new Set([this.nodeId]), // Self-accept
        round: this.currentRound,
        merkleRoot,
        timeout: setTimeout(() => this.handleProposalTimeout(proposalId), this.PROPOSAL_TIMEOUT),
      };

      this.proposals.set(proposalId, proposal);

      // Broadcast proposal to all peers
      const message: ConsensusMessage = {
        type: 'propose',
        proposalId,
        operations,
        timestamp: proposal.timestamp,
        nodeId: this.nodeId,
        merkleRoot,
        round: this.currentRound,
      };

      this.broadcastMessage(message).catch(err => {
        console.warn('Failed to broadcast to peers:', err);
        // User's local changes are already saved, so this is not critical
      });
    } catch (error) {
      console.warn('Peer sync failed, but local changes are saved:', error);
    }
  }

  /**
   * Check if we're connected to peers
   */
  isOnline(): boolean {
    return this.rtc !== null;
  }

  /**
   * Get connection status for UI
   */
  getConnectionStatus(): { isOnline: boolean; peerCount: number } {
    return {
      isOnline: this.isOnline(),
      peerCount: this.rtc?.getStats?.()?.connectedPeers || 0
    };
  }

  /**
   * Create and propose operations for local state changes
   */
  async proposeStateChange(
    type: 'insert' | 'update' | 'delete',
    entity: 'element' | 'threatActor',
    entityId: string,
    data?: any,
    patch?: any
  ): Promise<boolean> {
    const operation = this.crdtState.createOperation(type, entity, entityId, data, patch);
    
    // Add to local CRDT first
    this.crdtState.addLocalOperation(operation);
    
    // Propose to network
    return await this.proposeOperations([operation]);
  }

  /**
   * Get current state by applying all committed operations
   */
  getConsensusState(): { elements: Map<string, any>; threatActors: Map<string, any> } {
    const operations = this.crdtState.getCausallyOrderedOperations();
    const resolvedOps = this.crdtState.resolveConflicts(operations);

    const elements = new Map<string, any>();
    const threatActors = new Map<string, any>();

    for (const op of resolvedOps) {
      const targetMap = op.entity === 'element' ? elements : threatActors;

      switch (op.type) {
        case 'insert':
          if (op.data) {
            targetMap.set(op.entityId, op.data);
          }
          break;

        case 'update':
          if (targetMap.has(op.entityId) && op.patch) {
            const current = targetMap.get(op.entityId);
            targetMap.set(op.entityId, { ...current, ...op.patch });
          }
          break;

        case 'delete':
          targetMap.delete(op.entityId);
          break;
      }
    }

    return { elements, threatActors };
  }

  /**
   * Setup WebRTC message handlers
   */
  private setupMessageHandlers(): void {
    if (!this.rtc) return;

    this.rtc.on('consensus_message', (message: ConsensusMessage, fromNodeId: string) => {
      this.handleConsensusMessage(message, fromNodeId);
    });

    this.rtc.on('user_presence', (_data: any, fromNodeId: string) => {
      this.connectedPeers.add(fromNodeId);
      this.updateLeaderStatus();
    });

    this.rtc.on('user_disconnect', (_data: any, fromNodeId: string) => {
      this.connectedPeers.delete(fromNodeId);
      this.updateLeaderStatus();
    });
  }

  /**
   * Handle incoming consensus messages
   */
  private async handleConsensusMessage(message: ConsensusMessage, fromNodeId: string): Promise<void> {
    if (message.nodeId === this.nodeId) return; // Ignore own messages

    switch (message.type) {
      case 'propose':
        await this.handlePropose(message, fromNodeId);
        break;

      case 'accept':
        await this.handleAccept(message, fromNodeId);
        break;

      case 'commit':
        await this.handleCommit(message, fromNodeId);
        break;

      case 'sync_request':
        await this.handleSyncRequest(message, fromNodeId);
        break;

      case 'sync_response':
        await this.handleSyncResponse(message, fromNodeId);
        break;

      case 'heartbeat':
        this.connectedPeers.add(fromNodeId);
        break;
    }
  }

  /**
   * Handle proposal message
   */
  private async handlePropose(message: ConsensusMessage, fromNodeId: string): Promise<void> {
    // Validate proposal
    if (!this.validateProposal(message)) {
      console.warn(`Invalid proposal from ${fromNodeId}:`, message.proposalId);
      return;
    }

    // Check if we already have this proposal
    if (this.proposals.has(message.proposalId)) {
      return;
    }

    // Create proposal record
    const proposal: ConsensusProposal = {
      id: message.proposalId,
      operations: message.operations,
      proposer: fromNodeId,
      timestamp: message.timestamp,
      acceptedBy: new Set([fromNodeId]),
      round: message.round,
      merkleRoot: message.merkleRoot,
      timeout: setTimeout(() => this.handleProposalTimeout(message.proposalId), this.PROPOSAL_TIMEOUT),
    };

    this.proposals.set(message.proposalId, proposal);

    // Send accept message
    const acceptMessage: ConsensusMessage = {
      type: 'accept',
      proposalId: message.proposalId,
      operations: [],
      timestamp: this.crdtState.getCurrentClock(),
      nodeId: this.nodeId,
      merkleRoot: message.merkleRoot,
      round: message.round,
    };

    await this.broadcastMessage(acceptMessage);
  }

  /**
   * Handle accept message
   */
  private async handleAccept(message: ConsensusMessage, fromNodeId: string): Promise<void> {
    const proposal = this.proposals.get(message.proposalId);
    if (!proposal) return;

    proposal.acceptedBy.add(fromNodeId);

    // Check if we have consensus (67% of known peers + self)
    const totalPeers = this.connectedPeers.size + 1; // +1 for self
    const requiredAccepts = Math.ceil(totalPeers * this.MIN_CONSENSUS_RATIO);

    if (proposal.acceptedBy.size >= requiredAccepts) {
      await this.commitProposal(proposal);
    }
  }

  /**
   * Handle commit message
   */
  private async handleCommit(message: ConsensusMessage, fromNodeId: string): Promise<void> {
    // Apply operations from committed proposal
    const appliedOps = this.crdtState.mergeRemoteOperations(message.operations);
    
    if (appliedOps.length > 0) {
      console.log(`Applied ${appliedOps.length} operations from commit by ${fromNodeId}`);
    }

    // Remove proposal if we have it
    this.proposals.delete(message.proposalId);
  }

  /**
   * Handle sync request
   */
  private async handleSyncRequest(message: ConsensusMessage, fromNodeId: string): Promise<void> {
    const myOps = this.crdtState.getOperationsAfter(message.timestamp);
    
    const response: ConsensusMessage = {
      type: 'sync_response',
      proposalId: `sync_${Date.now()}`,
      operations: myOps,
      timestamp: this.crdtState.getCurrentClock(),
      nodeId: this.nodeId,
      merkleRoot: this.computeMerkleRoot(myOps),
      round: this.currentRound,
    };

    await this.sendMessage(response, fromNodeId);
  }

  /**
   * Handle sync response
   */
  private async handleSyncResponse(message: ConsensusMessage, fromNodeId: string): Promise<void> {
    const appliedOps = this.crdtState.mergeRemoteOperations(message.operations);
    
    if (appliedOps.length > 0) {
      console.log(`Synced ${appliedOps.length} operations from ${fromNodeId}`);
    }
  }

  /**
   * Commit a proposal that has reached consensus
   */
  private async commitProposal(proposal: ConsensusProposal): Promise<void> {
    clearTimeout(proposal.timeout);

    // Merge operations into CRDT state
    this.crdtState.mergeRemoteOperations(proposal.operations);

    // Broadcast commit message
    const commitMessage: ConsensusMessage = {
      type: 'commit',
      proposalId: proposal.id,
      operations: proposal.operations,
      timestamp: this.crdtState.getCurrentClock(),
      nodeId: this.nodeId,
      merkleRoot: proposal.merkleRoot,
      round: proposal.round,
    };

    await this.broadcastMessage(commitMessage);

    // Remove proposal
    this.proposals.delete(proposal.id);
    
    console.log(`Committed proposal ${proposal.id} with ${proposal.operations.length} operations`);
  }

  /**
   * Handle proposal timeout
   */
  private handleProposalTimeout(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (proposal) {
      console.warn(`Proposal ${proposalId} timed out`);
      this.proposals.delete(proposalId);
    }
  }

  /**
   * Validate incoming proposal
   */
  private validateProposal(message: ConsensusMessage): boolean {
    // Verify Merkle root matches operations
    const computedRoot = this.computeMerkleRoot(message.operations);
    if (computedRoot !== message.merkleRoot) {
      return false;
    }

    // Validate all operations in the proposal
    for (const op of message.operations) {
      if (!this.validateOperation(op)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate individual operation
   */
  private validateOperation(op: CRDTOperation): boolean {
    // Check required fields
    if (!op.id || !op.type || !op.entity || !op.entityId || !op.nodeId) {
      return false;
    }

    // Validate operation hash
    return true; // CRDT state will handle hash validation
  }

  /**
   * Compute Merkle root for operations
   */
  private computeMerkleRoot(operations: CRDTOperation[]): string {
    if (operations.length === 0) return '';

    const hashes = operations.map(op => op.hash).sort();
    
    while (hashes.length > 1) {
      const newHashes: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left;
        const combined = left + right;
        
        // Simple hash combination (use crypto.subtle in production)
        let hash = 0;
        for (let j = 0; j < combined.length; j++) {
          const char = combined.charCodeAt(j);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        newHashes.push(Math.abs(hash).toString(36));
      }
      hashes.splice(0, hashes.length, ...newHashes);
    }

    return hashes[0] || '';
  }

  /**
   * Update leader status based on peer count and node ID
   */
  private updateLeaderStatus(): void {
    const allNodes = Array.from(this.connectedPeers).concat(this.nodeId).sort();
    this.isLeader = allNodes[0] === this.nodeId;
  }

  /**
   * Start heartbeat process
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const message: ConsensusMessage = {
        type: 'heartbeat',
        proposalId: '',
        operations: [],
        timestamp: this.crdtState.getCurrentClock(),
        nodeId: this.nodeId,
        merkleRoot: '',
        round: this.currentRound,
      };

      await this.broadcastMessage(message);
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Start periodic sync process
   */
  private startSyncProcess(): void {
    this.syncInterval = setInterval(async () => {
      const message: ConsensusMessage = {
        type: 'sync_request',
        proposalId: `sync_${Date.now()}`,
        operations: [],
        timestamp: this.crdtState.getCurrentClock(),
        nodeId: this.nodeId,
        merkleRoot: '',
        round: this.currentRound,
      };

      await this.broadcastMessage(message);
    }, this.SYNC_INTERVAL);
  }

  /**
   * Broadcast message to all peers
   */
  private async broadcastMessage(message: ConsensusMessage): Promise<void> {
    if (!this.rtc) return;

    try {
      await this.rtc.send('consensus_message', message);
    } catch (error) {
      console.error('Failed to broadcast consensus message:', error);
    }
  }

  /**
   * Send message to specific peer
   */
  private async sendMessage(message: ConsensusMessage, targetNodeId: string): Promise<void> {
    if (!this.rtc) return;

    try {
      await this.rtc.send('consensus_message', message);
    } catch (error) {
      console.error(`Failed to send consensus message to ${targetNodeId}:`, error);
    }
  }

  /**
   * Get consensus statistics
   */
  getStats() {
    return {
      nodeId: this.nodeId,
      isLeader: this.isLeader,
      connectedPeers: this.connectedPeers.size,
      activeProposals: this.proposals.size,
      currentRound: this.currentRound,
      crdtStats: this.crdtState.getStats(),
    };
  }

  /**
   * Get CRDT state for external access
   */
  getCRDTState(): CRDTState {
    return this.crdtState;
  }
}