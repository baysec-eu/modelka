// src/hooks/useDiagramState.ts
import { useState, useCallback, useRef } from 'react';
import { DiagramElement, ThreatActor } from '../types/diagram';

export interface DiagramState {
  elements: DiagramElement[];
  threatActors: ThreatActor[];
  selectedElement: DiagramElement | null;
  connectionMode: boolean;
  connectionStart: DiagramElement | null;
}

export interface DiagramActions {
  addElement: (type: string, pos: { x: number; y: number }) => void;
  removeElement: (elementId: string) => void;
  selectElement: (el: DiagramElement | null) => void;
  toggleConnectionMode: () => void;
  updateElements: (
    els: DiagramElement[],
    opts?: { broadcast?: boolean }
  ) => void;
  updateThreatActors: (
    ths: ThreatActor[],
    opts?: { broadcast?: boolean }
  ) => void;
  /**
   * Apply a full state update from a remote peer
   * without re-broadcasting it.
   */
  applyRemote: (payload: {
    elements: DiagramElement[];
    threatActors: ThreatActor[];
  }) => void;
}

/**
 * A custom hook that keeps track of diagram state,
 * and only calls `broadcastFn(payload)` when `broadcast: true`
 * AND this change was not just applied from a remote update.
 */
export default function useDiagramState(
  broadcastFn?: (payload: any) => void
): [DiagramState, DiagramActions] {
  const [elements, setElements] = useState<DiagramElement[]>([]);
  const [threatActors, setThreatActors] = useState<ThreatActor[]>([]);
  const [selectedElement, setSelectedElement] = useState<DiagramElement | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState<DiagramElement | null>(null);

  // Flag to avoid echoing remote updates back out
  const applyingRemote = useRef(false);

  // Helper to persist and broadcast
  const persist = useCallback(
    (els: DiagramElement[], ths: ThreatActor[], doBroadcast = true) => {
      if (doBroadcast && !applyingRemote.current && broadcastFn) {
        broadcastFn({ elements: els, threatActors: ths });
      }
    },
    [broadcastFn]
  );

  const updateElements = useCallback(
    (els: DiagramElement[], opts: { broadcast?: boolean } = {}) => {
      setElements(els);
      persist(els, threatActors, opts.broadcast ?? true);
    },
    [persist, threatActors]
  );

  const updateThreatActors = useCallback(
    (ths: ThreatActor[], opts: { broadcast?: boolean } = {}) => {
      setThreatActors(ths);
      persist(elements, ths, opts.broadcast ?? true);
    },
    [persist, elements]
  );

  const addElement = useCallback(
    (type: string, pos: { x: number; y: number }) => {
      const newEl: DiagramElement = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: type as any,
        name: `New ${type}`,
        position: pos,
        size: { width: 120, height: 80 },
        threats: [],
        technologies: [],
        notes: '',
        description: '',
        assets: []
      };
      updateElements([...elements, newEl]);
    },
    [elements, updateElements]
  );

  const removeElement = useCallback(
    (elementId: string) => {
      // Remove the element and any connected data flows
      const updatedElements = elements.filter(el => {
        // Remove the selected element
        if (el.id === elementId) return false;
        
        // Remove any data flows connected to this element
        if (el.type === 'data-flow' && 
           (el.sourceId === elementId || el.targetId === elementId)) {
          return false;
        }
        
        return true;
      });
      
      updateElements(updatedElements);
      
      // Clear selection if we just deleted the selected element
      if (selectedElement?.id === elementId) {
        setSelectedElement(null);
      }
    },
    [elements, updateElements, selectedElement]
  );

  const toggleConnectionMode = useCallback(() => {
    setConnectionMode((v) => !v);
    setConnectionStart(null);
    setSelectedElement(null);
  }, []);

  /**
   * Apply a full state update from a remote peer
   * without re-broadcasting it.
   */
  const applyRemote = useCallback(
    (payload: { elements: DiagramElement[]; threatActors: ThreatActor[] }) => {
      applyingRemote.current = true;
      updateElements(payload.elements, { broadcast: false });
      updateThreatActors(payload.threatActors, { broadcast: false });
      applyingRemote.current = false;
    },
    [updateElements, updateThreatActors]
  );

  return [
    {
      elements,
      threatActors,
      selectedElement,
      connectionMode,
      connectionStart
    },
    {
      addElement,
      removeElement,
      selectElement: setSelectedElement,
      toggleConnectionMode,
      updateElements,
      updateThreatActors,
      applyRemote
    }
  ];
}
