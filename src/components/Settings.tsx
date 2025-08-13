import React, { useState, useEffect } from 'react';
import './Settings.css';

interface STUNTURNConfig {
  stunServers: string[];
  turnServers: Array<{
    urls: string;
    username?: string;
    credential?: string;
  }>;
  useMetered: boolean;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange: (config: STUNTURNConfig) => void;
}

const DEFAULT_CONFIG: STUNTURNConfig = {
  stunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ],
  turnServers: [
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'e46b7d5c4f41f4a0e0b24c8e',
      credential: 'IrBCYCsfsKXvBh6j'
    }
  ],
  useMetered: true
};

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, onConfigChange }) => {
  const [config, setConfig] = useState<STUNTURNConfig>(DEFAULT_CONFIG);
  const [newStunServer, setNewStunServer] = useState('');
  const [newTurnServer, setNewTurnServer] = useState({
    urls: '',
    username: '',
    credential: ''
  });

  // Load saved configuration
  useEffect(() => {
    const savedConfig = localStorage.getItem('modelka-webrtc-config');
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch (error) {
        console.error('Failed to load saved WebRTC config:', error);
      }
    }
  }, []);

  // Save configuration when it changes
  useEffect(() => {
    localStorage.setItem('modelka-webrtc-config', JSON.stringify(config));
    onConfigChange(config);
  }, [config, onConfigChange]);

  const handleAddStunServer = () => {
    if (newStunServer.trim() && !config.stunServers.includes(newStunServer.trim())) {
      setConfig(prev => ({
        ...prev,
        stunServers: [...prev.stunServers, newStunServer.trim()]
      }));
      setNewStunServer('');
    }
  };

  const handleRemoveStunServer = (index: number) => {
    setConfig(prev => ({
      ...prev,
      stunServers: prev.stunServers.filter((_, i) => i !== index)
    }));
  };

  const handleAddTurnServer = () => {
    if (newTurnServer.urls.trim()) {
      setConfig(prev => ({
        ...prev,
        turnServers: [...prev.turnServers, { ...newTurnServer }]
      }));
      setNewTurnServer({ urls: '', username: '', credential: '' });
    }
  };

  const handleRemoveTurnServer = (index: number) => {
    setConfig(prev => ({
      ...prev,
      turnServers: prev.turnServers.filter((_, i) => i !== index)
    }));
  };

  const handleResetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
  };

  const handleTestConfiguration = async () => {
    try {
      // Create a test RTCPeerConnection with current config
      const iceServers = [
        ...config.stunServers.map(url => ({ urls: url })),
        ...config.turnServers
      ];

      const testPc = new RTCPeerConnection({ iceServers });
      
      // Test ICE gathering
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('ICE gathering timeout'));
        }, 10000);

        testPc.onicegatheringstatechange = () => {
          if (testPc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };

        testPc.createDataChannel('test');
        testPc.createOffer().then(offer => testPc.setLocalDescription(offer));
      });

      testPc.close();
      alert('✅ Configuration test successful! ICE servers are reachable.');
    } catch (error) {
      console.error('Configuration test failed:', error);
      alert('❌ Configuration test failed. Some servers may be unreachable.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>🔧 WebRTC Configuration</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <div className="setting-section">
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={config.useMetered}
                onChange={(e) => setConfig(prev => ({ ...prev, useMetered: e.target.checked }))}
              />
              <span>Use Metered.live automatic TURN servers</span>
            </label>
            <p className="setting-description">
              When enabled, will fetch TURN credentials from metered.live API. Disable to use only manual configuration.
            </p>
          </div>

          <div className="setting-section">
            <h3>STUN Servers</h3>
            <div className="server-list">
              {config.stunServers.map((server, index) => (
                <div key={index} className="server-item">
                  <code>{server}</code>
                  <button 
                    className="remove-btn"
                    onClick={() => handleRemoveStunServer(index)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
            <div className="add-server">
              <input
                type="text"
                placeholder="stun:stun.example.com:19302"
                value={newStunServer}
                onChange={(e) => setNewStunServer(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddStunServer()}
              />
              <button onClick={handleAddStunServer}>Add STUN</button>
            </div>
          </div>

          <div className="setting-section">
            <h3>TURN Servers</h3>
            <div className="server-list">
              {config.turnServers.map((server, index) => (
                <div key={index} className="server-item turn-item">
                  <div>
                    <code>{server.urls}</code>
                    {server.username && <small>User: {server.username}</small>}
                  </div>
                  <button 
                    className="remove-btn"
                    onClick={() => handleRemoveTurnServer(index)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
            <div className="add-turn-server">
              <input
                type="text"
                placeholder="turn:turn.example.com:3478"
                value={newTurnServer.urls}
                onChange={(e) => setNewTurnServer(prev => ({ ...prev, urls: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Username (optional)"
                value={newTurnServer.username}
                onChange={(e) => setNewTurnServer(prev => ({ ...prev, username: e.target.value }))}
              />
              <input
                type="password"
                placeholder="Password (optional)"
                value={newTurnServer.credential}
                onChange={(e) => setNewTurnServer(prev => ({ ...prev, credential: e.target.value }))}
              />
              <button onClick={handleAddTurnServer}>Add TURN</button>
            </div>
          </div>

          <div className="settings-actions">
            <button className="test-btn" onClick={handleTestConfiguration}>
              🧪 Test Configuration
            </button>
            <button className="reset-btn" onClick={handleResetToDefaults}>
              🔄 Reset to Defaults
            </button>
            <button className="save-btn" onClick={onClose}>
              💾 Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};