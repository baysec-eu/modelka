import React, { useRef } from 'react';
import { STRIDEElementType, ELEMENT_CONFIGS } from '../types/diagram';
import './Toolbar.css';

interface ToolbarProps {
  onAddElement: (type: STRIDEElementType, position: { x: number; y: number }) => void;
  onExport: (format: 'png' | 'json' | 'html') => void;
  onImport: (file: File) => void;
  onToggleConnectionMode?: () => void;
  connectionMode?: boolean;
  roomId?: string;
  onShowSettings?: () => void;
  onGenerateInviteLink?: () => void;
  isGeneratingLink?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddElement,
  onExport,
  onImport,
  onToggleConnectionMode: _onToggleConnectionMode,
  connectionMode: _connectionMode = false,
  roomId: _roomId,
  onShowSettings: _onShowSettings,
  onGenerateInviteLink,
  isGeneratingLink = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const handleAddElement = (type: STRIDEElementType) => {
    // Add element at center of viewport
    const position = { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 };
    onAddElement(type, position);
  };

  const handleExportClick = (format: 'png' | 'json' | 'html') => {
    onExport(format);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = ''; // Reset input
    }
  };

  const handleExportButtonMouseEnter = () => {
    if (exportDropdownRef.current && exportMenuRef.current) {
      const rect = exportDropdownRef.current.getBoundingClientRect();
      const menu = exportMenuRef.current;
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 2}px`;
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <div className="element-buttons">
          {Object.entries(ELEMENT_CONFIGS)
            .filter(([type]) => type !== 'data-flow')
            .map(([type, config]) => (
            <button
              key={type}
              className="element-btn"
              title={config.name}
              style={{ borderColor: config.color }}
              onClick={() => handleAddElement(type as STRIDEElementType)}
            >
              <span className="element-icon">{config.icon}</span>
              <span className="element-name">{config.name}</span>
            </button>
          ))}
        </div>
        
      </div>

      <div className="toolbar-section">
        <div className="file-buttons">
          <button
            className="toolbar-btn import-btn"
            onClick={handleImportClick}
            title="Import JSON diagram"
          >
            📁 Import
          </button>
          
          <div 
            ref={exportDropdownRef}
            className="export-dropdown"
            onMouseEnter={handleExportButtonMouseEnter}
          >
            <button className="toolbar-btn export-btn">
              📤 Export
            </button>
            <div ref={exportMenuRef} className="export-menu">
              <button onClick={() => handleExportClick('png')}>
                🖼️ PNG Image
              </button>
              {/* SVG export removed as requested */}
              <button onClick={() => handleExportClick('json')}>
                📄 JSON Data
              </button>
              <button onClick={() => handleExportClick('html')}>
                🌐 HTML Report
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="collab-buttons">
          <button
            className="toolbar-btn invite-btn"
            onClick={onGenerateInviteLink}
            disabled={isGeneratingLink}
            title={isGeneratingLink ? "Generating invitation link..." : "Generate and copy invitation link"}
          >
            {isGeneratingLink ? (
              <>
                ⏳ Generating...
              </>
            ) : (
              <>
                Invite
              </>
            )}
          </button>
      
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};