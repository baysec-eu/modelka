import React, { useState } from 'react';
import { PropertiesPanel } from './PropertiesPanel';
import { ThreatActorsPanel } from './ThreatActorsPanel';
import { ActionItemsPanel } from './ActionItemsPanel';
import { DiagramElement, ThreatActor, Threat } from '../types/diagram';
import './RightSidebar.css';

interface RightSidebarProps {
  selectedElement: DiagramElement | null;
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  onElementUpdate: (element: DiagramElement) => void;
  onThreatUpdate: (elementId: string, threats: Threat[]) => void;
  onThreatActorsChange: (threatActors: ThreatActor[]) => void;
  onElementDelete?: (elementId: string) => void;
}

type SidebarTab = 'properties' | 'threat-actors' | 'action-items';

export const RightSidebar: React.FC<RightSidebarProps> = ({
  selectedElement,
  elements,
  threatActors,
  onElementUpdate,
  onThreatUpdate,
  onThreatActorsChange,
  onElementDelete
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('properties');

  // Auto-switch to properties when an element is selected
  React.useEffect(() => {
    if (selectedElement && activeTab !== 'properties') {
      setActiveTab('properties');
    }
  }, [selectedElement]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'properties':
        if (!selectedElement) {
          return (
            <div className="no-selection">
              <div className="no-selection-content">
                <div className="no-selection-icon">📝</div>
                <h3>No Element Selected</h3>
                <p>Click on an element in the diagram to view and edit its properties.</p>
                <div className="available-elements">
                  <h4>Available Elements:</h4>
                  <ul>
                    <li>👤 External Entity</li>
                    <li>⚙️ Process</li>
                    <li>🗄️ Data Store</li>
                    <li>➡️ Data Flow</li>
                    <li>🔒 Trust Boundary</li>
                  </ul>
                </div>
              </div>
            </div>
          );
        }
        return (
          <PropertiesPanel
            element={selectedElement}
            onElementUpdate={onElementUpdate}
            onThreatUpdate={onThreatUpdate}
            onElementDelete={onElementDelete}
          />
        );
      
      case 'threat-actors':
        return (
          <ThreatActorsPanel
            threatActors={threatActors}
            onThreatActorsChange={onThreatActorsChange}
          />
        );
      
      case 'action-items':
        return (
          <ActionItemsPanel
            elements={elements}
            onThreatUpdate={onThreatUpdate}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="right-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          <span className="tab-icon">📝</span>
          <span className="tab-label">Properties</span>
          {selectedElement && <span className="tab-indicator">●</span>}
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'threat-actors' ? 'active' : ''}`}
          onClick={() => setActiveTab('threat-actors')}
        >
          <span className="tab-icon">🦹</span>
          <span className="tab-label">Threat Actors</span>
          {threatActors.length > 0 && (
            <span className="tab-count">({threatActors.length})</span>
          )}
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'action-items' ? 'active' : ''}`}
          onClick={() => setActiveTab('action-items')}
        >
          <span className="tab-icon">📋</span>
          <span className="tab-label">Action Items</span>
          {(() => {
            const actionItemsCount = elements.reduce((count, element) => {
              return count + element.threats.filter(threat => threat.isActionItem).length;
            }, 0);
            return actionItemsCount > 0 ? (
              <span className="tab-count">({actionItemsCount})</span>
            ) : null;
          })()}
        </button>
      </div>

      <div className="sidebar-content">
        {renderTabContent()}
      </div>
    </div>
  );
};