import React from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { Toolbar } from './Toolbar';
import { STRIDEElementType } from '../types/diagram';
import './Header.css';

interface HeaderProps {
  connected: boolean;
  connectionState: 'not-initialized' | RTCPeerConnectionState | 'connecting';
  userCount: number;
  connectionMode: boolean;
  roomId?: string;
  onAddElement: (type: STRIDEElementType, position: { x: number; y: number }) => void;
  onExport: (format: 'png' | 'json' | 'html') => void;
  onImport: (file: File) => void;
  onToggleConnectionMode: () => void;
  onShowSettings: () => void;
  onShowSessionManager?: () => void;
  onGenerateInviteLink?: () => void;
  isGeneratingLink?: boolean;
  // P2P-specific props
  peersConnected?: number;
  networkType?: 'BitTorrent' | 'WebRTC' | 'Hybrid';
  latency?: number;
  quality?: 'excellent' | 'good' | 'poor' | 'unstable';
  p2pEnabled?: boolean;
  onToggleP2P?: (enabled: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  connected,
  connectionState,
  userCount,
  connectionMode,
  roomId,
  onAddElement,
  onExport,
  onImport,
  onToggleConnectionMode,
  onShowSettings,
  onShowSessionManager: _onShowSessionManager,
  onGenerateInviteLink,
  isGeneratingLink,
  peersConnected,
  networkType,
  latency,
  quality,
  p2pEnabled,
  onToggleP2P
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <a
          href="https://www.baysec.eu"
        >
          <img 
          src={ "/logo-darkmode.svg"} 
          alt="Modelka Logo"
          className="header-logo"
        /></a>
        
        <h1><a className="modelka" href="/">Modelka</a></h1>
      </div>
      
      <div className="header-controls">
        <ConnectionStatus 
          connected={connected} 
          connectionState={connectionState}
          userCount={userCount}
          peersConnected={peersConnected}
          networkType={networkType || 'BitTorrent'}
          latency={latency}
          quality={quality}
          p2pEnabled={p2pEnabled}
          onToggleP2P={onToggleP2P}
        />
      
        <Toolbar 
          onAddElement={onAddElement}
          onExport={onExport}
          onImport={onImport}
          onToggleConnectionMode={onToggleConnectionMode}
          connectionMode={connectionMode}
          roomId={roomId}
          onShowSettings={onShowSettings}
          onGenerateInviteLink={onGenerateInviteLink}
          isGeneratingLink={isGeneratingLink}
        />
      </div>
    </header>
  );
};