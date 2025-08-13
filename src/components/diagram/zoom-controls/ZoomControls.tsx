import React from 'react';
import './ZoomControls.css';

interface ZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

/**
 * Zoom controls UI for STRIDECanvas, displaying current zoom level and providing buttons.
 */
export const ZoomControls: React.FC<ZoomControlsProps> = ({ scale, onZoomIn, onZoomOut, onReset }) => {
  return (
    <div className="zoom-controls">
      <button className="zoom-btn" onClick={onZoomIn} title="Zoom in">🔍+</button>
      <span className="zoom-level">{Math.round(scale * 100)}%</span>
      <button className="zoom-btn" onClick={onZoomOut} title="Zoom out">🔍-</button>
      <button className="zoom-btn" onClick={onReset} title="Reset zoom">⌂</button>
    </div>
  );
};
