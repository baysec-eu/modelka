import { DiagramElement, ThreatActor } from '../types/diagram';

export interface SessionData {
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  timestamp: number;
  version: string;
  name: string;
  id: string;
}

export interface SessionIndex {
  sessions: Array<{
    id: string;
    name: string;
    timestamp: number;
    elementCount: number;
    threatCount: number;
  }>;
  currentSessionId: string | null;
}

export class StorageService {
  private static readonly SESSIONS_KEY = 'modelka-sessions';
  private static readonly SESSION_INDEX_KEY = 'modelka-session-index';
  private static readonly VERSION = '1.0';

  /**
   * Get session index
   */
  private static getSessionIndex(): SessionIndex {
    try {
      const storedIndex = localStorage.getItem(this.SESSION_INDEX_KEY);
      if (!storedIndex) {
        return { sessions: [], currentSessionId: null };
      }
      return JSON.parse(storedIndex);
    } catch (error) {
      console.error('Failed to load session index:', error);
      return { sessions: [], currentSessionId: null };
    }
  }

  /**
   * Save session index
   */
  private static saveSessionIndex(index: SessionIndex): void {
    try {
      localStorage.setItem(this.SESSION_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      console.error('Failed to save session index:', error);
    }
  }

  /**
   * Generate a unique session ID
   */
  private static generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate a session name based on content
   */
  private static generateSessionName(elements: DiagramElement[]): string {
    const processCount = elements.filter(e => e.type === 'process').length;
    const entityCount = elements.filter(e => e.type === 'external-entity').length;
    const storeCount = elements.filter(e => e.type === 'data-store').length;
    
    if (processCount + entityCount + storeCount === 0) {
      return `New Session ${new Date().toLocaleDateString()}`;
    }
    
    const parts = [];
    if (processCount > 0) parts.push(`${processCount} process${processCount > 1 ? 'es' : ''}`);
    if (entityCount > 0) parts.push(`${entityCount} entit${entityCount > 1 ? 'ies' : 'y'}`);
    if (storeCount > 0) parts.push(`${storeCount} store${storeCount > 1 ? 's' : ''}`);
    
    return parts.join(', ');
  }

  /**
   * Save session data
   */
  static saveSession(elements: DiagramElement[], threatActors: ThreatActor[], sessionId?: string, sessionName?: string): string {
    try {
      const index = this.getSessionIndex();
      const id = sessionId || this.generateSessionId();
      const name = sessionName || this.generateSessionName(elements);
      
      const sessionData: SessionData = {
        elements,
        threatActors,
        timestamp: Date.now(),
        version: this.VERSION,
        name,
        id
      };
      
      // Save session data to localStorage
      localStorage.setItem(`${this.SESSIONS_KEY}-${id}`, JSON.stringify(sessionData));
      
      // Update session index
      const existingIndex = index.sessions.findIndex(s => s.id === id);
      const sessionSummary = {
        id,
        name,
        timestamp: Date.now(),
        elementCount: elements.length,
        threatCount: elements.reduce((sum, el) => sum + el.threats.length, 0)
      };
      
      if (existingIndex >= 0) {
        index.sessions[existingIndex] = sessionSummary;
      } else {
        index.sessions.push(sessionSummary);
      }
      
      // Sort sessions by timestamp (newest first)
      index.sessions.sort((a, b) => b.timestamp - a.timestamp);
      
      // Set as current session
      index.currentSessionId = id;
      
      this.saveSessionIndex(index);
      console.log(`Session saved: ${name} (${id})`);
      
      return id;
    } catch (error) {
      console.error('Failed to save session:', error);
      return sessionId || this.generateSessionId();
    }
  }

  /**
   * Load session data by ID
   */
  static loadSession(sessionId: string): SessionData | null {
    try {
      const storedData = localStorage.getItem(`${this.SESSIONS_KEY}-${sessionId}`);
      if (!storedData) {
        return null;
      }

      const sessionData: SessionData = JSON.parse(storedData);
      
      // Validate data structure
      if (!sessionData.elements || !Array.isArray(sessionData.elements) ||
          !sessionData.threatActors || !Array.isArray(sessionData.threatActors)) {
        console.warn('Invalid session data structure');
        return null;
      }

      return sessionData;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  /**
   * Load current session data
   */
  static loadCurrentSession(): SessionData | null {
    const index = this.getSessionIndex();
    if (!index.currentSessionId) {
      return null;
    }
    return this.loadSession(index.currentSessionId);
  }

  /**
   * Get all saved sessions
   */
  static getAllSessions(): SessionIndex['sessions'] {
    return this.getSessionIndex().sessions;
  }

  /**
   * Set current session
   */
  static setCurrentSession(sessionId: string): void {
    const index = this.getSessionIndex();
    index.currentSessionId = sessionId;
    this.saveSessionIndex(index);
  }

  /**
   * Delete a session
   */
  static deleteSession(sessionId: string): void {
    try {
      // Remove session data
      localStorage.removeItem(`${this.SESSIONS_KEY}-${sessionId}`);
      
      // Update index
      const index = this.getSessionIndex();
      index.sessions = index.sessions.filter(s => s.id !== sessionId);
      
      // If this was the current session, clear current session
      if (index.currentSessionId === sessionId) {
        index.currentSessionId = index.sessions.length > 0 ? index.sessions[0].id : null;
      }
      
      this.saveSessionIndex(index);
      console.log(`Session deleted: ${sessionId}`);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  /**
   * Rename a session
   */
  static renameSession(sessionId: string, newName: string): void {
    try {
      const sessionData = this.loadSession(sessionId);
      if (!sessionData) return;
      
      sessionData.name = newName;
      localStorage.setItem(`${this.SESSIONS_KEY}-${sessionId}`, JSON.stringify(sessionData));
      
      // Update index
      const index = this.getSessionIndex();
      const sessionIndex = index.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex >= 0) {
        index.sessions[sessionIndex].name = newName;
        this.saveSessionIndex(index);
      }
      
      console.log(`Session renamed: ${sessionId} -> ${newName}`);
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
  }

  /**
   * Legacy compatibility methods
   */
  static saveSoloSession(elements: DiagramElement[], threatActors: ThreatActor[]): void {
    this.saveSession(elements, threatActors);
  }

  static loadSoloSession(): SessionData | null {
    return this.loadCurrentSession();
  }

  static hasSavedSession(): boolean {
    return this.getAllSessions().length > 0;
  }

  static clearSoloSession(): void {
    const index = this.getSessionIndex();
    if (index.currentSessionId) {
      this.deleteSession(index.currentSessionId);
    }
  }

  static getSessionAge(): number | null {
    const sessionData = this.loadCurrentSession();
    if (!sessionData) {
      return null;
    }
    return Math.floor((Date.now() - sessionData.timestamp) / (1000 * 60));
  }

  /**
   * Auto-save session data (debounced)
   */
  private static saveTimeout: number | null = null;
  
  static autoSaveSoloSession(elements: DiagramElement[], threatActors: ThreatActor[], delay = 2000): void {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timeout for auto-save
    this.saveTimeout = setTimeout(() => {
      this.saveSession(elements, threatActors);
    }, delay) as unknown as number;
  }
}