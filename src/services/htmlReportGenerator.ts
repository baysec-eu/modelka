// src/services/htmlReportGenerator.ts - HTML threat report generation
import { DiagramElement, ThreatActor, Threat, ThreatSeverity, Asset } from '../types/diagram';

export interface ReportOptions {
  includeScreenshot?: boolean;
  includeThreatAnalysis?: boolean;
  includeAssetInventory?: boolean;
  includeRecommendations?: boolean;
  projectName?: string;
  reportTitle?: string;
}

export class HTMLReportGenerator {
  /**
   * Generate comprehensive threat modeling report as HTML
   */
  generateThreatReport(
    elements: DiagramElement[],
    threatActors: ThreatActor[],
    canvasDataURL?: string,
    options: ReportOptions = {}
  ): string {
    const {
      includeScreenshot = true,
      includeThreatAnalysis = true,
      includeAssetInventory = true,
      includeRecommendations = true,
      projectName = 'Security Architecture',
      reportTitle = 'Threat Modeling Report'
    } = options;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
  <style>
    ${this.getCSS()}
  </style>
</head>
<body>
  <!-- Title Page -->
  <div class="page title-page">
    <div class="title-content">
      <h1>${reportTitle}</h1>
      <h2>${projectName}</h2>
      <div class="generated-date">
        Generated: ${new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
      <div class="tool-info">Generated with Modelka Threat Modeling Tool</div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="page">
    ${this.generateExecutiveSummary(elements, threatActors)}
  </div>

  ${includeScreenshot && canvasDataURL ? `
  <!-- System Architecture Diagram -->
  <div class="page">
    <h1>System Architecture Diagram</h1>
    <div class="diagram-container">
      <img src="${canvasDataURL}" alt="System Architecture Diagram" class="diagram-image" />
    </div>
  </div>
  ` : ''}

  <!-- System Components -->
  <div class="page">
    ${this.generateSystemComponents(elements)}
  </div>

  ${includeThreatAnalysis ? `
  <!-- Threat Analysis -->
  <div class="page">
    ${this.generateThreatAnalysis(elements, threatActors)}
  </div>
  ` : ''}

  ${includeAssetInventory ? `
  <!-- Asset Inventory -->
  <div class="page">
    ${this.generateAssetInventory(elements)}
  </div>
  ` : ''}

  ${includeRecommendations ? `
  <!-- Security Recommendations -->
  <div class="page">
    ${this.generateRecommendations(elements)}
  </div>
  ` : ''}

  <script>
    // Print-friendly behavior
    window.addEventListener('load', function() {
      // Optional: Auto-print when opened
      // window.print();
    });
  </script>
</body>
</html>`;

    return html;
  }

  private getCSS(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11pt;
        line-height: 1.6;
        color: #333;
        background: #fff;
      }

      .page {
        min-height: 100vh;
        padding: 1in;
        page-break-after: always;
        position: relative;
      }

      .page:last-child {
        page-break-after: avoid;
      }

      /* Title Page Styles */
      .title-page {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .title-content h1 {
        font-size: 24pt;
        font-weight: bold;
        margin-bottom: 20px;
        color: #2c3e50;
      }

      .title-content h2 {
        font-size: 18pt;
        font-weight: normal;
        margin-bottom: 40px;
        color: #34495e;
      }

      .generated-date {
        font-size: 12pt;
        margin-bottom: 20px;
        color: #7f8c8d;
      }

      .tool-info {
        position: absolute;
        bottom: 1in;
        left: 50%;
        transform: translateX(-50%);
        font-size: 10pt;
        color: #95a5a6;
      }

      /* Typography */
      h1 {
        font-size: 18pt;
        font-weight: bold;
        margin-bottom: 16px;
        color: #2c3e50;
        border-bottom: 2px solid #3498db;
        padding-bottom: 8px;
      }

      h2 {
        font-size: 14pt;
        font-weight: bold;
        margin: 20px 0 12px 0;
        color: #34495e;
      }

      h3 {
        font-size: 12pt;
        font-weight: bold;
        margin: 16px 0 8px 0;
        color: #2c3e50;
      }

      p {
        margin-bottom: 12px;
        text-align: justify;
      }

      ul, ol {
        margin-left: 20px;
        margin-bottom: 12px;
      }

      li {
        margin-bottom: 4px;
      }

      /* Tables */
      .component-table,
      .threat-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 10pt;
      }

      .component-table th,
      .component-table td,
      .threat-table th,
      .threat-table td {
        border: 1px solid #bdc3c7;
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }

      .component-table th,
      .threat-table th {
        background-color: #ecf0f1;
        font-weight: bold;
        color: #2c3e50;
      }

      .component-table tr:nth-child(even),
      .threat-table tr:nth-child(even) {
        background-color: #f8f9fa;
      }

      /* Severity Indicators */
      .severity-critical {
        background-color: #e74c3c !important;
        color: white;
        font-weight: bold;
        text-align: center;
      }

      .severity-high {
        background-color: #f39c12 !important;
        color: white;
        font-weight: bold;
        text-align: center;
      }

      .severity-medium {
        background-color: #f1c40f !important;
        color: #2c3e50;
        font-weight: bold;
        text-align: center;
      }

      .severity-low {
        background-color: #27ae60 !important;
        color: white;
        font-weight: bold;
        text-align: center;
      }

      /* Diagram Styles */
      .diagram-container {
        text-align: center;
        margin: 20px 0;
      }

      .diagram-image {
        max-width: 100%;
        max-height: 600px;
        border: 1px solid #bdc3c7;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }

      /* Component Type Indicators */
      .component-type {
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 9pt;
      }

      .type-process {
        background-color: #3498db;
        color: white;
      }

      .type-external-entity {
        background-color: #e74c3c;
        color: white;
      }

      .type-data-store {
        background-color: #27ae60;
        color: white;
      }

      .type-trust-boundary {
        background-color: #9b59b6;
        color: white;
      }

      .type-data-flow {
        background-color: #f39c12;
        color: white;
      }

      /* Summary Boxes */
      .summary-box {
        background-color: #ecf0f1;
        border-left: 4px solid #3498db;
        padding: 16px;
        margin: 16px 0;
      }

      .key-findings {
        background-color: #fff3cd;
        border-left: 4px solid #ffc107;
        padding: 16px;
        margin: 16px 0;
      }

      .critical-alert {
        background-color: #f8d7da;
        border-left: 4px solid #dc3545;
        padding: 16px;
        margin: 16px 0;
      }

      /* Print Styles */
      @media print {
        body {
          margin: 0;
          padding: 0;
        }

        .page {
          margin: 0;
          padding: 0.5in;
          page-break-after: always;
        }

        .page:last-child {
          page-break-after: avoid;
        }

        .title-page {
          page-break-after: always;
        }
      }

      /* Responsive for screen viewing */
      @media screen and (max-width: 768px) {
        .page {
          padding: 20px;
          min-height: auto;
        }

        .component-table,
        .threat-table {
          font-size: 9pt;
        }

        .component-table th,
        .component-table td,
        .threat-table th,
        .threat-table td {
          padding: 6px;
        }
      }
    `;
  }

  private generateExecutiveSummary(elements: DiagramElement[], threatActors: ThreatActor[]): string {
    const allThreats = this.getAllThreats(elements);
    const criticalThreats = allThreats.filter(t => t.severity === 'critical');
    const highThreats = allThreats.filter(t => t.severity === 'high');
    const totalElements = elements.filter(e => e.type !== 'data-flow').length;
    const dataFlows = elements.filter(e => e.type === 'data-flow').length;

    return `
      <h1>Executive Summary</h1>
      
      <div class="summary-box">
        <p>This report presents a comprehensive threat analysis of the <strong>${totalElements}</strong> system components and <strong>${dataFlows}</strong> data flows in the architecture.</p>
      </div>

      <div class="key-findings">
        <h3>KEY FINDINGS</h3>
        <ul>
          <li><strong>${criticalThreats.length}</strong> Critical threats identified</li>
          <li><strong>${highThreats.length}</strong> High-severity threats identified</li>
          <li><strong>${allThreats.length}</strong> Total threats across all components</li>
          <li><strong>${threatActors.length}</strong> Threat actors profiled</li>
        </ul>
      </div>

      ${criticalThreats.length > 0 ? `
      <div class="critical-alert">
        <h3>⚠️ IMMEDIATE ATTENTION REQUIRED</h3>
        <p><strong>${criticalThreats.length}</strong> critical threats require immediate remediation.</p>
      </div>
      ` : ''}
    `;
  }

  private generateSystemComponents(elements: DiagramElement[]): string {
    const processes = elements.filter(e => e.type === 'process');
    const externalEntities = elements.filter(e => e.type === 'external-entity');
    const dataStores = elements.filter(e => e.type === 'data-store');
    const trustBoundaries = elements.filter(e => e.type === 'trust-boundary');
    const dataFlows = elements.filter(e => e.type === 'data-flow');

    let html = '<h1>System Components</h1>';

    // Processes
    if (processes.length > 0) {
      html += `
        <h2>Processes (${processes.length})</h2>
        <table class="component-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Threats</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            ${processes.map(p => `
              <tr>
                <td><span class="component-type type-process">PROCESS</span><br/><strong>${p.name}</strong></td>
                <td>${p.description || 'No description provided'}</td>
                <td>${(p.threats || []).length} threats</td>
                <td>${(p.assets || []).length} assets</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // External Entities
    if (externalEntities.length > 0) {
      html += `
        <h2>External Entities (${externalEntities.length})</h2>
        <table class="component-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Threats</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            ${externalEntities.map(e => `
              <tr>
                <td><span class="component-type type-external-entity">EXTERNAL</span><br/><strong>${e.name}</strong></td>
                <td>${e.description || 'No description provided'}</td>
                <td>${(e.threats || []).length} threats</td>
                <td>${(e.assets || []).length} assets</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Data Stores
    if (dataStores.length > 0) {
      html += `
        <h2>Data Stores (${dataStores.length})</h2>
        <table class="component-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Threats</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            ${dataStores.map(ds => `
              <tr>
                <td><span class="component-type type-data-store">DATA STORE</span><br/><strong>${ds.name}</strong></td>
                <td>${ds.description || 'No description provided'}</td>
                <td>${(ds.threats || []).length} threats</td>
                <td>${(ds.assets || []).length} assets</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Trust Boundaries
    if (trustBoundaries.length > 0) {
      html += `
        <h2>Trust Boundaries (${trustBoundaries.length})</h2>
        <table class="component-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Threats</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            ${trustBoundaries.map(tb => `
              <tr>
                <td><span class="component-type type-trust-boundary">TRUST BOUNDARY</span><br/><strong>${tb.name}</strong></td>
                <td>${tb.description || 'No description provided'}</td>
                <td>${(tb.threats || []).length} threats</td>
                <td>${(tb.assets || []).length} assets</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Data Flows
    if (dataFlows.length > 0) {
      html += `
        <h2>Data Flows (${dataFlows.length})</h2>
        <table class="component-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Threats</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            ${dataFlows.map(df => `
              <tr>
                <td><span class="component-type type-data-flow">DATA FLOW</span><br/><strong>${df.name}</strong></td>
                <td>${df.description || 'No description provided'}</td>
                <td>${(df.threats || []).length} threats</td>
                <td>${(df.assets || []).length} assets</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    return html;
  }

  private generateThreatAnalysis(elements: DiagramElement[], threatActors: ThreatActor[]): string {
    const allThreats = this.getAllThreats(elements);
    const threatsBySeverity = this.groupThreatsBySeverity(allThreats);

    let html = '<h1>Threat Analysis</h1>';

    // Threats by severity
    for (const severity of ['critical', 'high', 'medium', 'low'] as ThreatSeverity[]) {
      const threats = threatsBySeverity[severity] || [];
      if (threats.length === 0) continue;

      html += `
        <h2>${severity.toUpperCase()} Severity Threats (${threats.length})</h2>
        <table class="threat-table">
          <thead>
            <tr>
              <th>Threat</th>
              <th>Component</th>
              <th>Severity</th>
              <th>STRIDE</th>
              <th>Description</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            ${threats.map(threat => {
              const component = elements.find(e => (e.threats || []).includes(threat));
              return `
                <tr>
                  <td><strong>${threat.title}</strong></td>
                  <td>${component ? component.name : 'Unknown'}</td>
                  <td><span class="severity-${threat.severity}">${threat.severity.toUpperCase()}</span></td>
                  <td>${threat.strideCategory}</td>
                  <td>${threat.description}</td>
                  <td>
                    ${threat.controls.length > 0 ? 
                      threat.controls.map(control => 
                        `<div>${control.implemented ? '✅' : '❌'} ${control.name}</div>`
                      ).join('') 
                      : 'No controls defined'
                    }
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    // Threat actors
    if (threatActors.length > 0) {
      html += `
        <h2>Threat Actor Profiles (${threatActors.length})</h2>
        <table class="threat-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Skill Level</th>
              <th>Motivation</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            ${threatActors.map(actor => `
              <tr>
                <td><strong>${actor.name}</strong></td>
                <td>${actor.type}</td>
                <td>${actor.skill}</td>
                <td>${actor.motivation}</td>
                <td>${actor.capabilities.join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    return html;
  }

  private generateAssetInventory(elements: DiagramElement[]): string {
    const allAssets = this.getAllAssets(elements);
    if (allAssets.length === 0) {
      return `
        <h1>Asset Inventory</h1>
        <p>No assets have been catalogued in this model.</p>
      `;
    }

    const assetsByValue = this.groupAssetsByValue(allAssets);

    let html = '<h1>Asset Inventory</h1>';

    for (const value of ['critical', 'high', 'medium', 'low'] as const) {
      const assets = assetsByValue[value] || [];
      if (assets.length === 0) continue;

      html += `
        <h2>${value.toUpperCase()} Value Assets (${assets.length})</h2>
        <table class="component-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Description</th>
              <th>Component</th>
            </tr>
          </thead>
          <tbody>
            ${assets.map(asset => {
              const component = elements.find(e => (e.assets || []).includes(asset));
              return `
                <tr>
                  <td><strong>${asset.name}</strong></td>
                  <td>${asset.type}</td>
                  <td>${asset.owner}</td>
                  <td>${asset.description}</td>
                  <td>${component ? component.name : 'Unknown'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    return html;
  }

  private generateRecommendations(elements: DiagramElement[]): string {
    const allThreats = this.getAllThreats(elements);
    const criticalThreats = allThreats.filter(t => t.severity === 'critical');
    const unmitigatedThreats = allThreats.filter(t => 
      t.controls.length === 0 || t.controls.every(c => !c.implemented)
    );

    let html = '<h1>Security Recommendations</h1>';

    if (criticalThreats.length > 0) {
      html += `
        <h2>⚠️ Immediate Action Items</h2>
        <div class="critical-alert">
          <p>The following critical threats require immediate attention:</p>
          <ul>
            ${criticalThreats.map(threat => `
              <li><strong>${threat.title}</strong> - ${threat.description.substring(0, 100)}${threat.description.length > 100 ? '...' : ''}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    if (unmitigatedThreats.length > 0) {
      html += `
        <h2>Unmitigated Threats</h2>
        <div class="key-findings">
          <p><strong>${unmitigatedThreats.length}</strong> threats lack adequate security controls:</p>
          <ul>
            ${unmitigatedThreats.slice(0, 15).map(threat => `
              <li><strong>${threat.title}</strong> (${threat.severity})</li>
            `).join('')}
            ${unmitigatedThreats.length > 15 ? `<li><em>... and ${unmitigatedThreats.length - 15} more</em></li>` : ''}
          </ul>
        </div>
      `;
    }

    html += `
      <h2>General Recommendations</h2>
      <ul>
        <li><strong>Implement security controls</strong> for all identified threats</li>
        <li><strong>Regular security assessments</strong> and penetration testing</li>
        <li><strong>Update threat model</strong> as the system evolves</li>
        <li><strong>Security awareness training</strong> for development teams</li>
        <li><strong>Implement defense-in-depth</strong> security architecture</li>
        <li><strong>Continuous monitoring</strong> and incident response capabilities</li>
        <li><strong>Security code reviews</strong> and secure development practices</li>
        <li><strong>Asset classification</strong> and data protection measures</li>
      </ul>
    `;

    return html;
  }

  // Utility methods
  private getAllThreats(elements: DiagramElement[]): Threat[] {
    return elements.flatMap(el => el.threats || []);
  }

  private getAllAssets(elements: DiagramElement[]): Asset[] {
    return elements.flatMap(el => el.assets || []);
  }

  private groupThreatsBySeverity(threats: Threat[]): Record<ThreatSeverity, Threat[]> {
    return threats.reduce((acc, threat) => {
      if (!acc[threat.severity]) acc[threat.severity] = [];
      acc[threat.severity].push(threat);
      return acc;
    }, {} as Record<ThreatSeverity, Threat[]>);
  }

  private groupAssetsByValue(assets: Asset[]): Record<string, Asset[]> {
    return assets.reduce((acc, asset) => {
      if (!acc[asset.value]) acc[asset.value] = [];
      acc[asset.value].push(asset);
      return acc;
    }, {} as Record<string, Asset[]>);
  }
}