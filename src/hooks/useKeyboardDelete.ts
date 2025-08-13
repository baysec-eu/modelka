import { useEffect } from 'react';
import { DiagramElement } from '../types/diagram';

export default function useKeyboardDelete(
  selected: DiagramElement | null,
  remove: (id: string) => void
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete') &&
        selected
      ) {
        e.preventDefault();
        remove(selected.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, remove]);
}
