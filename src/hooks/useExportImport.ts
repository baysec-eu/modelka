import { useCallback } from 'react';
import { DiagramElement, ThreatActor } from '../types/diagram';
import { HTMLReportGenerator } from '../services/htmlReportGenerator';

/** PNG / SVG export helpers rely on STRIDECanvas attaching `window.modelkaExport` */
declare global {
  interface Window {
    modelkaExport?: {
      png: () => void;
      getCanvasDataURL: () => string | null;
      // svg: removed as requested
      json: () => void;
    };
  }
}

export default function useExportImport(
  getState: () => { elements: DiagramElement[]; threatActors: ThreatActor[] },
  onLoad: (els: DiagramElement[], ths: ThreatActor[]) => void,
  getCanvasDataURL?: () => string | null
) {
  /* ---------- export ---------- */
  const handleExport = useCallback(
    (fmt: 'png' | 'json' | 'html') => {
      if (fmt === 'json') {
        // Handle JSON export directly
        const state = getState();
        const blob = new Blob([JSON.stringify(state, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `modelka-diagram-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
      
      if (fmt === 'html') {
        // Generate HTML threat report with diagram screenshot
        handleHTMLExport();
        return;
      }
      
      // For PNG, try to use the canvas export if available
      if (window.modelkaExport?.[fmt]) {
        window.modelkaExport[fmt]();
      } else {
        alert(`${fmt.toUpperCase()} export is not yet available`);
      }
    },
    [getState, getCanvasDataURL]
  );

  /* ---------- HTML export ---------- */
  const handleHTMLExport = useCallback(async () => {
    try {
      const state = getState();
      const canvasDataURL = getCanvasDataURL ? getCanvasDataURL() : null;
      
      const generator = new HTMLReportGenerator();
      const htmlContent = await generator.generateThreatReport(
        state.elements,
        state.threatActors,
        canvasDataURL || undefined,
        {
          projectName: 'Security Architecture Model',
          reportTitle: 'Threat Modeling Report',
          includeScreenshot: !!canvasDataURL,
          includeThreatAnalysis: true,
          includeAssetInventory: true,
          includeRecommendations: true
        }
      );
      
      // Download the HTML
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `threat-model-report-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to generate HTML report:', error);
      alert('Failed to generate HTML report. Please try again.');
    }
  }, [getState, getCanvasDataURL]);

  /* ---------- import ---------- */
  const handleImport = useCallback(
    (file: File) => {
      if (file.type !== 'application/json') return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);
          onLoad(data.elements ?? [], data.threatActors ?? []);
        } catch {
          alert('Invalid JSON – import aborted');
        }
      };
      reader.readAsText(file);
    },
    [onLoad]
  );

  return { handleExport, handleImport };
}
