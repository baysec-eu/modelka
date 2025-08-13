import React, { useState, useEffect } from 'react';
import { StorageService, SessionIndex } from '../services/storageService';
import { DiagramElement, ThreatActor } from '../types/diagram';
import './SessionManager.css';

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionSwitch: (elements: DiagramElement[], threatActors: ThreatActor[], sessionId: string) => void;
  currentElements: DiagramElement[];
  currentThreatActors: ThreatActor[];
}

export const SessionManager: React.FC<SessionManagerProps> = ({
  isOpen,
  onClose,
  onSessionSwitch,
  currentElements,
  currentThreatActors
}) => {
  const [sessions, setSessions] = useState<SessionIndex['sessions']>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = () => {
    const allSessions = StorageService.getAllSessions();
    setSessions(allSessions);
    
    const index = StorageService['getSessionIndex']();
    setCurrentSessionId(index.currentSessionId);
  };

  const handleSwitchSession = (sessionId: string) => {
    // Save current session first
    StorageService.saveSession(currentElements, currentThreatActors);
    
    // Load the selected session
    const sessionData = StorageService.loadSession(sessionId);
    if (sessionData) {
      StorageService.setCurrentSession(sessionId);
      onSessionSwitch(sessionData.elements, sessionData.threatActors, sessionId);
      setCurrentSessionId(sessionId);
      onClose();
    }
  };

  const handleNewSession = () => {
    // Save current session first
    StorageService.saveSession(currentElements, currentThreatActors);
    
    // Create new empty session
    const newSessionId = StorageService.saveSession([], [], undefined, 'New Session');
    onSessionSwitch([], [], newSessionId);
    setCurrentSessionId(newSessionId);
    loadSessions();
    onClose();
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (sessions.length <= 1) {
      alert('Cannot delete the last session');
      return;
    }
    
    if (confirm('Are you sure you want to delete this session?')) {
      StorageService.deleteSession(sessionId);
      
      // If we deleted the current session, switch to the first available session
      if (sessionId === currentSessionId) {
        const remainingSessions = StorageService.getAllSessions();
        if (remainingSessions.length > 0) {
          handleSwitchSession(remainingSessions[0].id);
        }
      }
      
      loadSessions();
    }
  };

  const handleRenameSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setEditingSession(sessionId);
      setEditName(session.name);
    }
  };

  const handleSaveRename = (sessionId: string) => {
    if (editName.trim()) {
      StorageService.renameSession(sessionId, editName.trim());
      loadSessions();
    }
    setEditingSession(null);
    setEditName('');
  };

  const handleCancelRename = () => {
    setEditingSession(null);
    setEditName('');
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="session-manager-overlay">
      <div className="session-manager">
        <div className="session-manager-header">
          <h2>📁 Session Manager</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="session-manager-content">
          <div className="session-actions">
            <button className="btn btn-primary" onClick={handleNewSession}>
              ➕ New Session
            </button>
            <p className="session-count">{sessions.length} saved session{sessions.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="sessions-list">
            {sessions.map(session => (
              <div 
                key={session.id}
                className={`session-item ${session.id === currentSessionId ? 'current' : ''}`}
                onClick={() => handleSwitchSession(session.id)}
              >
                <div className="session-main">
                  <div className="session-info">
                    {editingSession === session.id ? (
                      <div className="edit-name-container">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSaveRename(session.id);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          onBlur={() => handleSaveRename(session.id)}
                          autoFocus
                          className="edit-name-input"
                        />
                      </div>
                    ) : (
                      <>
                        <h3 className="session-name">
                          {session.name}
                          {session.id === currentSessionId && <span className="current-badge">Current</span>}
                        </h3>
                        <div className="session-stats">
                          <span className="stat">
                            🏗️ {session.elementCount} element{session.elementCount !== 1 ? 's' : ''}
                          </span>
                          <span className="stat">
                            ⚠️ {session.threatCount} threat{session.threatCount !== 1 ? 's' : ''}
                          </span>
                          <span className="stat timestamp">
                            🕐 {formatTimestamp(session.timestamp)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="session-actions-right">
                    <button 
                      className="icon-btn rename-btn"
                      onClick={(e) => handleRenameSession(session.id, e)}
                      title="Rename session"
                    >
                      ✏️
                    </button>
                    <button 
                      className="icon-btn delete-btn"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      title="Delete session"
                      disabled={sessions.length <= 1}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="empty-sessions">
                <p>No saved sessions found</p>
                <button className="btn btn-secondary" onClick={handleNewSession}>
                  Create your first session
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};