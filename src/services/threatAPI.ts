import { Threat, SecurityControl, ThreatSeverity } from '../types/diagram';
import { v4 as uuidv4 } from 'uuid';

// Get API endpoint from environment variables (optional)
const THREAT_API_BASE_URL = (import.meta as any).env.VITE_THREAT_API_URL;

interface PredefinedThreat {
  title: string;
  description: string;
  severity: ThreatSeverity;
  strideCategory: 'spoofing' | 'tampering' | 'repudiation' | 'information-disclosure' | 'denial-of-service' | 'elevation-of-privilege';
  commonControls: Omit<SecurityControl, 'id'>[];
}

/**
 * Mock Threat Database
 * Simulates an API that returns predefined threats based on technologies
 */
const technologyThreats: Record<string, PredefinedThreat[]> = {
  'web-server': [
    {
      title: 'Web Server Spoofing',
      description: 'Attacker could spoof the web server identity using fake certificates or DNS poisoning',
      severity: 'high',
      strideCategory: 'spoofing',
      commonControls: [
        { name: 'TLS Certificate Validation', description: 'Implement proper certificate validation and pinning', implemented: false },
        { name: 'HSTS Headers', description: 'Use HTTP Strict Transport Security headers', implemented: false },
        { name: 'DNS Security', description: 'Use DNS over HTTPS (DoH) or DNS over TLS (DoT)', implemented: false }
      ]
    },
    {
      title: 'HTTP Tampering',
      description: 'HTTP requests/responses could be intercepted and modified in transit',
      severity: 'medium',
      strideCategory: 'tampering',
      commonControls: [
        { name: 'HTTPS Encryption', description: 'Use TLS 1.3 encryption for all communications', implemented: false },
        { name: 'Request Signing', description: 'Implement HMAC signing for critical operations', implemented: false },
        { name: 'Content Security Policy', description: 'Implement strict CSP headers', implemented: false }
      ]
    },
    {
      title: 'Information Disclosure',
      description: 'Sensitive information could be exposed through error messages, logs, or headers',
      severity: 'medium',
      strideCategory: 'information-disclosure',
      commonControls: [
        { name: 'Error Handling', description: 'Implement generic error messages without sensitive data', implemented: false },
        { name: 'Log Sanitization', description: 'Sanitize logs to prevent sensitive data exposure', implemented: false },
        { name: 'Security Headers', description: 'Remove server version and other identifying headers', implemented: false }
      ]
    },
    {
      title: 'Denial of Service',
      description: 'Server could be overwhelmed with requests leading to service unavailability',
      severity: 'high',
      strideCategory: 'denial-of-service',
      commonControls: [
        { name: 'Rate Limiting', description: 'Implement request rate limiting per IP/user', implemented: false },
        { name: 'Load Balancing', description: 'Distribute traffic across multiple servers', implemented: false },
        { name: 'DDoS Protection', description: 'Use cloud-based DDoS protection services', implemented: false }
      ]
    }
  ],

  database: [
    {
      title: 'SQL Injection',
      description: 'Malicious SQL code could be injected through user inputs',
      severity: 'critical',
      strideCategory: 'tampering',
      commonControls: [
        { name: 'Parameterized Queries', description: 'Use prepared statements and parameterized queries', implemented: false },
        { name: 'Input Validation', description: 'Validate and sanitize all user inputs', implemented: false },
        { name: 'Least Privilege', description: 'Database user should have minimal required permissions', implemented: false }
      ]
    },
    {
      title: 'Data Breach',
      description: 'Unauthorized access to sensitive data stored in the database',
      severity: 'critical',
      strideCategory: 'information-disclosure',
      commonControls: [
        { name: 'Data Encryption', description: 'Encrypt sensitive data at rest', implemented: false },
        { name: 'Access Controls', description: 'Implement role-based access controls', implemented: false },
        { name: 'Database Auditing', description: 'Enable comprehensive database activity logging', implemented: false }
      ]
    },
    {
      title: 'Privilege Escalation',
      description: 'Database user could gain elevated permissions through vulnerabilities',
      severity: 'high',
      strideCategory: 'elevation-of-privilege',
      commonControls: [
        { name: 'Principle of Least Privilege', description: 'Grant minimal necessary database permissions', implemented: false },
        { name: 'Regular Security Updates', description: 'Keep database software updated', implemented: false },
        { name: 'Database Hardening', description: 'Remove unnecessary features and services', implemented: false }
      ]
    }
  ],

  api: [
    {
      title: 'API Key Compromise',
      description: 'API keys could be exposed or stolen leading to unauthorized access',
      severity: 'high',
      strideCategory: 'spoofing',
      commonControls: [
        { name: 'Key Rotation', description: 'Regularly rotate API keys', implemented: false },
        { name: 'Secure Storage', description: 'Store keys in secure vaults or environment variables', implemented: false },
        { name: 'API Rate Limiting', description: 'Implement rate limiting per API key', implemented: false }
      ]
    },
    {
      title: 'Broken Authentication',
      description: 'Weak authentication mechanisms could allow unauthorized API access',
      severity: 'critical',
      strideCategory: 'elevation-of-privilege',
      commonControls: [
        { name: 'OAuth 2.0', description: 'Implement proper OAuth 2.0 authentication', implemented: false },
        { name: 'JWT Validation', description: 'Properly validate JWT tokens', implemented: false },
        { name: 'Multi-Factor Authentication', description: 'Require MFA for sensitive operations', implemented: false }
      ]
    },
    {
      title: 'Data Injection',
      description: 'Malicious data could be injected through API parameters',
      severity: 'high',
      strideCategory: 'tampering',
      commonControls: [
        { name: 'Input Validation', description: 'Validate all API inputs against schemas', implemented: false },
        { name: 'Output Encoding', description: 'Properly encode API responses', implemented: false },
        { name: 'Content Type Validation', description: 'Validate request content types', implemented: false }
      ]
    }
  ],

  'mobile-app': [
    {
      title: 'App Tampering',
      description: 'Mobile app binary could be reverse engineered or modified',
      severity: 'medium',
      strideCategory: 'tampering',
      commonControls: [
        { name: 'Code Obfuscation', description: 'Obfuscate application code', implemented: false },
        { name: 'Binary Packing', description: 'Use binary packing techniques', implemented: false },
        { name: 'Runtime Protection', description: 'Implement runtime application self-protection', implemented: false }
      ]
    },
    {
      title: 'Data Storage Threats',
      description: 'Sensitive data stored on device could be accessed by malicious apps',
      severity: 'high',
      strideCategory: 'information-disclosure',
      commonControls: [
        { name: 'Secure Storage', description: 'Use platform secure storage (Keychain/Keystore)', implemented: false },
        { name: 'Data Encryption', description: 'Encrypt sensitive data before storage', implemented: false },
        { name: 'Root/Jailbreak Detection', description: 'Detect and respond to compromised devices', implemented: false }
      ]
    }
  ],

  container: [
    {
      title: 'Container Escape',
      description: 'Attacker could escape container and access host system',
      severity: 'critical',
      strideCategory: 'elevation-of-privilege',
      commonControls: [
        { name: 'Security Context', description: 'Run containers with non-root users', implemented: false },
        { name: 'Resource Limits', description: 'Set proper CPU and memory limits', implemented: false },
        { name: 'Security Scanning', description: 'Regularly scan container images for vulnerabilities', implemented: false }
      ]
    },
    {
      title: 'Malicious Images',
      description: 'Container images could contain malware or vulnerabilities',
      severity: 'high',
      strideCategory: 'tampering',
      commonControls: [
        { name: 'Image Signing', description: 'Use signed container images', implemented: false },
        { name: 'Vulnerability Scanning', description: 'Scan images for known vulnerabilities', implemented: false },
        { name: 'Base Image Security', description: 'Use minimal, security-focused base images', implemented: false }
      ]
    }
  ]
};

/**
 * API class for threat intelligence
 * Falls back to mock data if API is not available
 */
export class ThreatAPI {
  /**
   * Get threats for a specific technology and category
   */
  static async getThreatsForTechnology(
    technologyName: string,
    category: string
  ): Promise<Threat[]> {
    // Only try API if URL is configured
    if (THREAT_API_BASE_URL) {
      try {
        const response = await fetch(`${THREAT_API_BASE_URL}/threats/${category}/${encodeURIComponent(technologyName)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const apiThreats = await response.json();
          return apiThreats.map((threat: any) => ({
            id: threat.id || uuidv4(),
            title: threat.title,
            description: threat.description,
            severity: threat.severity,
            strideCategory: threat.strideCategory,
            technology: technologyName,
            controls: (threat.controls || []).map((control: any) => ({
              id: control.id || uuidv4(),
              name: control.name,
              description: control.description,
              implemented: control.implemented || false
            }))
          }));
        }
      } catch (error) {
        console.warn('External threat API not available:', error);
      }
    }

    // If no API configured or API fails, use local mock data
    await new Promise(resolve => setTimeout(resolve, 500));
    const key = category === 'other' ? technologyName.toLowerCase() : category;
    const predefinedThreats = technologyThreats[key] || [];

    return predefinedThreats.map(threat => ({
      id: uuidv4(),
      title: threat.title,
      description: threat.description,
      severity: threat.severity,
      strideCategory: threat.strideCategory,
      technology: technologyName,
      controls: threat.commonControls.map(control => ({
        id: uuidv4(),
        name: control.name,
        description: control.description,
        implemented: control.implemented
      }))
    }));
  }

  /**
   * Get all available threat categories
   */
  static getThreatCategories(): string[] {
    return Object.keys(technologyThreats);
  }

  /**
   * Search threats by keyword
   */
  static async searchThreats(keyword: string): Promise<Threat[]> {
    // Only try API if URL is configured
    if (THREAT_API_BASE_URL) {
      try {
        const response = await fetch(`${THREAT_API_BASE_URL}/threats/search?q=${encodeURIComponent(keyword)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const apiThreats = await response.json();
          return apiThreats.map((threat: any) => ({
            id: threat.id || uuidv4(),
            title: threat.title,
            description: threat.description,
            severity: threat.severity,
            strideCategory: threat.strideCategory,
            technology: threat.technology,
            controls: (threat.controls || []).map((control: any) => ({
              id: control.id || uuidv4(),
              name: control.name,
              description: control.description,
              implemented: control.implemented || false
            }))
          }));
        }
      } catch (error) {
        console.warn('External threat API search not available:', error);
      }
    }

    // Fall back to mock search
    await new Promise(resolve => setTimeout(resolve, 300));
    const allThreats: Threat[] = [];
    
    for (const [category, threats] of Object.entries(technologyThreats)) {
      for (const threat of threats) {
        if (
          threat.title.toLowerCase().includes(keyword.toLowerCase()) ||
          threat.description.toLowerCase().includes(keyword.toLowerCase())
        ) {
          allThreats.push({
            id: uuidv4(),
            title: threat.title,
            description: threat.description,
            severity: threat.severity,
            strideCategory: threat.strideCategory,
            technology: category,
            controls: threat.commonControls.map(control => ({
              id: uuidv4(),
              name: control.name,
              description: control.description,
              implemented: control.implemented
            }))
          });
        }
      }
    }

    return allThreats;
  }

  /**
   * Get threat statistics
   */
  static getThreatStats(): { [key: string]: number } {
    const stats: { [key: string]: number } = {};
    
    for (const threats of Object.values(technologyThreats)) {
      for (const threat of threats) {
        stats[threat.strideCategory] = (stats[threat.strideCategory] || 0) + 1;
      }
    }

    return stats;
  }
}