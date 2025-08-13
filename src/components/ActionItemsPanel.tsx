import React, { useState, useMemo } from 'react';
import { DiagramElement, Threat, ThreatSeverity, SEVERITY_LEVELS, STRIDE_CATEGORIES } from '../types/diagram';
import './ActionItemsPanel.css';

interface ActionItemsPanelProps {
  elements: DiagramElement[];
  onThreatUpdate: (elementId: string, threats: Threat[]) => void;
}

interface ActionItem {
  threat: Threat;
  elementId: string;
  elementName: string;
  elementType: string;
}

export const ActionItemsPanel: React.FC<ActionItemsPanelProps> = ({
  elements,
  onThreatUpdate
}) => {
  const [sortBy, setSortBy] = useState<'severity' | 'element' | 'stride'>('severity');
  const [filterSeverity, setFilterSeverity] = useState<ThreatSeverity | 'all'>('all');

  // Extract all action items from elements
  const actionItems = useMemo(() => {
    const items: ActionItem[] = [];
    
    elements.forEach(element => {
      element.threats
        .filter(threat => threat.isActionItem)
        .forEach(threat => {
          items.push({
            threat,
            elementId: element.id,
            elementName: element.name,
            elementType: element.type
          });
        });
    });

    return items;
  }, [elements]);

  // Filter and sort action items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = actionItems;

    // Filter by severity
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(item => item.threat.severity === filterSeverity);
    }

    // Sort items
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          return SEVERITY_LEVELS[b.threat.severity].score - SEVERITY_LEVELS[a.threat.severity].score;
        case 'element':
          return a.elementName.localeCompare(b.elementName);
        case 'stride':
          return a.threat.strideCategory.localeCompare(b.threat.strideCategory);
        default:
          return 0;
      }
    });
  }, [actionItems, sortBy, filterSeverity]);

  // Get severity stats
  const severityStats = useMemo(() => {
    return actionItems.reduce((stats, item) => {
      stats[item.threat.severity] = (stats[item.threat.severity] || 0) + 1;
      return stats;
    }, {} as Record<ThreatSeverity, number>);
  }, [actionItems]);

  const handleToggleActionItem = (elementId: string, threatId: string, isActionItem: boolean) => {
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    const updatedThreats = element.threats.map(threat =>
      threat.id === threatId ? { ...threat, isActionItem } : threat
    );

    onThreatUpdate(elementId, updatedThreats);
  };

  const getElementIcon = (elementType: string) => {
    const icons: Record<string, string> = {
      'external-entity': '👤',
      'process': '⚙️',
      'data-store': '🗄️',
      'data-flow': '➡️',
      'trust-boundary': '🔒'
    };
    return icons[elementType] || '📄';
  };

  return (
    <div className="action-items-panel">
      <div className="panel-header">
        <h3>Action Items</h3>
        <div className="action-items-count">
          {actionItems.length} total
        </div>
      </div>

      {actionItems.length === 0 ? (
        <div className="no-action-items">
          <div className="no-items-icon">📋</div>
          <h4>No Action Items</h4>
          <p>Mark threats as action items to track them here.</p>
          <div className="help-text">
            <strong>How to add action items:</strong>
            <ol>
              <li>Select an element in the diagram</li>
              <li>Go to the "Threats" tab in Properties</li>
              <li>Check "Mark as Action Item" for any threat</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          <div className="action-items-stats">
            <div className="stats-grid">
              <div className="stat-item critical">
                <span className="stat-number">{severityStats.critical || 0}</span>
                <span className="stat-label">Critical</span>
              </div>
              <div className="stat-item high">
                <span className="stat-number">{severityStats.high || 0}</span>
                <span className="stat-label">High</span>
              </div>
              <div className="stat-item medium">
                <span className="stat-number">{severityStats.medium || 0}</span>
                <span className="stat-label">Medium</span>
              </div>
              <div className="stat-item low">
                <span className="stat-number">{severityStats.low || 0}</span>
                <span className="stat-label">Low</span>
              </div>
            </div>
          </div>

          <div className="action-items-controls">
            <div className="control-group">
              <label>Sort by:</label>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="form-select"
              >
                <option value="severity">Severity</option>
                <option value="element">Element</option>
                <option value="stride">STRIDE Category</option>
              </select>
            </div>

            <div className="control-group">
              <label>Filter:</label>
              <select 
                value={filterSeverity} 
                onChange={(e) => setFilterSeverity(e.target.value as typeof filterSeverity)}
                className="form-select"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="action-items-list">
            {filteredAndSortedItems.map((item) => (
              <div key={`${item.elementId}-${item.threat.id}`} className="action-item">
                <div className="action-item-header">
                  <div className="item-info">
                    <span className="element-badge">
                      {getElementIcon(item.elementType)} {item.elementName}
                    </span>
                    <span className={`severity-badge severity-${item.threat.severity}`}>
                      {SEVERITY_LEVELS[item.threat.severity].name}
                    </span>
                    <span className="stride-badge">
                      {STRIDE_CATEGORIES[item.threat.strideCategory].icon} {STRIDE_CATEGORIES[item.threat.strideCategory].name}
                    </span>
                  </div>
                  <button
                    className="remove-action-item"
                    onClick={() => handleToggleActionItem(item.elementId, item.threat.id, false)}
                    title="Remove from action items"
                  >
                    ❌
                  </button>
                </div>

                <div className="action-item-content">
                  <h4 className="threat-title">{item.threat.title}</h4>
                  <p className="threat-description">{item.threat.description}</p>
                  
                  {item.threat.controls.length > 0 && (
                    <div className="threat-controls">
                      <h5>Security Controls:</h5>
                      <div className="controls-list">
                        {item.threat.controls.map(control => (
                          <div key={control.id} className="control-item">
                            <span className={`control-status ${control.implemented ? 'implemented' : 'pending'}`}>
                              {control.implemented ? '✅' : '⏳'}
                            </span>
                            <span className="control-name">{control.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};