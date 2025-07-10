const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
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
    
    const hasmedicalContext = medicalKeywords.some(keyword => 
      sanitized.toLowerCase().includes(keyword)
    );
    
    if (!hasmedicalContext) {
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
    const validActions = ['clarify', 'generate', 'diagnose', 'treatment_plan'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid medical action. Must be one of: ${validActions.join(', ')}`);
    }
    return action;
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

// Enhanced medical PWA generation
async function generateMedicalPWA(prompt) {
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

JSON format required:
{
  "html": "<!DOCTYPE html>...",
  "js": "// Medical PWA JavaScript with security features...",
  "manifest": "{\\"name\\": \\"Medical App\\", ...}",
  "sw": "// Service Worker with medical data caching...",
  "css": "/* Medical app responsive CSS with accessibility... */"
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

// Main handler with medical compliance
exports.handler = async (event, context) => {
  const requestId = crypto.randomUUID();
  
  // Enhanced security headers for medical applications
  const medicalSecurityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  };
  
  // CORS headers for medical applications
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.MEDICAL_ALLOWED_ORIGIN || 'https://your-medical-domain.com',
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
    
    const { action, prompt } = body;
    
    // Validate inputs
    if (!action || !prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields: action and prompt',
          requestId,
          medicalDisclaimer: 'This service is for educational purposes only. Consult a healthcare professional for medical advice.'
        })
      };
    }
    
    const validatedAction = MedicalInputValidator.validateMedicalAction(action);
    const validatedPrompt = MedicalInputValidator.validateMedicalPrompt(prompt);
    
    let result;
    
    switch (validatedAction) {
      case 'clarify':
        logMedicalRequest(event, 'clarify');
        result = await clarifyMedicalPrompt(validatedPrompt);
        break;
        
      case 'generate':
        logMedicalRequest(event, 'generate');
        result = await generateMedicalPWA(validatedPrompt);
        break;
        
      case 'diagnose':
        logMedicalRequest(event, 'diagnose');
        result = await provideDiagnosisSupport(validatedPrompt);
        break;
        
      case 'treatment_plan':
        logMedicalRequest(event, 'treatment_plan');
        result = await generateTreatmentPlan(validatedPrompt);
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
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'healthy',
        model: 'Clinical Llama',
        modelStatus: testResponse.includes('operational') ? 'operational' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '2.0.0-clinical',
        compliance: 'HIPAA-ready',
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
        version: '2.0.0-clinical'
      })
    };
  }
};
