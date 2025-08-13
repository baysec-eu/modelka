import React, { useState } from 'react';
import { ThreatActor } from '../types/diagram';
import './ThreatActorsPanel.css';

interface ThreatActorsPanelProps {
  threatActors: ThreatActor[];
  onThreatActorsChange: (threatActors: ThreatActor[]) => void;
}

export const ThreatActorsPanel: React.FC<ThreatActorsPanelProps> = ({
  threatActors,
  onThreatActorsChange
}) => {
  const [selectedActor, setSelectedActor] = useState<ThreatActor | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleAddThreatActor = () => {
    const newActor: ThreatActor = {
      id: `actor-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      name: 'New Threat Actor',
      type: 'outsider',
      skill: 'medium',
      motivation: 'Financial gain',
      description: 'A threat actor targeting the system for monetary benefits.',
      capabilities: ['Social Engineering', 'Basic Technical Skills']
    };

    const updatedActors = [...threatActors, newActor];
    onThreatActorsChange(updatedActors);
    setSelectedActor(newActor);
    setIsEditing(true);
  };

  const handleUpdateThreatActor = (updatedActor: ThreatActor) => {
    const updatedActors = threatActors.map(actor =>
      actor.id === updatedActor.id ? updatedActor : actor
    );
    onThreatActorsChange(updatedActors);
    setSelectedActor(updatedActor);
  };

  const handleDeleteThreatActor = (actorId: string) => {
    if (confirm('Are you sure you want to delete this threat actor?')) {
      const updatedActors = threatActors.filter(actor => actor.id !== actorId);
      onThreatActorsChange(updatedActors);
      if (selectedActor?.id === actorId) {
        setSelectedActor(null);
        setIsEditing(false);
      }
    }
  };

  const handleCapabilityAdd = (capability: string) => {
    if (selectedActor && capability.trim() && !selectedActor.capabilities.includes(capability.trim())) {
      const updatedActor = {
        ...selectedActor,
        capabilities: [...selectedActor.capabilities, capability.trim()]
      };
      handleUpdateThreatActor(updatedActor);
    }
  };

  const handleCapabilityRemove = (capability: string) => {
    if (selectedActor) {
      const updatedActor = {
        ...selectedActor,
        capabilities: selectedActor.capabilities.filter(cap => cap !== capability)
      };
      handleUpdateThreatActor(updatedActor);
    }
  };

  const getActorTypeIcon = (type: ThreatActor['type']) => {
    const icons = {
      insider: '🏢',
      outsider: '🌍',
      'nation-state': '🏛️',
      criminal: '🦹',
      hacktivist: '✊',
      competitor: '🏢',
      other: '❓'
    };
    return icons[type];
  };

  const getSkillLevelColor = (skill: ThreatActor['skill']) => {
    const colors = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#fd7e14',
      expert: '#dc3545'
    };
    return colors[skill];
  };

  return (
    <div className="threat-actors-panel">
      <div className="panel-header">
        <h3>🦹 Threat Actors ({threatActors.length})</h3>
        <button className="btn btn-primary btn-sm" onClick={handleAddThreatActor}>
          + Add Actor
        </button>
      </div>

      <div className="actors-layout">
        <div className="actors-list">
          {threatActors.map(actor => (
            <div
              key={actor.id}
              className={`actor-item ${selectedActor?.id === actor.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedActor(actor);
                setIsEditing(false);
              }}
            >
              <div className="actor-header">
                <span className="actor-icon">{getActorTypeIcon(actor.type)}</span>
                <span className="actor-name">{actor.name}</span>
                <span 
                  className="skill-badge"
                  style={{ backgroundColor: getSkillLevelColor(actor.skill) }}
                >
                  {actor.skill}
                </span>
              </div>
              <div className="actor-type">{actor.type.replace('-', ' ')}</div>
              <button
                className="delete-actor-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteThreatActor(actor.id);
                }}
                title="Delete threat actor"
              >
                🗑️
              </button>
            </div>
          ))}

          {threatActors.length === 0 && (
            <div className="empty-state">
              <p>No threat actors defined yet.</p>
              <p>Click "Add Actor" to create your first threat actor.</p>
            </div>
          )}
        </div>

        {selectedActor && (
          <div className="actor-details">
            <div className="details-header">
              <h4>{selectedActor.name}</h4>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? '👁️ View' : '✏️ Edit'}
              </button>
            </div>

            {isEditing ? (
              <div className="actor-form">
                <div className="form-group">
                  <label>Actor Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={selectedActor.name}
                    onChange={(e) => handleUpdateThreatActor({
                      ...selectedActor,
                      name: e.target.value
                    })}
                  />
                </div>

                <div className="form-group">
                  <label>Actor Type</label>
                  <select
                    className="form-select"
                    value={selectedActor.type}
                    onChange={(e) => handleUpdateThreatActor({
                      ...selectedActor,
                      type: e.target.value as ThreatActor['type']
                    })}
                  >
                    <option value="insider">Insider</option>
                    <option value="outsider">Outsider</option>
                    <option value="nation-state">Nation State</option>
                    <option value="criminal">Criminal</option>
                    <option value="hacktivist">Hacktivist</option>
                    <option value="competitor">Competitor</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Skill Level</label>
                  <select
                    className="form-select"
                    value={selectedActor.skill}
                    onChange={(e) => handleUpdateThreatActor({
                      ...selectedActor,
                      skill: e.target.value as ThreatActor['skill']
                    })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Motivation</label>
                  <input
                    type="text"
                    className="form-input"
                    value={selectedActor.motivation}
                    onChange={(e) => handleUpdateThreatActor({
                      ...selectedActor,
                      motivation: e.target.value
                    })}
                    placeholder="e.g., Financial gain, Espionage, Disruption"
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={selectedActor.description}
                    onChange={(e) => handleUpdateThreatActor({
                      ...selectedActor,
                      description: e.target.value
                    })}
                    placeholder="Describe the threat actor's background, objectives, and typical attack patterns..."
                  />
                </div>

                <div className="form-group">
                  <label>Capabilities</label>
                  <div className="capabilities-list">
                    {selectedActor.capabilities.map((capability, index) => (
                      <div key={index} className="capability-item">
                        <span>{capability}</span>
                        <button
                          className="remove-capability-btn"
                          onClick={() => handleCapabilityRemove(capability)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="add-capability">
                    <input
                      type="text"
                      placeholder="Add new capability..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleCapabilityAdd(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="actor-view">
                <div className="actor-overview">
                  <div className="overview-item">
                    <strong>Type:</strong> {getActorTypeIcon(selectedActor.type)} {selectedActor.type.replace('-', ' ')}
                  </div>
                  <div className="overview-item">
                    <strong>Skill Level:</strong> 
                    <span 
                      className="skill-badge inline"
                      style={{ backgroundColor: getSkillLevelColor(selectedActor.skill) }}
                    >
                      {selectedActor.skill}
                    </span>
                  </div>
                  <div className="overview-item">
                    <strong>Motivation:</strong> {selectedActor.motivation}
                  </div>
                </div>

                <div className="description-section">
                  <h5>Description</h5>
                  <p>{selectedActor.description}</p>
                </div>

                <div className="capabilities-section">
                  <h5>Capabilities ({selectedActor.capabilities.length})</h5>
                  <div className="capabilities-view">
                    {selectedActor.capabilities.map((capability, index) => (
                      <span key={index} className="capability-tag">
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};