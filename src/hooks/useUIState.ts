// src/hooks/useUIState.ts - Pure UI state management hooks
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
// Pure UI state management hooks

/**
 * Hook for managing canvas UI state (zoom, pan, selection)
 */
export const useCanvasUIState = () => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handlePanStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  }, [position]);

  const handlePanMove = useCallback((clientX: number, clientY: number) => {
    if (isDragging) {
      setPosition({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handlePanEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return {
    scale,
    position,
    isDragging,
    setScale,
    setPosition,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
  };
};

/**
 * Hook for managing form state
 */
export const useFormState = <T extends Record<string, any>>(initialState: T) => {
  const [formData, setFormData] = useState<T>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isDirty, setIsDirty] = useState(false);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // Clear error when field is updated
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const setFieldError = useCallback(<K extends keyof T>(field: K, error: string) => {
    setErrors(prev => ({ ...prev, [field]: error }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialState);
    setErrors({});
    setIsDirty(false);
  }, [initialState]);

  const hasErrors = useMemo(() => {
    return Object.values(errors).some(error => !!error);
  }, [errors]);

  return {
    formData,
    errors,
    isDirty,
    hasErrors,
    updateField,
    setFieldError,
    clearErrors,
    resetForm,
    setFormData,
  };
};

/**
 * Hook for managing modal/dialog state
 */
export const useModalState = (initialOpen = false) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const toggleModal = useCallback(() => setIsOpen(prev => !prev), []);

  return {
    isOpen,
    openModal,
    closeModal,
    toggleModal,
  };
};

/**
 * Hook for managing loading states with automatic timeout
 */
export const useLoadingState = (timeout = 30000) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    // Set timeout to prevent infinite loading
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      setError('Operation timed out');
    }, timeout);
  }, [timeout]);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const setLoadingError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    stopLoading();
  }, [stopLoading]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    setLoadingError,
  };
};

/**
 * Hook for managing drag and drop state
 */
export const useDragDropState = () => {
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const startDrag = useCallback((item: any, offset: { x: number; y: number }) => {
    setDraggedItem(item);
    setDragOffset(offset);
  }, []);

  const updateDropTarget = useCallback((targetId: string | null) => {
    setDropTarget(targetId);
  }, []);

  const endDrag = useCallback(() => {
    setDraggedItem(null);
    setDropTarget(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  const isDragging = useMemo(() => !!draggedItem, [draggedItem]);

  return {
    draggedItem,
    dropTarget,
    dragOffset,
    isDragging,
    startDrag,
    updateDropTarget,
    endDrag,
  };
};

/**
 * Hook for managing context menu state
 */
export const useContextMenuState = () => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target?: any;
  } | null>(null);

  const showContextMenu = useCallback((x: number, y: number, target?: any) => {
    setContextMenu({ x, y, target });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => hideContextMenu();
    
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, hideContextMenu]);

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu,
  };
};

/**
 * Hook for managing selection state with multi-select
 */
export const useSelectionState = <T extends { id: string }>() => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const selectItem = useCallback((itemId: string, multiSelect = false) => {
    if (multiSelect) {
      setSelectedItems(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(itemId)) {
          newSelection.delete(itemId);
        } else {
          newSelection.add(itemId);
        }
        return newSelection;
      });
    } else {
      setSelectedItems(new Set([itemId]));
    }
    setLastSelected(itemId);
  }, []);

  const selectRange = useCallback((items: T[], startId: string, endId: string) => {
    const startIndex = items.findIndex(item => item.id === startId);
    const endIndex = items.findIndex(item => item.id === endId);
    
    if (startIndex !== -1 && endIndex !== -1) {
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);
      const rangeIds = items.slice(start, end + 1).map(item => item.id);
      
      setSelectedItems(prev => {
        const newSelection = new Set(prev);
        rangeIds.forEach(id => newSelection.add(id));
        return newSelection;
      });
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
    setLastSelected(null);
  }, []);

  const isSelected = useCallback((itemId: string) => {
    return selectedItems.has(itemId);
  }, [selectedItems]);

  const selectedCount = useMemo(() => selectedItems.size, [selectedItems]);
  
  const selectedIds = useMemo(() => Array.from(selectedItems), [selectedItems]);

  return {
    selectedItems: selectedIds,
    lastSelected,
    selectedCount,
    selectItem,
    selectRange,
    clearSelection,
    isSelected,
  };
};

/**
 * Hook for debouncing values
 */
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Hook for managing viewport intersection (for virtualization)
 */
export const useIntersectionObserver = (
  targetRef: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!targetRef.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(targetRef.current);

    return () => {
      observer.disconnect();
    };
  }, [targetRef, options]);

  return isIntersecting;
};