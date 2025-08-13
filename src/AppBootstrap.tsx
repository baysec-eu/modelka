// src/AppBootstrap.tsx - Clean application with Zustand state management
import React, { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { useApplicationServices } from './hooks/useApplicationServices';
import { STRIDECanvas } from './components/STRIDECanvas';
import { RightSidebar } from './components/RightSidebar';
import { Header } from './components/Header';
import { DiagramElement } from './types/diagram';
import { useDiagramFromServices } from './hooks/useDiagramFromServices';
import { v4 as uuidv4 } from 'uuid';
import { makePassphrase } from './utils/passphrase';
import { HTMLReportGenerator } from './services/htmlReportGenerator';
import './App.css';

/**
 * Clean enterprise application with proper dependency injection
 * Eliminates race conditions and provides fail-safe recovery
 */
export default function AppBootstrap() {
  // User and room management
  const [userId] = useState(() => {
    // Generate unique user ID per tab/window to prevent peer conflicts
    const storedUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    console.log('🆔 Generated unique user ID for this tab:', storedUserId);
    return storedUserId;
  });
  
  const [roomConfig] = useState(() => {
    const url = new URL(window.location.href);
    const fragmentParams = new URLSearchParams(url.hash.substring(1));
    let roomId = fragmentParams.get('r');
    let passphrase = fragmentParams.get('i');
    
    // If no room in URL, generate one (using existing logic from useModelkaMesh)
    if (!roomId) {
      roomId = uuidv4();
      console.log(`🏠 Generated new room: ${roomId}`);
    } else {
      console.log(`🔗 Using existing room from URL: ${roomId}`);
    }
    
    // If no passphrase in URL, generate one (using existing logic from useModelkaMesh) 
    if (!passphrase) {
      passphrase = makePassphrase();
    }

    // Update URL with room and passphrase (like useModelkaMesh does)
    url.search = '';
    fragmentParams.set('r', roomId);
    fragmentParams.set('i', encodeURIComponent(passphrase));
    url.hash = fragmentParams.toString();
    
    const updatedUrl = url.toString();
    if (window.location.href !== updatedUrl) {
      console.log('🔗 Updating URL with room parameters');
      window.history.replaceState({}, '', updatedUrl);
    }
    
    return { roomId, passphrase };
  });

  const [p2pEnabled, setP2pEnabled] = useState(() => {
    const saved = localStorage.getItem('p2p_enabled');
    return saved !== null ? JSON.parse(saved) : true; // Default to P2P enabled
  });

  // Application services with Zustand store
  const application = useApplicationServices({ 
    userId, 
    roomId: roomConfig.roomId, 
    passphrase: roomConfig.passphrase,
    p2pEnabled 
  });

  // Monitor URL hash changes for room switching
  const [currentRoomId, setCurrentRoomId] = useState(roomConfig.roomId);

  React.useEffect(() => {
    const handleHashChange = () => {
      const url = new URL(window.location.href);
      const fragmentParams = new URLSearchParams(url.hash.substring(1));
      const newRoomId = fragmentParams.get('r');
      
      if (newRoomId && newRoomId !== currentRoomId) {
        console.log(`🔄 Room change detected: ${currentRoomId} → ${newRoomId}`);
        setCurrentRoomId(newRoomId);
        
        // Force application reset to prevent room cross-contamination
        console.log('🧹 Forcing application reset for clean room isolation...');
        application.reset();
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentRoomId, application]);
  
  // Diagram operations (only available when ready)
  const diagram = useDiagramFromServices(application.services.distributedState);

  // P2P toggle handler
  const handleToggleP2P = async (enabled: boolean) => {
    localStorage.setItem('p2p_enabled', JSON.stringify(enabled));
    setP2pEnabled(enabled);
    
    // If toggling during initialization, handle immediately
    if (application.isLoading || !application.isReady) {
      console.log(`🔄 P2P toggle during initialization: ${enabled ? 'ON' : 'OFF'}`);
      // If disabling P2P during initialization, the app should complete initialization immediately
      if (!enabled && application.isLoading) {
        console.log('⚡ P2P disabled during loading - attempting immediate transition to diagram');
      }
    }
    
    await application.toggleP2P(enabled);
  };

  // UI handlers
  const handleAddElement = (type: DiagramElement['type'], pos: { x: number; y: number }) => {
    if (!diagram) return;
    
    const newElement: DiagramElement = {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      name: `New ${type}`,
      position: pos,
      size: { width: 120, height: 80 },
      threats: [],
      technologies: [],
      notes: '',
      description: '',
      assets: [],
    } as DiagramElement;

    diagram.createElement(newElement);
  };

  const handleExport = (format: 'png' | 'json' | 'html') => {
    if (format === 'json' && diagram) {
      try {
        const state = diagram.exportDiagram();
        
        // Create enhanced export data with metadata
        const exportData = {
          version: '2.0',
          exportedAt: new Date().toISOString(),
          exportedBy: userId,
          roomId: roomConfig.roomId,
          metadata: {
            elementCount: state.elements.length,
            threatActorCount: state.threatActors.length,
            appVersion: 'Modelka 2.0'
          },
          elements: state.elements,
          threatActors: state.threatActors,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `modelka-diagram-${roomConfig.roomId}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✅ Diagram exported successfully');
      } catch (error) {
        console.error('❌ Export failed:', error);
        alert('Failed to export diagram. Please try again.');
      }
    } else if (format === 'html') {
      // Handle HTML export using the HTML generator service
      if (diagram) {
        try {
          console.log('📄 Generating HTML threat report...');
          
          // Create HTML generator
          const generator = new HTMLReportGenerator();
          
          // Get canvas screenshot if available
          const canvas = document.querySelector('canvas') as HTMLCanvasElement;
          const canvasDataURL = canvas ? canvas.toDataURL('image/png') : undefined;
          
          // Generate HTML with current diagram data
          const htmlContent = generator.generateThreatReport(
            diagram.elements,
            diagram.threatActors,
            canvasDataURL,
            {
              projectName: `Room ${roomConfig.roomId}`,
              reportTitle: 'Threat Modeling Report',
              includeScreenshot: !!canvasDataURL,
              includeThreatAnalysis: true,
              includeAssetInventory: true,
              includeRecommendations: true,
            }
          );
          
          // Download the HTML
          const blob = new Blob([htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `threat-report-${roomConfig.roomId}-${new Date().toISOString().split('T')[0]}.html`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          console.log('✅ HTML report generated successfully');
        } catch (error) {
          console.error('❌ HTML export failed:', error);
          alert('Failed to export HTML. Please try again.');
        }
      } else {
        alert('Diagram not ready. Please wait for initialization to complete.');
      }
    } else if (format === 'png') {
      // Handle PNG export
      if ((window as any).modelkaExport?.png) {
        (window as any).modelkaExport.png();
      } else {
        console.warn('⚠️ PNG export not yet implemented');
        alert('PNG export is coming soon!');
      }
    }
  };

  const handleImport = (file: File) => {
    if (!diagram) {
      alert('Diagram not ready. Please wait for initialization to complete.');
      return;
    }
    
    if (!file || file.type !== 'application/json') {
      alert('Please select a valid JSON file.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const fileContent = e.target?.result as string;
        if (!fileContent) {
          throw new Error('File content is empty');
        }

        const data = JSON.parse(fileContent);
        
        // Validate import data structure
        if (!data.elements && !data.threatActors) {
          throw new Error('Invalid file format: missing elements and threatActors');
        }

        // Handle different export formats (legacy and new)
        const elements = data.elements || [];
        const threatActors = data.threatActors || [];
        
        // Validate data types
        if (!Array.isArray(elements)) {
          throw new Error('Invalid file format: elements must be an array');
        }
        
        if (!Array.isArray(threatActors)) {
          throw new Error('Invalid file format: threatActors must be an array');
        }

        console.log(`📥 Importing ${elements.length} elements and ${threatActors.length} threat actors...`);

        // Import with confirmation for non-empty diagrams
        if (diagram.elements.length > 0 || diagram.threatActors.length > 0) {
          const confirmed = confirm(
            `This will add ${elements.length} elements and ${threatActors.length} threat actors to the current diagram. Continue?`
          );
          if (!confirmed) return;
        }

        // Perform import
        const success = await diagram.importDiagram(elements, threatActors);
        
        if (success) {
          console.log('✅ Import completed successfully');
          alert(`Successfully imported ${elements.length} elements and ${threatActors.length} threat actors.`);
        } else {
          throw new Error('Import operation failed');
        }

      } catch (error) {
        console.error('❌ Import failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        alert(`Failed to import diagram: ${errorMessage}`);
      }
    };
    
    reader.onerror = () => {
      console.error('❌ File reading failed');
      alert('Failed to read the file. Please try again.');
    };
    
    reader.readAsText(file);
  };

  // Loading screen
  if (application.isLoading || !application.isReady) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h2>Initializing Modelka</h2>
          <p>State: {application.state.replace('_', ' ')}</p>
          
          {application.state === 'initializing_services' && <p>🔧 Setting up core services...</p>}
          {application.state === 'initializing_p2p' && p2pEnabled && <p>🌐 Connecting to P2P network...</p>}
          {application.state === 'initializing_p2p' && !p2pEnabled && <p>🔒 Switching to private mode...</p>}
          {application.state === 'connecting_room' && <p>🏠 Joining room {roomConfig.roomId}...</p>}
          {application.state === 'syncing_state' && <p>📡 Syncing with peers...</p>}
          
          {/* P2P toggle during initialization */}
          <div className="loading-controls">
            <label className="p2p-toggle-loading">
              <span>P2P Mode:</span>
              <input 
                type="checkbox" 
                checked={p2pEnabled} 
                onChange={(e) => handleToggleP2P(e.target.checked)}
                disabled={application.state === 'initializing_services'}
              />
              <span className="toggle-text">{p2pEnabled ? 'ON' : 'OFF'}</span>
            </label>
          </div>
          
          {application.error && (
            <div className="error-message">
              <p>⚠️ {application.error}</p>
              {application.canRetry && (
                <button onClick={application.retry}>
                  Retry ({application.retryCount}/3)
                </button>
              )}
              <button onClick={application.reset}>Reset Application</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (application.state === 'error' && !application.canRetry) {
    return (
      <div className="error-screen">
        <div className="error-content">
          <h2>🔴 Application Error</h2>
          <p>Failed to initialize after {application.retryCount} attempts.</p>
          <p>Error: {application.error}</p>
          <button onClick={application.reset}>Reset Application</button>
        </div>
      </div>
    );
  }

  // Main application UI
  return (
    <ThemeProvider>
      <div className="app">
        <Header
          connected={application.isConnected}
          connectionState={
            application.isConnected ? 'connected' : 
            application.isLoading ? 'connecting' : 
            'not-initialized'
          }
          userCount={application.isConnected ? (diagram?.stats?.connectedPeers || 0) + 1 : 1}
          connectionMode={false}
          roomId={roomConfig.roomId}
          onAddElement={handleAddElement}
          onExport={handleExport}
          onImport={handleImport}
          onToggleConnectionMode={() => {}}
          onShowSettings={() => {}}
          onGenerateInviteLink={() => {
            const inviteUrl = `${window.location.origin}${window.location.pathname}#r=${roomConfig.roomId}&i=${roomConfig.passphrase || 'defaultpass'}`;
            navigator.clipboard.writeText(inviteUrl);
            alert(`Invite link copied: ${inviteUrl}`);
          }}
          peersConnected={diagram?.stats?.connectedPeers || 0}
          networkType="BitTorrent"
          latency={application.isConnected ? 50 : undefined}
          quality={application.isConnected ? 'excellent' : undefined}
          p2pEnabled={p2pEnabled}
          onToggleP2P={handleToggleP2P}
        />

        <div className="app-body">
          <STRIDECanvas
            elements={diagram?.elements || []}
            selectedElement={diagram?.selectedElement || null}
            onElementsChange={(elements) => {
              elements.forEach(element => {
                const existing = diagram?.elements.find(e => e.id === element.id);
                if (existing) {
                  diagram?.updateElement(element.id, element);
                } else {
                  diagram?.createElement(element);
                }
              });
            }}
            onElementSelect={(element) => diagram?.selectElement(element?.id || null)}
            onElementDelete={(elementId) => diagram?.deleteElement(elementId)}
          />

          <div className="sidebar-container">
            <RightSidebar
              selectedElement={diagram?.selectedElement || null}
              elements={diagram?.elements || []}
              threatActors={diagram?.threatActors || []}
              onElementUpdate={(element) => diagram?.updateElement(element.id, element)}
              onThreatUpdate={(elementId, threats) => {
                diagram?.updateElement(elementId, { threats });
              }}
              onThreatActorsChange={(threatActors) => {
                threatActors.forEach(ta => {
                  const existing = diagram?.threatActors.find(t => t.id === ta.id);
                  if (existing) {
                    diagram?.updateThreatActor(ta.id, ta);
                  } else {
                    diagram?.createThreatActor(ta);
                  }
                });
              }}
              onElementDelete={(elementId) => diagram?.deleteElement(elementId)}
            />
          </div>
        </div>

        {/* System status indicator */}
        {application.state !== 'ready' && application.state !== 'private_mode' && (
          <div className="system-status">
            <span>System: {application.state}</span>
            {application.error && <span className="error">Error: {application.error}</span>}
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}