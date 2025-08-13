import React, { useState } from 'react';
import { DiagramElement, Threat, SecurityControl, Technology, ThreatSeverity, SEVERITY_LEVELS, STRIDE_CATEGORIES, Asset } from '../types/diagram';
import { ThreatAPI } from '../services/threatAPI';
import './PropertiesPanel.css';

interface PropertiesPanelProps {
  element: DiagramElement;
  onElementUpdate: (element: DiagramElement) => void;
  onThreatUpdate: (elementId: string, threats: Threat[]) => void;
  onElementDelete?: (elementId: string) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  element,
  onElementUpdate,
  onThreatUpdate,
  onElementDelete
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'threats' | 'technologies' | 'assets'>('basic');
  const [availableThreats, setAvailableThreats] = useState<Threat[]>([]);

  const handleBasicUpdate = (field: keyof DiagramElement, value: any) => {
    const updated = { ...element, [field]: value };
    onElementUpdate(updated);
  };

  const handleAddTechnology = () => {
    const newTech: Technology = {
      id: `tech-${Date.now()}`,
      name: 'New Technology',
      category: 'other',
      threats: []
    };
    
    const updated = {
      ...element,
      technologies: [...(element.technologies || []), newTech]
    };
    
    onElementUpdate(updated);
    
    // Load threats for this technology
    loadThreatsForTechnology(newTech);
  };

  const handleTechnologyUpdate = (techId: string, field: keyof Technology, value: any) => {
    const updated = {
      ...element,
      technologies: (element.technologies || []).map(tech =>
        tech.id === techId ? { ...tech, [field]: value } : tech
      )
    };
    onElementUpdate(updated);
    
    // Reload threats if category or name changed
    if (field === 'category' || field === 'name') {
      const tech = updated.technologies.find(t => t.id === techId);
      if (tech) {
        loadThreatsForTechnology(tech);
      }
    }
  };

  const loadThreatsForTechnology = async (technology: Technology) => {
    try {
      const threats = await ThreatAPI.getThreatsForTechnology(technology.name, technology.category);
      setAvailableThreats(threats);
    } catch (error) {
      console.error('Failed to load threats:', error);
    }
  };

  const handleAddThreat = (threat: Threat) => {
    const newThreat: Threat = {
      ...threat,
      id: `threat-${Date.now()}`,
      controls: []
    };
    
    const updatedThreats = [...(element.threats || []), newThreat];
    const updated = { ...element, threats: updatedThreats };
    onElementUpdate(updated);
    onThreatUpdate(element.id, updatedThreats);
  };

  const handleAddDirectThreat = () => {
    const newThreat: Threat = {
      id: `threat-${Date.now()}`,
      title: 'New Threat',
      description: 'Enter threat description',
      severity: 'medium' as ThreatSeverity,
      strideCategory: 'spoofing',
      controls: [],
      isActionItem: false
    };
    
    const updatedThreats = [...(element.threats || []), newThreat];
    const updated = { ...element, threats: updatedThreats };
    onElementUpdate(updated);
    onThreatUpdate(element.id, updatedThreats);
  };

  const handleThreatUpdate = (threatId: string, field: keyof Threat, value: any) => {
    const updatedThreats = (element.threats || []).map(threat =>
      threat.id === threatId ? { ...threat, [field]: value } : threat
    );
    
    const updated = { ...element, threats: updatedThreats };
    onElementUpdate(updated);
    onThreatUpdate(element.id, updatedThreats);
  };

  const handleAddControl = (threatId: string) => {
    const newControl: SecurityControl = {
      id: `control-${Date.now()}`,
      name: 'New Security Control',
      description: '',
      implemented: false
    };

    const updatedThreats = (element.threats || []).map(threat =>
      threat.id === threatId
        ? { ...threat, controls: [...(threat.controls || []), newControl] }
        : threat
    );

    const updated = { ...element, threats: updatedThreats };
    onElementUpdate(updated);
    onThreatUpdate(element.id, updatedThreats);
  };

  const handleControlUpdate = (threatId: string, controlId: string, field: keyof SecurityControl, value: any) => {
    const updatedThreats = (element.threats || []).map(threat =>
      threat.id === threatId
        ? {
            ...threat,
            controls: (threat.controls || []).map(control =>
              control.id === controlId ? { ...control, [field]: value } : control
            )
          }
        : threat
    );

    const updated = { ...element, threats: updatedThreats };
    onElementUpdate(updated);
    onThreatUpdate(element.id, updatedThreats);
  };

  const handleAddAsset = () => {
    const newAsset: Asset = {
      id: `asset-${Date.now()}`,
      name: 'New Asset',
      type: 'data',
      value: 'medium',
      description: '',
      owner: ''
    };
    
    const updated = {
      ...element,
      assets: [...(element.assets || []), newAsset]
    };
    onElementUpdate(updated);
  };

  const handleAssetUpdate = (assetId: string, field: keyof Asset, value: any) => {
    const updated = {
      ...element,
      assets: (element.assets || []).map(asset =>
        asset.id === assetId ? { ...asset, [field]: value } : asset
      )
    };
    onElementUpdate(updated);
  };

  const renderBasicTab = () => (
    <div className="tab-content">
      <div className="form-group">
        <label>Element Name</label>
        <input
          type="text"
          value={element.name}
          onChange={(e) => handleBasicUpdate('name', e.target.value)}
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          value={element.description}
          onChange={(e) => handleBasicUpdate('description', e.target.value)}
          className="form-textarea"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea
          value={element.notes}
          onChange={(e) => handleBasicUpdate('notes', e.target.value)}
          className="form-textarea"
          rows={4}
        />
      </div>

      <div className="form-group">
        <label>Position</label>
        <div className="position-inputs">
          <input
            type="number"
            value={Math.round(element.position.x)}
            onChange={(e) => handleBasicUpdate('position', { ...element.position, x: parseInt(e.target.value) || 0 })}
            className="form-input-small"
            placeholder="X"
          />
          <input
            type="number"
            value={Math.round(element.position.y)}
            onChange={(e) => handleBasicUpdate('position', { ...element.position, y: parseInt(e.target.value) || 0 })}
            className="form-input-small"
            placeholder="Y"
          />
        </div>
      </div>

      {element.type !== 'data-flow' && (
        <div className="form-group">
          <label>Size</label>
          <div className="size-inputs">
            <input
              type="number"
              value={element.size.width}
              onChange={(e) => handleBasicUpdate('size', { ...element.size, width: parseInt(e.target.value) || 100 })}
              className="form-input-small"
              placeholder="Width"
            />
            <input
              type="number"
              value={element.size.height}
              onChange={(e) => handleBasicUpdate('size', { ...element.size, height: parseInt(e.target.value) || 100 })}
              className="form-input-small"
              placeholder="Height"
            />
          </div>
        </div>
      )}

      {element.type === 'data-flow' && (
        <>
          <div className="form-group">
            <label>Data Type</label>
            <input
              type="text"
              value={element.dataType || ''}
              onChange={(e) => handleBasicUpdate('dataType', e.target.value)}
              className="form-input"
              placeholder="e.g., User credentials, Payment info, Log data"
            />
          </div>

          <div className="form-group">
            <label>Data Description</label>
            <textarea
              value={element.dataDescription || ''}
              onChange={(e) => handleBasicUpdate('dataDescription', e.target.value)}
              className="form-textarea"
              rows={3}
              placeholder="Detailed description of the data being transferred"
            />
          </div>
        </>
      )}
    </div>
  );

  const renderTechnologiesTab = () => (
    <div className="tab-content">
      <div className="section-header">
        <h4>Technologies</h4>
        <button className="btn btn-primary btn-sm" onClick={handleAddTechnology}>
          + Add Technology
        </button>
      </div>

      {(element.technologies || []).map((tech) => (
        <div key={tech.id} className="technology-item">
          <div className="form-group">
            <label>Technology Name</label>
            <input
              type="text"
              value={tech.name}
              onChange={(e) => handleTechnologyUpdate(tech.id, 'name', e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              value={tech.category}
              onChange={(e) => handleTechnologyUpdate(tech.id, 'category', e.target.value)}
              className="form-select"
            >
              <option value="web-server">Web Server</option>
              <option value="database">Database</option>
              <option value="api">API</option>
              <option value="mobile-app">Mobile App</option>
              <option value="container">Container</option>
              <option value="network">Network</option>
              <option value="other">Other</option>
            </select>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadThreatsForTechnology(tech)}
          >
            📊 Load Threats
          </button>
        </div>
      ))}

      {availableThreats.length > 0 && (
        <div className="available-threats">
          <h4>Available Threats</h4>
          {availableThreats.map((threat) => (
            <div key={threat.id} className="threat-suggestion">
              <div className="threat-info">
                <strong>{threat.title}</strong>
                <span className={`severity-badge severity-${threat.severity}`}>
                  {SEVERITY_LEVELS[threat.severity].name}
                </span>
                <span className="stride-badge">
                  {STRIDE_CATEGORIES[threat.strideCategory].icon} {STRIDE_CATEGORIES[threat.strideCategory].name}
                </span>
              </div>
              <p>{threat.description}</p>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAddThreat(threat)}
              >
                + Add Threat
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderThreatsTab = () => (
    <div className="tab-content">
      <div className="section-header">
        <h4>Threats ({(element.threats || []).length})</h4>
        <button className="btn btn-primary btn-sm" onClick={handleAddDirectThreat}>
          + Add Threat
        </button>
      </div>

      {(element.threats || []).map((threat) => (
        <div key={threat.id} className="threat-item">
          <div className="threat-header">
            <div className="form-group">
              <label>Threat Title</label>
              <input
                type="text"
                value={threat.title}
                onChange={(e) => handleThreatUpdate(threat.id, 'title', e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Severity</label>
              <select
                value={threat.severity}
                onChange={(e) => handleThreatUpdate(threat.id, 'severity', e.target.value as ThreatSeverity)}
                className="form-select"
              >
                {Object.entries(SEVERITY_LEVELS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>STRIDE Category</label>
              <select
                value={threat.strideCategory}
                onChange={(e) => handleThreatUpdate(threat.id, 'strideCategory', e.target.value)}
                className="form-select"
              >
                {Object.entries(STRIDE_CATEGORIES).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.icon} {config.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={threat.isActionItem || false}
                  onChange={(e) => handleThreatUpdate(threat.id, 'isActionItem', e.target.checked)}
                  className="form-checkbox"
                />
                Mark as Action Item
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={threat.description}
              onChange={(e) => handleThreatUpdate(threat.id, 'description', e.target.value)}
              className="form-textarea"
              rows={3}
            />
          </div>

          <div className="controls-section">
            <div className="section-header">
              <h5>Security Controls</h5>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleAddControl(threat.id)}
              >
                + Add Control
              </button>
            </div>

            {(threat.controls || []).map((control) => (
              <div key={control.id} className="control-item">
                <div className="control-header">
                  <input
                    type="checkbox"
                    checked={control.implemented}
                    onChange={(e) => handleControlUpdate(threat.id, control.id, 'implemented', e.target.checked)}
                    className="form-checkbox"
                  />
                  <input
                    type="text"
                    value={control.name}
                    onChange={(e) => handleControlUpdate(threat.id, control.id, 'name', e.target.value)}
                    className="form-input"
                    placeholder="Control name"
                  />
                </div>
                <textarea
                  value={control.description}
                  onChange={(e) => handleControlUpdate(threat.id, control.id, 'description', e.target.value)}
                  className="form-textarea"
                  rows={2}
                  placeholder="Control description"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderAssetsTab = () => (
    <div className="tab-content">
      <div className="section-header">
        <h4>Assets ({(element.assets || []).length})</h4>
        <button className="btn btn-primary btn-sm" onClick={handleAddAsset}>
          + Add Asset
        </button>
      </div>

      {(element.assets || []).map((asset) => (
        <div key={asset.id} className="asset-item">
          <div className="form-group">
            <label>Asset Name</label>
            <input
              type="text"
              value={asset.name}
              onChange={(e) => handleAssetUpdate(asset.id, 'name', e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Asset Type</label>
            <select
              value={asset.type}
              onChange={(e) => handleAssetUpdate(asset.id, 'type', e.target.value)}
              className="form-select"
            >
              <option value="data">Data</option>
              <option value="system">System</option>
              <option value="service">Service</option>
              <option value="user">User</option>
              <option value="physical">Physical</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Asset Value</label>
            <select
              value={asset.value}
              onChange={(e) => handleAssetUpdate(asset.id, 'value', e.target.value)}
              className="form-select"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div className="form-group">
            <label>Owner</label>
            <input
              type="text"
              value={asset.owner}
              onChange={(e) => handleAssetUpdate(asset.id, 'owner', e.target.value)}
              className="form-input"
              placeholder="Asset owner"
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={asset.description}
              onChange={(e) => handleAssetUpdate(asset.id, 'description', e.target.value)}
              className="form-textarea"
              rows={3}
              placeholder="Asset description"
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="properties-panel">
      <div className="panel-header">
        <div className="header-info">
          <h3>{element.name}</h3>
          <span className="element-type">{element.type}</span>
        </div>
        {onElementDelete && (
          <button
            className="btn btn-danger delete-element-btn"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete "${element.name}"?`)) {
                onElementDelete(element.id);
              }
            }}
            title="Delete this element"
          >
            🗑️ Delete
          </button>
        )}
      </div>

      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
          onClick={() => setActiveTab('basic')}
        >
          📝 Basic
        </button>
        <button
          className={`tab-btn ${activeTab === 'threats' ? 'active' : ''}`}
          onClick={() => setActiveTab('threats')}
        >
          🚨 Threats ({(element.threats || []).length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'technologies' ? 'active' : ''}`}
          onClick={() => setActiveTab('technologies')}
        >
          🔧 Tech
        </button>
        {element.type !== 'data-flow' && (
          <button
            className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            🏛️ Assets ({(element.assets || []).length})
          </button>
        )}
      </div>

      <div className="panel-content">
        {activeTab === 'basic' && renderBasicTab()}
        {activeTab === 'technologies' && renderTechnologiesTab()}
        {activeTab === 'threats' && renderThreatsTab()}
        {activeTab === 'assets' && renderAssetsTab()}
      </div>
    </div>
  );
};