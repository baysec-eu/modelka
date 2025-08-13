export enum ElementType {
  EXTERNAL_ENTITY = 'external_entity',
  PROCESS = 'process',
  DATA_FLOW = 'data_flow',
  DATA_STORE = 'data_store',
  TRUST_BOUNDARY = 'trust_boundary'
}

export enum ThreatType {
  SPOOFING = 'Spoofing',
  TAMPERING = 'Tampering',
  REPUDIATION = 'Repudiation',
  INFORMATION_DISCLOSURE = 'Information Disclosure',
  DENIAL_OF_SERVICE = 'Denial of Service',
  ELEVATION_OF_PRIVILEGE = 'Elevation of Privilege'
}

export enum Severity {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical'
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SecurityControl {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
}

export interface Threat {
  id: string;
  type: ThreatType;
  description: string;
  severity: Severity;
  controls: SecurityControl[];
}

export interface Technology {
  name: string;
  version?: string;
  description?: string;
}

export interface DiagramElement {
  id: string;
  type: ElementType;
  name: string;
  position: Position;
  size: Size;
  threats: Threat[];
  technologies: Technology[];
  description?: string;
  notes?: string;
  // For data flows
  source?: string;
  target?: string;
}

export interface DiagramState {
  elements: DiagramElement[];
  zoom: number;
  pan: Position;
  selectedElement?: string;
}