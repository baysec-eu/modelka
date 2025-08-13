import { useState, useCallback } from 'react';
import { StorageService } from '../services/storageService';
import { DiagramElement, STRIDEElementType, ThreatActor } from '../types/diagram';
import { ServerlessWebRTC } from '../services/serverlessWebRTC';

export interface AppState {
  elements: DiagramElement[];
  selectedElement: DiagramElement | null;
  users: Array<{ id: string; cursor?: { x: number; y: number }; color: string; name?: string }>;
  connectionMode: boolean;
  connectionStart: DiagramElement | null;
  threatActors: ThreatActor[];
}

interface UseDiagramReturn {
  state: AppState;
  /* element crud */
  addElement: (type: STRIDEElementType, pos: { x: number; y: number }) => void;
  selectElement: (el: DiagramElement | null) => void;
  toggleConnectionMode: () => void;
  /* mutations */
  updateElements: (els: DiagramElement[]) => void;
  updateThreatActors: (a: ThreatActor[]) => void;
  /* IO helpers */
  handleImport: (file: File) => void;
  exportPNG: () => void;
  exportSVG: () => void;
  exportJSON: () => void;
}

export default function useDiagram(rtc?: ServerlessWebRTC): UseDiagramReturn {
  const [state, setState] = useState<AppState>({
    elements: [],
    selectedElement: null,
    users: [],
    connectionMode: false,
    connectionStart: null,
    threatActors: []
  });

  /* ---------- helpers ---------- */

  const broadcast = useCallback(
    (payload: any) => rtc?.send('diagram_update', payload),
    [rtc]
  );

  const updateElements = useCallback(
    (elements: DiagramElement[]) => {
      setState(s => ({ ...s, elements }));
      StorageService.autoSaveSoloSession(elements, state.threatActors);
      broadcast({ elements, threatActors: state.threatActors });
    },
    [state.threatActors, broadcast]
  );

  const updateThreatActors = useCallback(
    (actors: ThreatActor[]) => {
      setState(s => ({ ...s, threatActors: actors }));
      StorageService.autoSaveSoloSession(state.elements, actors);
      broadcast({ elements: state.elements, threatActors: actors });
    },
    [state.elements, broadcast]
  );

  /* ---------- element helpers ---------- */

  const addElement = (type: STRIDEElementType, pos: { x: number; y: number }) => {
    const el: DiagramElement = {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      name: `New ${type}`,
      position: pos,
      size: { width: 120, height: 80 },
      threats: [],
      technologies: [],
      notes: '',
      description: '',
      assets: []
    };
    updateElements([...state.elements, el]);
  };

  const selectElement = (el: DiagramElement | null) =>
    setState(s => ({ ...s, selectedElement: el }));

  const toggleConnectionMode = () =>
    setState(s => ({
      ...s,
      connectionMode: !s.connectionMode,
      connectionStart: null,
      selectedElement: null
    }));

  /* ---------- import / export ---------- */

  const handleImport = (file: File) => {
    if (file.type !== 'application/json') return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result as string);
        if (data.elements) updateElements(data.elements);
        if (data.threatActors) updateThreatActors(data.threatActors);
      } catch {
        alert('Invalid JSON');
      }
    };
    fr.readAsText(file);
  };

  const runExport = (fn: string) => (window as any).modelkaExport?.[fn]?.();

  const exportPNG = () => runExport('png');
  const exportSVG = () => runExport('svg');
  const exportJSON = () => runExport('json');

  /* ---------- return ---------- */
  return {
    state,
    addElement,
    selectElement,
    toggleConnectionMode,
    updateElements,
    updateThreatActors,
    handleImport,
    exportPNG,
    exportSVG,
    exportJSON,
  };
}
