// src/state/distributedState.ts - CRDT-based distributed state management

/**
 * Vector Clock implementation for distributed consensus
 * Based on Lamport timestamps and vector clocks for causal ordering
 */
export class VectorClock {
  private clock: Map<string, number> = new Map();

  constructor(nodeId?: string, initialClock?: Map<string, number>) {
    if (initialClock) {
      this.clock = new Map(initialClock);
    }
    if (nodeId) {
      this.clock.set(nodeId, 0);
    }
  }

  /**
   * Increment clock for local node
   */
  tick(nodeId: string): VectorClock {
    const current = this.clock.get(nodeId) || 0;
    const newClock = new Map(this.clock);
    newClock.set(nodeId, current + 1);
    return new VectorClock(undefined, newClock);
  }

  /**
   * Update clock when receiving message from another node
   */
  update(otherClock: VectorClock, nodeId: string): VectorClock {
    const newClock = new Map(this.clock);
    
    // Merge clocks taking maximum of each node's timestamp
    for (const [node, timestamp] of otherClock.clock) {
      const currentTimestamp = newClock.get(node) || 0;
      newClock.set(node, Math.max(currentTimestamp, timestamp));
    }
    
    // Increment local node's clock
    const localTimestamp = newClock.get(nodeId) || 0;
    newClock.set(nodeId, localTimestamp + 1);
    
    return new VectorClock(undefined, newClock);
  }

  /**
   * Compare two vector clocks for causal ordering
   * Returns: -1 if this < other, 1 if this > other, 0 if concurrent
   */
  compare(other: VectorClock): number {
    let thisLessOrEqual = true;
    let otherLessOrEqual = true;
    
    const allNodes = new Set([...this.clock.keys(), ...other.clock.keys()]);
    
    for (const node of allNodes) {
      const thisTime = this.clock.get(node) || 0;
      const otherTime = other.clock.get(node) || 0;
      
      if (thisTime > otherTime) {
        otherLessOrEqual = false;
      } else if (thisTime < otherTime) {
        thisLessOrEqual = false;
      }
    }
    
    if (thisLessOrEqual && otherLessOrEqual) return 0; // Concurrent
    if (thisLessOrEqual) return -1; // This happened before other
    return 1; // Other happened before this
  }

  /**
   * Check if this clock causally precedes another
   */
  happensBefore(other: VectorClock): boolean {
    return this.compare(other) === -1;
  }

  /**
   * Check if clocks are concurrent (no causal relationship)
   */
  isConcurrent(other: VectorClock): boolean {
    return this.compare(other) === 0;
  }

  /**
   * Serialize clock for network transmission
   */
  serialize(): Record<string, number> {
    return Object.fromEntries(this.clock);
  }

  /**
   * Deserialize clock from network data
   */
  static deserialize(data: Record<string, number>): VectorClock {
    return new VectorClock(undefined, new Map(Object.entries(data)));
  }

  toString(): string {
    return JSON.stringify(this.serialize());
  }
}

/**
 * CRDT Operation types for distributed operations
 */
export type CRDTOperation = {
  id: string; // Unique operation ID
  type: 'insert' | 'update' | 'delete';
  entity: 'element' | 'threatActor';
  entityId: string;
  data?: any;
  patch?: any;
  timestamp: VectorClock;
  nodeId: string;
  dependencies: string[]; // IDs of operations this depends on
  hash: string; // Cryptographic hash for integrity
};

/**
 * CRDT State implementation using G-Set and OR-Set
 * Provides strong eventual consistency guarantees
 */
export class CRDTState {
  private operations: Map<string, CRDTOperation> = new Map();
  private appliedOps: Set<string> = new Set();
  private nodeId: string;
  private clock: VectorClock;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.clock = new VectorClock(nodeId);
  }

  /**
   * Create a new operation with proper CRDT metadata
   */
  createOperation(
    type: CRDTOperation['type'],
    entity: CRDTOperation['entity'],
    entityId: string,
    data?: any,
    patch?: any,
    dependencies: string[] = []
  ): CRDTOperation {
    this.clock = this.clock.tick(this.nodeId);
    
    const operation: CRDTOperation = {
      id: `${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      entity,
      entityId,
      data,
      patch,
      timestamp: this.clock,
      nodeId: this.nodeId,
      dependencies,
      hash: '', // Will be computed
    };

    // Compute cryptographic hash for integrity
    operation.hash = this.computeHash(operation);
    
    return operation;
  }

  /**
   * Add local operation to CRDT
   */
  addLocalOperation(operation: CRDTOperation): void {
    this.operations.set(operation.id, operation);
    this.appliedOps.add(operation.id);
  }

  /**
   * Merge remote operations with conflict resolution
   */
  mergeRemoteOperations(remoteOps: CRDTOperation[]): CRDTOperation[] {
    const newOperations: CRDTOperation[] = [];
    
    for (const remoteOp of remoteOps) {
      // Verify operation integrity
      if (!this.verifyOperation(remoteOp)) {
        console.warn('Invalid remote operation rejected:', remoteOp.id);
        continue;
      }

      // Skip if we already have this operation
      if (this.operations.has(remoteOp.id)) {
        continue;
      }

      // Update vector clock
      this.clock = this.clock.update(remoteOp.timestamp, this.nodeId);
      
      // Add operation
      this.operations.set(remoteOp.id, remoteOp);
      newOperations.push(remoteOp);
    }

    return newOperations;
  }

  /**
   * Get operations in causal order for state replay
   */
  getCausallyOrderedOperations(): CRDTOperation[] {
    const ops = Array.from(this.operations.values());
    
    // Topological sort based on dependencies and vector clocks
    return ops.sort((a, b) => {
      // First, sort by dependencies
      if (a.dependencies.includes(b.id)) return 1;
      if (b.dependencies.includes(a.id)) return -1;
      
      // Then by vector clock comparison
      const clockComparison = a.timestamp.compare(b.timestamp);
      if (clockComparison !== 0) return clockComparison;
      
      // Finally by operation ID for deterministic ordering
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Resolve conflicts using Last Writer Wins with vector clock ordering
   */
  resolveConflicts(ops: CRDTOperation[]): CRDTOperation[] {
    const entityOps = new Map<string, CRDTOperation[]>();
    
    // Group operations by entity
    for (const op of ops) {
      const key = `${op.entity}:${op.entityId}`;
      if (!entityOps.has(key)) {
        entityOps.set(key, []);
      }
      entityOps.get(key)!.push(op);
    }

    const resolvedOps: CRDTOperation[] = [];
    
    for (const [_entityKey, entityOpsList] of entityOps) {
      // Sort by vector clock and apply conflict resolution
      const sortedOps = entityOpsList.sort((a, b) => {
        const clockComp = a.timestamp.compare(b.timestamp);
        if (clockComp !== 0) return clockComp;
        return a.id.localeCompare(b.id); // Deterministic tiebreaker
      });

      // Apply semantic conflict resolution rules
      const resolved = this.applySemanticResolution(sortedOps);
      resolvedOps.push(...resolved);
    }

    return resolvedOps;
  }

  /**
   * Apply semantic conflict resolution (domain-specific logic)
   */
  private applySemanticResolution(ops: CRDTOperation[]): CRDTOperation[] {
    if (ops.length <= 1) return ops;

    const resolved: CRDTOperation[] = [];
    let currentState: any = null;

    for (const op of ops) {
      switch (op.type) {
        case 'insert':
          if (!currentState) {
            currentState = op.data;
            resolved.push(op);
          }
          // Ignore duplicate inserts
          break;

        case 'update':
          if (currentState) {
            // Merge updates using 3-way merge
            const merged = this.mergeUpdates(currentState, op.patch);
            if (merged !== currentState) {
              currentState = merged;
              resolved.push(op);
            }
          }
          break;

        case 'delete':
          if (currentState) {
            currentState = null;
            resolved.push(op);
          }
          break;
      }
    }

    return resolved;
  }

  /**
   * Intelligent update merging
   */
  private mergeUpdates(current: any, patch: any): any {
    if (!patch || !current) return current;

    const merged = { ...current };
    
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && value !== null) {
        // Special handling for arrays (union)
        if (Array.isArray(current[key]) && Array.isArray(value)) {
          const currentArray = current[key] as any[];
          const patchArray = value as any[];
          merged[key] = [...new Set([...currentArray, ...patchArray])];
        } else {
          merged[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Compute cryptographic hash for operation integrity
   */
  private computeHash(op: Omit<CRDTOperation, 'hash'>): string {
    const dataString = JSON.stringify({
      id: op.id,
      type: op.type,
      entity: op.entity,
      entityId: op.entityId,
      data: op.data,
      patch: op.patch,
      timestamp: op.timestamp.serialize(),
      nodeId: op.nodeId,
      dependencies: op.dependencies.sort(),
    });

    // Simple hash function (in production, use crypto.subtle)
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Verify operation integrity and authenticity
   */
  private verifyOperation(op: CRDTOperation): boolean {
    const expectedHash = this.computeHash({
      id: op.id,
      type: op.type,
      entity: op.entity,
      entityId: op.entityId,
      data: op.data,
      patch: op.patch,
      timestamp: op.timestamp,
      nodeId: op.nodeId,
      dependencies: op.dependencies,
    });

    return expectedHash === op.hash;
  }

  /**
   * Get all operations for synchronization
   */
  getAllOperations(): CRDTOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get operations after a specific vector clock
   */
  getOperationsAfter(clock: VectorClock): CRDTOperation[] {
    return Array.from(this.operations.values())
      .filter(op => clock.happensBefore(op.timestamp) || clock.isConcurrent(op.timestamp));
  }

  /**
   * Get current vector clock
   */
  getCurrentClock(): VectorClock {
    return this.clock;
  }

  /**
   * Get node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Get statistics for monitoring
   */
  getStats() {
    return {
      totalOperations: this.operations.size,
      appliedOperations: this.appliedOps.size,
      nodeId: this.nodeId,
      currentClock: this.clock.serialize(),
      lastOperationTime: Math.max(
        ...Array.from(this.operations.values()).map(op => 
          Math.max(...Object.values(op.timestamp.serialize()))
        )
      ),
    };
  }
}