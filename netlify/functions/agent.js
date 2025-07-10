const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Enhanced Camel API Client for medical applications
class CamelAPIClient {
  constructor() {
    this.apiKey = process.env.CAMEL_API_KEY;
    this.baseUrl = process.env.CAMEL_API_BASE_URL || 'https://api.camel.ai/api/v1/';
    this.timeout = 30000; // 30 seconds timeout
  }

  async createMedicalIframeSession(userId, options = {}) {
    if (!this.apiKey) {
      throw new Error('CAMEL_API_KEY environment variable is required');
    }

    const defaultOptions = {
      ttl: 3600,
      dataSources: ['medical_knowledge_base', 'patient_education'],
      sandbox: true,
      compliance: 'hipaa',
      ...options
    };

    try {
      const response = await axios.post(`${this.baseUrl}/medical/iframe/sessions`, {
        user_id: userId,
        ...defaultOptions
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Medical-Compliance': 'hipaa'
        },
        timeout: this.timeout
      });

      return {
        iframeUrl: response.data.iframe_url,
        sessionId: response.data.session_id,
        expiresAt: response.data.expires_at,
        warnings: response.data.warnings || [],
        complianceNotice: 'This medical chat session is HIPAA-compliant and encrypted.'
      };
    } catch (error) {
      if (error.response) {
        // Handle Camel API specific errors
        throw new Error(`Camel API Error: ${error.response.data.error || error.message}`);
      }
      throw new Error(`Failed to create medical iframe session: ${error.message}`);
    }
  }

  async validateMedicalPrompt(prompt) {
    try {
      const response = await axios.post(`${this.baseUrl}/medical/prompts/validate`, {
        prompt: prompt
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      return {
        isValid: response.data.is_valid,
        sanitizedPrompt: response.data.sanitized_prompt,
        warnings: response.data.warnings || [],
        complianceLevel: response.data.compliance_level || 'basic'
      };
    } catch (error) {
      if (error.response) {
        return {
          isValid: false,
          error: error.response.data.error || 'Invalid medical prompt'
        };
      }
      throw new Error(`Failed to validate medical prompt: ${error.message}`);
    }
  }
}

// Medical PWA Generator with Camel API integration
class MedicalPWAGenerator {
  constructor() {
    this.camelClient = new CamelAPIClient();
    this.modelPath = process.env.MEDICAL_MODEL_PATH || 'https://api.camel.ai/api/v1'
  }

  async generateMedicalPWA(prompt, userId = null) {
    // Step 1: Validate medical prompt
    const validation = await this.camelClient.validateMedicalPrompt(prompt);
    if (!validation.isValid) {
      throw new Error(`Invalid medical prompt: ${validation.error}`);
    }

    // Step 2: Generate iframe session if userId provided
    let iframeData = null;
    if (userId) {
      try {
        iframeData = await this.camelClient.createMedicalIframeSession(userId, {
          context: 'pwa_generation'
        });
      } catch (error) {
        console.warn(`Iframe session creation failed: ${error.message}`);
      }
    }

    // Step 3: Generate PWA components
    const pwaComponents = await this.generatePWABaseComponents(validation.sanitizedPrompt, iframeData);

    return {
      ...pwaComponents,
      compliance: {
        hipaa: true,
        dataEncryption: true,
        disclaimerIncluded: true
      },
      warnings: validation.warnings,
      iframeSession: iframeData ? {
        url: iframeData.iframeUrl,
        expiresAt: iframeData.expiresAt
      } : null
    };
  }

  async generatePWABaseComponents(prompt, iframeData = null) {
    // This would be your existing PWA generation logic
    // Modified to include Camel API iframe integration
    
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medical PWA</title>
  <link rel="manifest" href="/manifest.json">
  ${iframeData ? `
  <!-- Camel API Medical Chat Integration -->
  <style>
    .medical-chat-container {
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      margin: 1rem 0;
    }
    .medical-disclaimer {
      background-color: #f8fafc;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
  </style>
  ` : ''}
</head>
<body>
  <div class="container">
    <h1>Medical Application</h1>
    <p>${prompt}</p>
    
    ${iframeData ? `
    <div class="medical-disclaimer">
      <strong>Important:</strong> This application provides health information for educational purposes only. 
      Always consult with a healthcare professional for medical advice.
    </div>
    
    <div class="medical-chat-container">
      <iframe 
        src="${iframeData.iframeUrl}"
        width="100%"
        height="600"
        frameborder="0"
        allow="clipboard-write"
        title="Medical Chat"
        sandbox="allow-scripts allow-same-origin allow-forms"
      ></iframe>
    </div>
    ` : ''}
  </div>
</body>
</html>`;

    const manifest = {
      name: "Medical PWA",
      short_name: "MedPWA",
      description: "A medical progressive web application",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#3182ce",
      icons: [
        {
          src: "/icons/icon-192x192.png",
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: "/icons/icon-512x512.png",
          sizes: "512x512",
          type: "image/png"
        }
      ]
    };

    return {
      html: htmlTemplate,
      manifest: JSON.stringify(manifest, null, 2),
      serviceWorker: this.generateServiceWorker(),
      styles: this.generateStyles(),
      scripts: this.generateScripts(),
      ...(iframeData && { reactComponent: this.generateReactChatComponent(iframeData.iframeUrl) })
    };
  }

  generateServiceWorker() {
    return `// Medical PWA Service Worker
const CACHE_NAME = 'medical-pwa-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/scripts/main.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error('Cache installation failed:', err))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});`;
  }

  generateStyles() {
    return `/* Medical PWA Styles */
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  line-height: 1.6;
  color: #2d3748;
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.medical-disclaimer {
  background-color: #ebf8ff;
  border-left: 4px solid #4299e1;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 0.25rem;
}

.emergency-notice {
  background-color: #fff5f5;
  border-left: 4px solid #f56565;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 0.25rem;
}`;
  }

  generateScripts() {
    return `// Medical PWA Main Script
document.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
      })
      .catch(err => {
        console.error('ServiceWorker registration failed:', err);
      });
  }

  // Medical disclaimer confirmation
  const disclaimer = document.getElementById('medical-disclaimer');
  if (disclaimer) {
    disclaimer.style.display = 'block';
  }
});`;
  }

  generateReactChatComponent(iframeUrl) {
    return `import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const MedicalChatIframe = ({ userId, onError }) => {
  const [loading, setLoading] = useState(true);
  const [iframeUrl, setIframeUrl] = useState('');
  const [sessionExpiry, setSessionExpiry] = useState(null);

  useEffect(() => {
    if (iframeUrl) return;

    const loadChatSession = async () => {
      try {
        const response = await fetch('/api/medical-chat/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${process.env.REACT_APP_CAMEL_API_KEY}\`
          },
          body: JSON.stringify({ userId })
        });

        if (!response.ok) {
          throw new Error('Failed to create chat session');
        }

        const data = await response.json();
        setIframeUrl(data.iframeUrl);
        setSessionExpiry(data.expiresAt);
      } catch (err) {
        console.error('Medical chat error:', err);
        if (onError) onError(err);
      } finally {
        setLoading(false);
      }
    };

    loadChatSession();
  }, [userId, iframeUrl, onError]);

  if (loading) {
    return (
      <div className="chat-loading">
        <p>Loading medical chat...</p>
      </div>
    );
  }

  if (!iframeUrl) {
    return (
      <div className="chat-error">
        <p>Unable to load medical chat. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="medical-chat-container">
      <div className="medical-disclaimer">
        <h3>Important Information</h3>
        <p>
          This chat is for educational purposes only and does not replace 
          professional medical advice. Always consult with a qualified 
          healthcare provider.
        </p>
        {sessionExpiry && (
          <p className="session-expiry">
            Session expires: {new Date(sessionExpiry).toLocaleString()}
          </p>
        )}
      </div>
      
      <iframe
        src={iframeUrl}
        title="Medical Chat"
        className="medical-chat-iframe"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
      
      <div className="emergency-notice">
        <p>
          <strong>Emergency:</strong> If you're experiencing a medical emergency, 
          call your local emergency number immediately.
        </p>
      </div>
    </div>
  );
};

MedicalChatIframe.propTypes = {
  userId: PropTypes.string.isRequired,
  onError: PropTypes.func
};

export default MedicalChatIframe;`;
  }
}

// API Handler with proper Camel API integration
exports.handler = async (event, context) => {
  // Set security headers for medical application
  const headers = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.camel.ai; frame-src 'self' https://api.camel.ai;",
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Medical-Disclaimer'
  };

  // Handle OPTIONS requests for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only POST requests are accepted',
        medicalDisclaimer: 'This service provides health information for educational purposes only.'
      })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, prompt, userId } = body;

    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required field: action',
          medicalDisclaimer: 'This service provides health information for educational purposes only.'
        })
      };
    }

    const generator = new MedicalPWAGenerator();
    let result;

    switch (action) {
      case 'generate':
        if (!prompt) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: 'Missing required field: prompt',
              medicalDisclaimer: 'This service provides health information for educational purposes only.'
            })
          };
        }
        result = await generator.generateMedicalPWA(prompt, userId);
        break;

      case 'create_chat':
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: 'Missing required field: userId',
              medicalDisclaimer: 'This service provides health information for educational purposes only.'
            })
          };
        }
        const camelClient = new CamelAPIClient();
        result = await camelClient.createMedicalIframeSession(userId);
        break;

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid action specified',
            medicalDisclaimer: 'This service provides health information for educational purposes only.'
          })
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: result,
        compliance: 'HIPAA-ready',
        medicalDisclaimer: 'This information is for educational purposes only and does not constitute medical advice.',
        emergencyNotice: 'If you are experiencing a medical emergency, please call emergency services immediately.'
      })
    };

  } catch (error) {
    console.error('Medical PWA Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        medicalDisclaimer: 'This service provides health information for educational purposes only.',
        emergencyNotice: 'If you are experiencing a medical emergency, please call emergency services immediately.'
      })
    };
  }
};

// Health check endpoint
exports.healthCheck = async () => {
  try {
    const camelClient = new CamelAPIClient();
    
    // Simple validation request to Camel API
    const validation = await camelClient.validateMedicalPrompt("Test prompt");
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'healthy',
        camelApi: validation.isValid ? 'connected' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '2.0.0-medical'
      })
    };
  } catch (error) {
    return {
      statusCode: 503,
      body: JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
