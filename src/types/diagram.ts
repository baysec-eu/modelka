export type STRIDEElementType = 
  | 'external-entity'
  | 'process' 
  | 'data-store'
  | 'data-flow'
  | 'trust-boundary';

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Threat {
  id: string;
  title: string;
  description: string;
  severity: ThreatSeverity;
  strideCategory: 'spoofing' | 'tampering' | 'repudiation' | 'information-disclosure' | 'denial-of-service' | 'elevation-of-privilege';
  technology?: string;
  controls: SecurityControl[];
  isActionItem?: boolean;
}

export interface SecurityControl {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
}

export interface Technology {
  id: string;
  name: string;
  category: 'web-server' | 'database' | 'api' | 'mobile-app' | 'container' | 'network' | 'other';
  threats: string[]; // References to threat IDs
}

export interface Asset {
  id: string;
  name: string;
  type: 'data' | 'system' | 'service' | 'user' | 'physical' | 'other';
  value: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  owner: string;
}

export interface ThreatActor {
  id: string;
  name: string;
  type: 'insider' | 'outsider' | 'nation-state' | 'criminal' | 'hacktivist' | 'competitor' | 'other';
  skill: 'low' | 'medium' | 'high' | 'expert';
  motivation: string;
  description: string;
  capabilities: string[];
}

export interface DiagramElement {
  id: string;
  type: STRIDEElementType;
  name: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  
  // STRIDE specific data
  threats: Threat[];
  technologies: Technology[];
  notes: string;
  description: string;
  
  // Visual properties
  color?: string;
  rotation?: number;
  
  // Data flow specific
  sourceId?: string;
  targetId?: string;
  sourceEdge?: 'top' | 'bottom' | 'left' | 'right'; // Which edge of source element
  sourceEdgeOffset?: number; // Position along source edge (0.0 to 1.0)
  targetEdge?: 'top' | 'bottom' | 'left' | 'right'; // Which edge of target element
  targetEdgeOffset?: number; // Position along target edge (0.0 to 1.0)
  targetPoint?: { x: number; y: number }; // Precise target connection point (legacy)
  dataType?: string; // Type of data being transferred
  dataDescription?: string; // Detailed description of the data
  points?: number[]; // For curved data flows
  
  // Assets
  assets?: Asset[];
}

export interface DiagramState {
  elements: DiagramElement[];
  zoom: number;
  pan: { x: number; y: number };
  selectedElementId: string | null;
}

export interface User {
  id: string;
  name?: string;
  cursor?: { x: number; y: number };
  color: string;
}

// STRIDE Categories with colors and icons
export const STRIDE_CATEGORIES = {
  spoofing: { color: '#FF6B6B', icon: '🎭', name: 'Spoofing' },
  tampering: { color: '#4ECDC4', icon: '🔧', name: 'Tampering' },
  repudiation: { color: '#45B7D1', icon: '🚫', name: 'Repudiation' },
  'information-disclosure': { color: '#96CEB4', icon: '👁️', name: 'Information Disclosure' },
  'denial-of-service': { color: '#FFEAA7', icon: '⛔', name: 'Denial of Service' },
  'elevation-of-privilege': { color: '#DDA0DD', icon: '⬆️', name: 'Elevation of Privilege' }
};

// Element type configurations
export const ELEMENT_CONFIGS = {
  'external-entity': {
    name: 'External Entity',
    icon: '👤',
    color: '#ef4444', // Red
    shape: 'rectangle',
    defaultSize: { width: 120, height: 80 }
  },
  'process': {
    name: 'Process',
    icon: '⚙️',
    color: '#06b6d4', // Cyan
    shape: 'circle',
    defaultSize: { width: 100, height: 100 }
  },
  'data-store': {
    name: 'Data Store',
    icon: '🗄️',
    color: '#3b82f6', // Blue
    shape: 'rectangle',
    defaultSize: { width: 140, height: 60 }
  },
  'data-flow': {
    name: 'Data Flow',
    icon: '➡️',
    color: '#10b981', // Green
    shape: 'arrow',
    defaultSize: { width: 200, height: 20 }
  },
  'trust-boundary': {
    name: 'Trust Boundary',
    icon: '🔒',
    color: '#f59e0b', // Yellow
    shape: 'boundary',
    defaultSize: { width: 300, height: 200 }
  }
} as const;

// Severity levels with colors
export const SEVERITY_LEVELS = {
  low: { color: '#28a745', name: 'Low', score: 1 },
  medium: { color: '#ffc107', name: 'Medium', score: 2 },
  high: { color: '#fd7e14', name: 'High', score: 3 },
  critical: { color: '#dc3545', name: 'Critical', score: 4 }
} as const;