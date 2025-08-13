import React from 'react';
import './ContextMenu.css';
import { STRIDEElementType, ELEMENT_CONFIGS } from '../../../types/diagram';

interface ContextMenuProps {
  x: number;
  y: number;
  onSelect: (type: STRIDEElementType) => void;
  onClose: () => void;
}

/**
 * Renders a right-click context menu for adding new STRIDE elements.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onSelect, onClose }) => {
  const types: STRIDEElementType[] = [
    'external-entity',
    'process',
    'data-store',
    'trust-boundary'
  ];

  return (
    <ul
      className="diagram-context-menu"
      style={{ top: y, left: x, position: 'absolute', zIndex: 1000 }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {types.map(type => (
        <li
          key={type}
          className="context-menu-item"
          onClick={() => { onSelect(type); onClose(); }}
        >
          {ELEMENT_CONFIGS[type].icon} {ELEMENT_CONFIGS[type].name}
        </li>
      ))}
    </ul>
  );
};