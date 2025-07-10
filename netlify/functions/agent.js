const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Clinical Llama client for medical-specific PWA generation
class ClinicalLlamaClient {
  constructor() {
    this.modelPath = process.env.CLINICAL_LLAMA_MODEL_PATH || '/models/clinical-llama-13b';
    this.pythonEnv = process.env.PYTHON_ENV || 'python3';
    this.maxTokens = 4000;
    this.temperature = 0.3;
    this.timeout = 120000; // 2 minutes for model inference
  }

  async generateResponse(prompt, systemMessage) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, 'clinical_llama_inference.py');
      
      const pythonProcess = spawn(this.pythonEnv, [
        scriptPath,
        '--model-path', this.modelPath,
        '--max-tokens', this.maxTokens.toString(),
        '--temperature', this.temperature.toString(),
        '--system-message', systemMessage,
        '--prompt', prompt
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutHandle = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        reject(new Error('Clinical Llama inference timeout'));
      }, this.timeout);

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);
        
        if (code !== 0) {
          reject(new Error(`Clinical Llama process failed: ${stderr}`));
          return;
        }

        try {
          const response = JSON.parse(stdout);
          resolve(response.content);
        } catch (parseError) {
          reject(new Error(`Failed to parse Clinical Llama response: ${parseError.message}`));
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(new Error(`Failed to start Clinical Llama process: ${error.message}`));
      });
    });
  }
}

// Data Chat Integration Service
class DataChatService {
  constructor() {
    this.apiKey = process.env.CAMEL_AI_API_KEY;
    this.baseUrl = process.env.CAMEL_AI_BASE_URL || 'https://api.camel.ai/api/v1';
    this.defaultTTL = 3600; // 1 hour
  }

  async createIframe(userId, dataSources = [], ttl = this.defaultTTL) {
    if (!this.apiKey) {
      throw new Error('CAMEL_AI_API_KEY environment variable is required');
    }

    try {
      const response = await axios.post(`${this.baseUrl}/iframe/create`, {
        uid: userId,
        srcs: dataSources,
        ttl: ttl
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error('Failed to create iframe:', error);
      throw new Error(`Failed to create data chat iframe: ${error.message}`);
    }
  }

  async getMedicalDataSources(userId) {
    // Get available medical data sources for the user
    try {
      const response = await axios.get(`${this.baseUrl}/data-sources`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        params: {
          uid: userId,
          category: 'medical'
        }
      });

      return response.data.sources || [];
    } catch (error) {
      console.error('Failed to get medical data sources:', error);
      return [];
    }
  }
}

// Enhanced input validation for medical applications
class MedicalInputValidator {
  static validateMedicalPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Medical prompt must be a non-empty string');
    }
    
    if (prompt.length < 20) {
      throw new Error('Medical prompt must be at least 20 characters long for proper context');
    }
    
    if (prompt.length > 3000) {
      throw new Error('Medical prompt must be less than 3000 characters');
    }
    
    // Sanitize input
    const sanitized = validator.escape(prompt);
    
    // Check for medical context requirements
    const medicalKeywords = [
      'symptom', 'diagnosis', 'treatment', 'patient', 'clinical', 'medical', 
      'health', 'disease', 'condition', 'healthcare', 'medicine', 'therapy'
    ];
    
    const hasMedicalContext = medicalKeywords.some(keyword => 
      sanitized.toLowerCase().includes(keyword)
    );
    
    if (!hasMedicalContext) {
      console.warn('Prompt may not contain medical context');
    }
    
    // Remove potentially dangerous medical advice patterns
    const dangerousPatterns = [
      /do not (seek|consult|see) (a |your )?doctor/i,
      /avoid medical (attention|help)/i,
      /instead of seeing a doctor/i,
      /replace medical treatment/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(sanitized)) {
        throw new Error('Prompt contains potentially dangerous medical advice patterns');
      }
    }
    
    return sanitized;
  }
  
  static validateMedicalAction(action) {
    const validActions = ['clarify', 'generate', 'diagnose', 'treatment_plan', 'create_chat_session'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid medical action. Must be one of: ${validActions.join(', ')}`);
    }
    return action;
  }

  static validateUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID must be a non-empty string');
    }
    
    if (userId.length > 100) {
      throw new Error('User ID must be less than 100 characters');
    }
    
    // Basic sanitization
    const sanitized = validator.escape(userId);
    return sanitized;
  }
}

// Medical PWA templates and guidelines
class MedicalPWATemplates {
  static getClinicalSystemMessage() {
    return `You are a Clinical Llama AI assistant specialized in generating medical Progressive Web Applications (PWAs). 

IMPORTANT DISCLAIMERS:
- All generated medical applications must include prominent disclaimers
- Applications should encourage users to consult healthcare professionals
- Never provide definitive diagnoses or replace professional medical advice
- Include emergency contact information and when to seek immediate care

Generate PWA code that follows these medical application guidelines:
1. Include proper medical disclaimers
2. Implement accessibility features (WCAG 2.1 AA compliance)
3. Ensure data privacy and security measures
4. Include offline capabilities for emergency information
5. Implement proper error handling for medical data
6. Follow medical device software guidelines where applicable
7. Include data chat integration for patient consultation

Return valid JSON with these exact keys: html, js, manifest, sw, css

The application should be professional, trustworthy, and emphasize the importance of professional medical consultation.`;
  }
  
  static getMedicalAppManifest(appName, description) {
    return {
      name: appName,
      short_name: appName.split(' ').slice(0, 2).join(' '),
      description: description,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#2563eb',
      orientation: 'portrait-primary',
      categories: ['health', 'medical', 'utilities'],
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable any'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable any'
        }
      ],
      screenshots: [
        {
          src: '/screenshots/mobile.png',
          sizes: '390x844',
          type: 'image/png',
          form_factor: 'narrow'
        }
      ]
    };
  }

  static getReactDataChatComponent(iframeUrl) {
    return `
import React, { useEffect, useState } from 'react';

function MedicalDataChat({ userId, dataSources = [], onError }) {
  const [iframeUrl, setIframeUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function createMedicalChatIframe() {
      if (!userId) {
        setError('User ID is required for medical data chat');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/medical-pwa/chat-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Medical-Disclaimer': 'accepted'
          },
          body: JSON.stringify({
            action: 'create_chat_session',
            userId: userId,
            dataSources: dataSources,
            ttl: 3600
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to create medical chat session');
        }
        
        const data = await response.json();
        setIframeUrl(data.content.iframe_url);
        setError(null);
      } catch (err) {
        console.error('Medical chat iframe creation error:', err);
        setError(err.message);
        if (onError) onError(err);
      } finally {
        setLoading(false);
      }
    }
    
    createMedicalChatIframe();
  }, [userId, dataSources, onError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading medical chat...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-800">
              Error loading medical chat: {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!iframeUrl) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">No chat session available. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-800">
          <strong>Medical Disclaimer:</strong> This chat is for educational purposes only. 
          Always consult with a qualified healthcare provider for medical advice.
        </p>
      </div>
      
      <iframe 
        src={iframeUrl}
        width="100%"
        height="600"
        frameBorder="0"
        allow="clipboard-write"
        className="rounded-lg border border-gray-200"
        title="Medical Data Chat"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
      
      <div className="mt-2 text-xs text-gray-500">
        <p>🚨 Emergency: If experiencing a medical emergency, call emergency services immediately.</p>
      </div>
    </div>
  );
}

export default MedicalDataChat;`;
  }
}

// Enhanced medical prompt clarification
async function clarifyMedicalPrompt(userPrompt) {
  const client = new ClinicalLlamaClient();
  
  const systemMessage = `You are a medical application requirements specialist. Transform healthcare app ideas into detailed, HIPAA-compliant PWA specifications.

Guidelines:
- Include specific medical features and functionality
- Mention patient data security requirements
- Specify offline medical information capabilities
- Include accessibility for users with disabilities
- Suggest appropriate medical disclaimers
- Consider emergency contact features
- Ensure compliance with medical device regulations if applicable
- Keep response under 600 words
- Always emphasize the importance of professional medical consultation`;
  
  const prompt = `Transform this healthcare app idea into specific PWA requirements with proper medical disclaimers: "${userPrompt}"`;
  
  try {
    const response = await client.generateResponse(prompt, systemMessage);
    return response;
  } catch (error) {
    console.error('Clinical Llama clarification error:', error);
    throw new Error(`Failed to clarify medical prompt: ${error.message}`);
  }
}

// Enhanced medical PWA generation with React integration
async function generateMedicalPWA(prompt, includeDataChat = true) {
  const client = new ClinicalLlamaClient();
  
  const systemMessage = MedicalPWATemplates.getClinicalSystemMessage();
  
  const enhancedPrompt = `Generate a complete, HIPAA-compliant PWA for: ${prompt}

Requirements:
- Include medical disclaimers in HTML
- Implement secure data handling
- Add emergency contact features
- Include offline medical information
- Ensure accessibility compliance
- Add proper error handling
- Include data encryption for sensitive information
- Implement proper authentication if needed
${includeDataChat ? '- Include React component for medical data chat integration' : ''}

JSON format required:
{
  "html": "<!DOCTYPE html>...",
  "js": "// Medical PWA JavaScript with security features...",
  "manifest": "{\\"name\\": \\"Medical App\\", ...}",
  "sw": "// Service Worker with medical data caching...",
  "css": "/* Medical app responsive CSS with accessibility... */"
  ${includeDataChat ? ',"reactComponent": "// React component with medical data chat integration"' : ''}
}`;
  
  try {
    const response = await client.generateResponse(enhancedPrompt, systemMessage);
    
    // Parse and validate medical PWA structure
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Clinical Llama response');
    }
    
    const pwaData = JSON.parse(jsonMatch[0]);
    
    // Validate required medical PWA fields
    const requiredFields = ['html', 'js', 'manifest', 'sw', 'css'];
    for (const field of requiredFields) {
      if (!pwaData[field]) {
        throw new Error(`Missing required medical PWA field: ${field}`);
      }
    }
    
    // Add React component if requested
    if (includeDataChat && !pwaData.reactComponent) {
      pwaData.reactComponent = MedicalPWATemplates.getReactDataChatComponent();
    }
    
    // Validate medical disclaimers in HTML
    if (!pwaData.html.toLowerCase().includes('disclaimer') && 
        !pwaData.html.toLowerCase().includes('consult') &&
        !pwaData.html.toLowerCase().includes('medical professional')) {
      console.warn('Generated PWA may be missing medical disclaimers');
    }
    
    // Validate manifest structure
    const manifest = JSON.parse(pwaData.manifest);
    if (!manifest.name || !manifest.description) {
      throw new Error('Invalid medical PWA manifest structure');
    }
    
    return pwaData;
  } catch (error) {
    console.error('Clinical Llama generation error:', error);
    throw new Error(`Failed to generate medical PWA: ${error.message}`);
  }
}

// Create medical data chat session
async function createMedicalChatSession(userId, dataSources = [], ttl = 3600) {
  const chatService = new DataChatService();
  
  try {
    // Validate user ID
    const validatedUserId = MedicalInputValidator.validateUserId(userId);
    
    // Get available medical data sources if none provided
    if (dataSources.length === 0) {
      dataSources = await chatService.getMedicalDataSources(validatedUserId);
    }
    
    // Create iframe for medical data chat
    const iframeData = await chatService.createIframe(validatedUserId, dataSources, ttl);
    
    return {
      iframe_url: iframeData.iframe_url,
      session_id: iframeData.session_id || crypto.randomUUID(),
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      data_sources: dataSources,
      medical_disclaimer: 'This chat is for educational purposes only. Always consult with a qualified healthcare provider for medical advice.',
      emergency_notice: 'If you are experiencing a medical emergency, call emergency services immediately.'
    };
  } catch (error) {
    console.error('Failed to create medical chat session:', error);
    throw new Error(`Failed to create medical chat session: ${error.message}`);
  }
}

// Medical diagnosis support (with proper disclaimers)
async function provideDiagnosisSupport(symptoms) {
  const client = new ClinicalLlamaClient();
  
  const systemMessage = `You are a Clinical Llama assistant providing diagnostic support information. 

CRITICAL REQUIREMENTS:
- NEVER provide definitive diagnoses
- Always include disclaimers about seeking professional medical advice
- Provide differential diagnosis considerations only
- Include red flags that require immediate medical attention
- Emphasize the importance of professional medical evaluation
- Include emergency contact information when appropriate`;
  
  const prompt = `Based on these symptoms: "${symptoms}"

Provide:
1. Possible conditions to consider (differential diagnosis)
2. When to seek immediate medical attention
3. Questions a healthcare provider might ask
4. General health recommendations
5. Important disclaimer about professional medical consultation

Remember: This is for educational purposes only and should not replace professional medical advice.`;
  
  try {
    const response = await client.generateResponse(prompt, systemMessage);
    return {
      diagnosticSupport: response,
      disclaimer: "This information is for educational purposes only and should not replace professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider for medical concerns.",
      emergencyNotice: "If you are experiencing a medical emergency, call emergency services immediately."
    };
  } catch (error) {
    console.error('Clinical Llama diagnosis support error:', error);
    throw new Error(`Failed to provide diagnosis support: ${error.message}`);
  }
}

// Treatment plan generation
async function generateTreatmentPlan(condition) {
  const client = new ClinicalLlamaClient();
  
  const systemMessage = `You are a Clinical Llama assistant providing treatment plan information for educational purposes.

CRITICAL REQUIREMENTS:
- NEVER provide definitive treatment recommendations
- Always include disclaimers about seeking professional medical advice
- Provide general treatment approaches for educational purposes only
- Include warnings about self-treatment
- Emphasize the importance of professional medical supervision
- Include emergency contact information when appropriate`;
  
  const prompt = `Provide general treatment information for: "${condition}"

Include:
1. Common treatment approaches (for educational purposes)
2. Lifestyle modifications that may help
3. When to seek medical attention
4. Warning signs that require immediate care
5. Important disclaimer about professional medical consultation

Remember: This is for educational purposes only and should not replace professional medical advice.`;
  
  try {
    const response = await client.generateResponse(prompt, systemMessage);
    return {
      treatmentInfo: response,
      disclaimer: "This information is for educational purposes only and should not replace professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider for medical concerns.",
      emergencyNotice: "If you are experiencing a medical emergency, call emergency services immediately."
    };
  } catch (error) {
    console.error('Clinical Llama treatment plan error:', error);
    throw new Error(`Failed to generate treatment plan: ${error.message}`);
  }
}

// Enhanced logging with medical compliance
function logMedicalRequest(event, action, success = true, error = null) {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomUUID();
  
  const logData = {
    timestamp,
    requestId,
    action,
    success,
    // Don't log sensitive medical data
    userAgent: event.headers['user-agent'],
    ip: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
    hipaaCompliant: true,
    medicalApplication: true,
    ...(error && { error: error.message })
  };
  
  // In production, ensure logs are HIPAA compliant
  if (process.env.NODE_ENV === 'production') {
    // Remove or hash IP addresses for medical applications
    delete logData.ip;
  }
  
  console.log(JSON.stringify(logData));
  return requestId;
}

// Main handler with medical compliance and React integration
exports.handler = async (event, context) => {
  const requestId = crypto.randomUUID();
  
  // Enhanced security headers for medical applications
  const medicalSecurityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN', // Allow iframe for data chat
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.camel.ai; frame-src 'self' https://api.camel.ai;",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  };
  
  // CORS headers for medical applications
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.MEDICAL_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Medical-Disclaimer',
    'Access-Control-Max-Age': '86400'
  };
  
  const headers = { ...medicalSecurityHeaders, ...corsHeaders };
  
  // Handle preflight requests
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
        requestId,
        medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
      })
    };
  }
  
  try {
    // Parse and validate request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body',
          requestId,
          medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
        })
      };
    }
    
    const { action, prompt, userId, dataSources, ttl } = body;
    
    // Validate inputs
    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required field: action',
          requestId,
          medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
        })
      };
    }
    
    const validatedAction = MedicalInputValidator.validateMedicalAction(action);
    
    // Validate prompt for actions that require it
    let validatedPrompt;
    if (['clarify', 'generate', 'diagnose', 'treatment_plan'].includes(validatedAction)) {
      if (!prompt) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Missing required field: prompt',
            requestId,
            medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
          })
        };
      }
      validatedPrompt = MedicalInputValidator.validateMedicalPrompt(prompt);
    }
    
    let result;
    
    switch (validatedAction) {
      case 'clarify':
        logMedicalRequest(event, 'clarify');
        result = await clarifyMedicalPrompt(validatedPrompt);
        break;
        
      case 'generate':
        logMedicalRequest(event, 'generate');
        result = await generateMedicalPWA(validatedPrompt, true);
        break;
        
      case 'diagnose':
        logMedicalRequest(event, 'diagnose');
        result = await provideDiagnosisSupport(validatedPrompt);
        break;
        
      case 'treatment_plan':
        logMedicalRequest(event, 'treatment_plan');
        result = await generateTreatmentPlan(validatedPrompt);
        break;
        
      case 'create_chat_session':
        logMedicalRequest(event, 'create_chat_session');
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              error: 'Missing required field: userId',
              requestId,
              medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
            })
          };
        }
        result = await createMedicalChatSession(userId, dataSources, ttl);
        break;
        
      default:
        throw new Error(`Unsupported medical action: ${validatedAction}`);
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        content: result,
        requestId,
        timestamp: new Date().toISOString(),
        medicalDisclaimer: 'This information is for educational purposes only and should not replace professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider for medical concerns.',
        emergencyNotice: 'If you are experiencing a medical emergency, call emergency services immediately.',
        model: 'Clinical Llama',
        complianceNote: 'This service follows medical application guidelines and emphasizes professional medical consultation.'
      })
    };
    
  } catch (error) {
    console.error(`❌ Medical PWA Generator Error (${requestId}):`, error);
    logMedicalRequest(event, body?.action || 'unknown', false, error);
    
    // Enhanced error handling for medical applications
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'A medical service error occurred. Please try again or consult a healthcare professional.'
      : error.message;
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString(),
        medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.',
        emergencyNotice: 'If you are experiencing a medical emergency, call emergency services immediately.'
      })
    };
  }
};

// Health check endpoint with medical compliance
exports.health = async (event, context) => {
  try {
    // Basic health check for Clinical Llama model
    const client = new ClinicalLlamaClient();
    const testPrompt = "Test clinical reasoning capability";
    const testResponse = await client.generateResponse(testPrompt, "Respond with 'Clinical Llama is operational'");
    
    // Test data chat service
    const chatService = new DataChatService();
    const chatHealthy = chatService.apiKey ? true : false;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'healthy',
        model: 'Clinical Llama',
        modelStatus: testResponse.includes('operational') ? 'operational' : 'degraded',
        chatServiceStatus: chatHealthy ? 'operational' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '2.1.0-clinical-react',
        compliance: 'HIPAA-ready',
        features: ['PWA Generation', 'Medical Chat Integration', 'React Components'],
        medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
      })
    };
  } catch (error) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        model: 'Clinical Llama',
        error: error.message,
        timestamp: new Date().toISOString(),
        version: '2.1.0-clinical-react'
      })
    };
  }
};
