import React from 'react';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  connected: boolean;
  connectionState: 'not-initialized' | RTCPeerConnectionState | 'connecting';
  userCount: number;
  peersConnected?: number;
  networkType?: 'BitTorrent' | 'WebRTC' | 'Hybrid';
  latency?: number;
  quality?: 'excellent' | 'good' | 'poor' | 'unstable';
  p2pEnabled?: boolean;
  onToggleP2P?: (enabled: boolean) => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connectionState,
  userCount,
  peersConnected = 0,
  networkType = 'BitTorrent',
  latency,
  quality,
  p2pEnabled = true,
  onToggleP2P
}) => {
  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'disconnected':
      case 'failed':
      case 'closed':
        return '🔴';
      case 'not-initialized':
        return '⚪';
      default:
        return '🟡';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'failed':
        return 'Connection Failed';
      case 'closed':
        return 'Connection Closed';
      case 'not-initialized':
        return 'Solo Mode';
      default:
        return connectionState;
    }
  };

  const getStatusClass = () => {
    switch (connectionState) {
      case 'connected':
        return 'status-connected';
      case 'connecting':
        return 'status-connecting';
      case 'failed':
      case 'disconnected':
      case 'closed':
        return 'status-error';
      default:
        return 'status-solo';
    }
  };

  return (
    <div className={`connection-status ${getStatusClass()}`}>
      <div className="status-indicator">
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="status-text">{getStatusText()}</span>
      </div>
      
      <div className="user-count">
        <span className="user-icon">👥</span>
        <span className="user-text">
          {userCount} {userCount === 1 ? 'user' : 'users'}
        </span>
      </div>

      {connectionState === 'connected' && (
        <div className="connection-details">
          <div className="detail-item">
            <span>🔒</span>
            <span>P2P Encrypted ({networkType})</span>
          </div>
          {peersConnected > 0 && (
            <div className="detail-item">
              <span>📡</span>
              <span>{peersConnected} peer{peersConnected !== 1 ? 's' : ''} connected</span>
            </div>
          )}
          {latency && (
            <div className="detail-item">
              <span>⚡</span>
              <span>{latency}ms latency</span>
            </div>
          )}
          {quality && (
            <div className="detail-item">
              <span>{quality === 'excellent' ? '🚀' : quality === 'good' ? '✅' : quality === 'poor' ? '⚠️' : '🔴'}</span>
              <span>Connection {quality}</span>
            </div>
          )}
        </div>
      )}

      {connectionState === 'connecting' && (
        <div className="connection-details">
          <div className="detail-item">
            <span>🔍</span>
            <span>Discovering peers via {networkType}...</span>
          </div>
        </div>
      )}

      {connectionState === 'not-initialized' && (
        <div className="solo-mode-info">
          <span>👤 Offline</span>
        </div>
      )}

      {/* P2P Kill Switch */}
      <div className="p2p-controls">
        <div className="toggle-section">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={p2pEnabled}
              onChange={(e) => onToggleP2P?.(e.target.checked)}
              title={p2pEnabled ? 'Disable P2P (Private Mode)' : 'Enable P2P (Collaborative Mode)'}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="toggle-label">
            {p2pEnabled ? (
              <span>🌍 P2P Mode</span>
            ) : (
              <span>🔒 Private Mode</span>
            )}
          </span>
        </div>
        {!p2pEnabled && (
          <div className="private-mode-warning">
            <span>⚠️ BitTorrent disabled - No peer discovery</span>
          </div>
        )}
      </div>
    </div>
  );
};