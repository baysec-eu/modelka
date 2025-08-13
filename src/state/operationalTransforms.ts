// src/state/operationalTransforms.ts - Google Docs style Operational Transforms
import { DiagramElement, ThreatActor } from '../types/diagram';

/**
 * Operation types for Operational Transforms
 * More granular than simple CRDT operations
 */
export type OTOperation = 
  // Element operations
  | { type: 'insert_element'; elementId: string; element: DiagramElement; position: number }
  | { type: 'delete_element'; elementId: string; element: DiagramElement; position: number }
  | { type: 'move_element'; elementId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number } }
  | { type: 'resize_element'; elementId: string; oldSize: { width: number; height: number }; newSize: { width: number; height: number } }
  | { type: 'update_element_property'; elementId: string; property: string; oldValue: any; newValue: any }
  | { type: 'update_element_threats'; elementId: string; oldThreats: any[]; newThreats: any[] }
  
  // ThreatActor operations  
  | { type: 'insert_threat_actor'; actorId: string; actor: ThreatActor; position: number }
  | { type: 'delete_threat_actor'; actorId: string; actor: ThreatActor; position: number }
  | { type: 'update_threat_actor'; actorId: string; property: string; oldValue: any; newValue: any }
  
  // Connection operations
  | { type: 'create_connection'; elementId: string; sourceId: string; targetId: string; connectionData: any }
  | { type: 'delete_connection'; elementId: string; sourceId: string; targetId: string; connectionData: any }
  | { type: 'update_connection'; elementId: string; property: string; oldValue: any; newValue: any };

/**
 * Operation metadata for conflict resolution
 */
export interface OTOperationMeta {
  id: string; // Unique operation ID
  operation: OTOperation;
  timestamp: number;
  authorId: string;
  sessionId: string;
  roomId: string;
  vectorClock: Record<string, number>; // Causal ordering
  dependencies: string[]; // Operations this depends on
  transformedAgainst: string[]; // Operations this was transformed against
  checksum: string; // Integrity verification
}

/**
 * Transform result with metadata
 */
interface TransformResult {
  op1: OTOperationMeta; // Transformed operation 1
  op2: OTOperationMeta; // Transformed operation 2  
  conflictResolved: boolean;
  transformationType: 'none' | 'position' | 'merge' | 'priority' | 'semantic';
}

/**
 * Operational Transform Engine
 * Implements sophisticated conflict resolution for real-time collaboration
 */
export class OperationalTransformEngine {
  private pendingOperations: Map<string, OTOperationMeta> = new Map();
  private appliedOperations: Map<string, OTOperationMeta> = new Map();
  private transformationLog: TransformResult[] = [];
  private authorPriorities: Map<string, number> = new Map(); // For conflict resolution

  /**
   * Create operation with metadata
   */
  createOperation(
    operation: OTOperation,
    authorId: string,
    sessionId: string,
    roomId: string,
    vectorClock: Record<string, number>,
    dependencies: string[] = []
  ): OTOperationMeta {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    
    const opMeta: OTOperationMeta = {
      id,
      operation,
      timestamp: Date.now(),
      authorId,
      sessionId,
      roomId,
      vectorClock,
      dependencies,
      transformedAgainst: [],
      checksum: this.computeOperationChecksum(operation),
    };

    return opMeta;
  }

  /**
   * Transform two concurrent operations
   * This is the core of Operational Transforms
   */
  transform(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    // Check if operations are concurrent (no causal relationship)
    if (!this.areConcurrent(op1, op2)) {
      return {
        op1,
        op2,
        conflictResolved: false,
        transformationType: 'none'
      };
    }

    // Apply type-specific transformations
    const result = this.transformByType(op1, op2);
    
    // Log transformation for debugging/audit
    this.transformationLog.push(result);
    
    return result;
  }

  /**
   * Type-specific transformation logic
   */
  private transformByType(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    const t1 = op1.operation.type;
    const t2 = op2.operation.type;

    // Same element operations - requires careful handling
    if (this.operateOnSameElement(op1.operation, op2.operation)) {
      return this.transformSameElementOperations(op1, op2);
    }

    // Position-based transformations (for spatial operations)
    if (this.arePositionConflicting(op1.operation, op2.operation)) {
      return this.transformPositionConflicts(op1, op2);
    }

    // Connection operations
    if (t1.includes('connection') && t2.includes('connection')) {
      return this.transformConnectionOperations(op1, op2);
    }

    // Default: operations are independent
    return {
      op1,
      op2,
      conflictResolved: false,
      transformationType: 'none'
    };
  }

  /**
   * Transform operations on the same element
   */
  private transformSameElementOperations(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    
    // Delete vs Update conflict - delete wins
    if (op1.operation.type === 'delete_element' && this.isUpdateOperation(op2.operation)) {
      return {
        op1,
        op2: this.createNoOpOperation(op2), // Convert update to no-op
        conflictResolved: true,
        transformationType: 'priority'
      };
    }
    if (op2.operation.type === 'delete_element' && this.isUpdateOperation(op1.operation)) {
      return {
        op1: this.createNoOpOperation(op1), // Convert update to no-op
        op2,
        conflictResolved: true,
        transformationType: 'priority'
      };
    }

    // Two moves on same element - use 3-way merge
    if (op1.operation.type === 'move_element' && op2.operation.type === 'move_element') {
      return this.transformConcurrentMoves(op1, op2);
    }

    // Two property updates on same element
    if (op1.operation.type === 'update_element_property' && op2.operation.type === 'update_element_property') {
      return this.transformPropertyUpdates(op1, op2);
    }

    // Two resize operations
    if (op1.operation.type === 'resize_element' && op2.operation.type === 'resize_element') {
      return this.transformConcurrentResize(op1, op2);
    }

    // Default: apply both with author priority
    return this.applyAuthorPriority(op1, op2);
  }

  /**
   * Transform concurrent move operations using intelligent merging
   */
  private transformConcurrentMoves(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    const move1 = op1.operation as Extract<OTOperation, { type: 'move_element' }>;
    const move2 = op2.operation as Extract<OTOperation, { type: 'move_element' }>;

    // Calculate the combined movement vector
    const vector1 = {
      x: move1.newPos.x - move1.oldPos.x,
      y: move1.newPos.y - move1.oldPos.y
    };
    const vector2 = {
      x: move2.newPos.x - move2.oldPos.x,  
      y: move2.newPos.y - move2.oldPos.y
    };

    // Merge vectors with weighted average based on timestamps
    const weight1 = 1 / (op1.timestamp + 1);
    const weight2 = 1 / (op2.timestamp + 1);
    const totalWeight = weight1 + weight2;

    const mergedVector = {
      x: (vector1.x * weight1 + vector2.x * weight2) / totalWeight,
      y: (vector1.y * weight1 + vector2.y * weight2) / totalWeight
    };

    // Create new merged operation
    const mergedPosition = {
      x: move1.oldPos.x + mergedVector.x,
      y: move1.oldPos.y + mergedVector.y
    };

    const transformedOp1: OTOperationMeta = {
      ...op1,
      operation: {
        ...move1,
        newPos: mergedPosition
      },
      transformedAgainst: [...op1.transformedAgainst, op2.id]
    };

    const transformedOp2: OTOperationMeta = {
      ...op2,
      operation: {
        ...move2,
        oldPos: mergedPosition, // Adjust starting position
        newPos: mergedPosition
      },
      transformedAgainst: [...op2.transformedAgainst, op1.id]
    };

    return {
      op1: transformedOp1,
      op2: transformedOp2,
      conflictResolved: true,
      transformationType: 'merge'
    };
  }

  /**
   * Transform property updates with semantic merging
   */
  private transformPropertyUpdates(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    const prop1 = op1.operation as Extract<OTOperation, { type: 'update_element_property' }>;
    const prop2 = op2.operation as Extract<OTOperation, { type: 'update_element_property' }>;

    // Same property - use 3-way merge or last-writer-wins
    if (prop1.property === prop2.property) {
      // For simple values, use timestamp-based resolution
      const winner = op1.timestamp > op2.timestamp ? op1 : op2;

      return {
        op1: winner === op1 ? op1 : this.createNoOpOperation(op1),
        op2: winner === op2 ? op2 : this.createNoOpOperation(op2),
        conflictResolved: true,
        transformationType: 'priority'
      };
    }

    // Different properties - both can be applied
    return {
      op1,
      op2,
      conflictResolved: false,
      transformationType: 'none'
    };
  }

  /**
   * Transform concurrent resize operations
   */
  private transformConcurrentResize(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    const resize1 = op1.operation as Extract<OTOperation, { type: 'resize_element' }>;
    const resize2 = op2.operation as Extract<OTOperation, { type: 'resize_element' }>;

    // Merge resize operations by taking maximum dimensions
    const mergedSize = {
      width: Math.max(resize1.newSize.width, resize2.newSize.width),
      height: Math.max(resize1.newSize.height, resize2.newSize.height)
    };

    const transformedOp1: OTOperationMeta = {
      ...op1,
      operation: {
        ...resize1,
        newSize: mergedSize
      },
      transformedAgainst: [...op1.transformedAgainst, op2.id]
    };

    return {
      op1: transformedOp1,
      op2: this.createNoOpOperation(op2),
      conflictResolved: true,
      transformationType: 'merge'
    };
  }

  /**
   * Transform position-conflicting operations
   */
  private transformPositionConflicts(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    // Handle spatial conflicts (e.g., two elements moved to same position)
    const pos1 = this.getOperationPosition(op1.operation);
    const pos2 = this.getOperationPosition(op2.operation);

    if (pos1 && pos2 && this.positionsOverlap(pos1, pos2)) {
      // Offset second operation to avoid overlap
      const offset = { x: 20, y: 20 }; // Standard offset
      const adjustedPos = { x: pos2.x + offset.x, y: pos2.y + offset.y };

      const transformedOp2: OTOperationMeta = {
        ...op2,
        operation: this.updateOperationPosition(op2.operation, adjustedPos),
        transformedAgainst: [...op2.transformedAgainst, op1.id]
      };

      return {
        op1,
        op2: transformedOp2,
        conflictResolved: true,
        transformationType: 'position'
      };
    }

    return { op1, op2, conflictResolved: false, transformationType: 'none' };
  }

  /**
   * Transform connection operations
   */
  private transformConnectionOperations(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    // Handle connection conflicts (e.g., duplicate connections)
    if (op1.operation.type === 'create_connection' && op2.operation.type === 'create_connection') {
      const conn1 = op1.operation as Extract<OTOperation, { type: 'create_connection' }>;
      const conn2 = op2.operation as Extract<OTOperation, { type: 'create_connection' }>;

      // Same connection - keep first one
      if (conn1.sourceId === conn2.sourceId && conn1.targetId === conn2.targetId) {
        const winner = op1.timestamp < op2.timestamp ? op1 : op2;
  
        return {
          op1: winner === op1 ? op1 : this.createNoOpOperation(op1),
          op2: winner === op2 ? op2 : this.createNoOpOperation(op2),
          conflictResolved: true,
          transformationType: 'priority'
        };
      }
    }

    return { op1, op2, conflictResolved: false, transformationType: 'none' };
  }

  /**
   * Apply author priority for conflict resolution
   */
  private applyAuthorPriority(op1: OTOperationMeta, op2: OTOperationMeta): TransformResult {
    const priority1 = this.authorPriorities.get(op1.authorId) || 0;
    const priority2 = this.authorPriorities.get(op2.authorId) || 0;

    if (priority1 === priority2) {
      // Use timestamp as tiebreaker
      const winner = op1.timestamp < op2.timestamp ? op1 : op2;

      return {
        op1: winner === op1 ? op1 : this.createNoOpOperation(op1),
        op2: winner === op2 ? op2 : this.createNoOpOperation(op2),
        conflictResolved: true,
        transformationType: 'priority'
      };
    }

    const winner = priority1 > priority2 ? op1 : op2;
    return {
      op1: winner === op1 ? op1 : this.createNoOpOperation(op1),
      op2: winner === op2 ? op2 : this.createNoOpOperation(op2),
      conflictResolved: true,
      transformationType: 'priority'
    };
  }

  /**
   * Helper functions
   */
  private areConcurrent(op1: OTOperationMeta, op2: OTOperationMeta): boolean {
    // Check vector clocks for causality
    const clock1 = op1.vectorClock;
    const clock2 = op2.vectorClock;

    let op1HappensBefore = true;
    let op2HappensBefore = true;

    const allAuthors = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);

    for (const author of allAuthors) {
      const time1 = clock1[author] || 0;
      const time2 = clock2[author] || 0;

      if (time1 > time2) op2HappensBefore = false;
      if (time2 > time1) op1HappensBefore = false;
    }

    // Concurrent if neither happens before the other
    return !op1HappensBefore && !op2HappensBefore;
  }

  private operateOnSameElement(op1: OTOperation, op2: OTOperation): boolean {
    const id1 = this.getElementId(op1);
    const id2 = this.getElementId(op2);
    return id1 === id2 && id1 !== null;
  }

  private getElementId(op: OTOperation): string | null {
    if ('elementId' in op) return op.elementId;
    if ('actorId' in op) return op.actorId;
    return null;
  }

  private isUpdateOperation(op: OTOperation): boolean {
    return ['move_element', 'resize_element', 'update_element_property', 'update_element_threats'].includes(op.type);
  }

  private createNoOpOperation(op: OTOperationMeta): OTOperationMeta {
    return {
      ...op,
      operation: { type: 'no_op' } as any,
      transformedAgainst: [...op.transformedAgainst, 'no_op']
    };
  }

  private getOperationPosition(op: OTOperation): { x: number; y: number } | null {
    if (op.type === 'move_element') return op.newPos;
    if (op.type === 'insert_element') return op.element.position;
    return null;
  }

  private positionsOverlap(pos1: { x: number; y: number }, pos2: { x: number; y: number }): boolean {
    const threshold = 10; // Minimum distance between elements
    const distance = Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
    return distance < threshold;
  }

  private updateOperationPosition(op: OTOperation, newPos: { x: number; y: number }): OTOperation {
    if (op.type === 'move_element') {
      return { ...op, newPos };
    }
    if (op.type === 'insert_element') {
      return { ...op, element: { ...op.element, position: newPos } };
    }
    return op;
  }

  private arePositionConflicting(op1: OTOperation, op2: OTOperation): boolean {
    const pos1 = this.getOperationPosition(op1);
    const pos2 = this.getOperationPosition(op2);
    return !!(pos1 && pos2 && this.positionsOverlap(pos1, pos2));
  }

  private computeOperationChecksum(op: OTOperation): string {
    const str = JSON.stringify(op);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Set author priorities for conflict resolution
   */
  setAuthorPriority(authorId: string, priority: number): void {
    this.authorPriorities.set(authorId, priority);
  }

  /**
   * Get transformation statistics
   */
  getStats() {
    const conflictTypes = new Map<string, number>();
    this.transformationLog.forEach(result => {
      const count = conflictTypes.get(result.transformationType) || 0;
      conflictTypes.set(result.transformationType, count + 1);
    });

    return {
      totalTransformations: this.transformationLog.length,
      conflictsResolved: this.transformationLog.filter(r => r.conflictResolved).length,
      transformationTypes: Object.fromEntries(conflictTypes),
      pendingOperations: this.pendingOperations.size,
      appliedOperations: this.appliedOperations.size,
    };
  }

  /**
   * Clear transformation log (for memory management)
   */
  clearTransformationLog(): void {
    this.transformationLog = [];
  }
}