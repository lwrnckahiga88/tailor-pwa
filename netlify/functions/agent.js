const axios = require("axios");

// Configuration Validator
class ConfigValidator {
  static requiredVars = {
    MINDSDB_API_KEY: {
      purpose: "Authentication for MindsDB API",
      minLength: 30,
      errorMessage: "MindsDB API key must be at least 30 characters long"
    },
    MINDSDB_API_URL: {
      purpose: "MindsDB API endpoint",
      optional: true,
      default: "https://llm.mdb.ai"
    }
  };

  static validate() {
    const errors = [];
    const availableVars = Object.keys(process.env);

    for (const [varName, requirements] of Object.entries(this.requiredVars)) {
      if (!process.env[varName] && !requirements.optional) {
        errors.push(`Missing required variable: ${varName} (${requirements.purpose})`);
      } else if (process.env[varName]?.length < requirements.minLength) {
        errors.push(`${varName}: ${requirements.errorMessage}`);
      }
    }

    if (errors.length > 0) {
      console.error("Configuration Error:", {
        availableEnvVars: availableVars,
        missingOrInvalid: errors,
        expectedVariables: this.requiredVars
      });
      throw new Error("Server configuration invalid");
    }

    return true;
  }
}

// Enhanced JSON Processor
class JSONProcessor {
  static schema = {
    html: { 
      required: true, 
      type: 'string',
      validation: (html) => html.includes('<html') && html.includes('</html>')
    },
    js: { 
      required: true, 
      type: 'string',
      validation: (js) => js.includes('serviceWorker') || js.includes('ServiceWorker')
    },
    manifest: { 
      required: true, 
      type: 'string',
      validation: (manifest) => {
        try {
          const parsed = JSON.parse(manifest);
          return parsed.name && parsed.short_name;
        } catch {
          return false;
        }
      }
    },
    sw: { 
      required: true, 
      type: 'string',
      validation: (sw) => sw.includes('install') && sw.includes('fetch')
    },
    css: { 
      required: true, 
      type: 'string',
      validation: (css) => css.includes('@media') || css.includes('flex')
    }
  };

  static extractJSON(response) {
    try {
      // Direct parse attempt
      if (this.isValidJSON(response)) return response;

      // Clean markdown
      const cleanResponse = response
        .replace(/```(json)?\n?|\n?```/g, '')
        .replace(/^json\s*/i, '')
        .trim();

      // Extract JSON object
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch && this.isValidJSON(jsonMatch[0])) {
        return jsonMatch[0];
      }

      return cleanResponse;
    } catch (e) {
      console.error("JSON extraction failed:", e);
      return response;
    }
  }

  static isValidJSON(str, schema = this.schema) {
    try {
      const obj = typeof str === 'string' ? JSON.parse(str) : str;
      if (!schema) return true;

      for (const [key, rules] of Object.entries(schema)) {
        if (rules.required && !obj[key]) {
          throw new Error(`Missing required field: ${key}`);
        }
        if (obj[key] && rules.type && typeof obj[key] !== rules.type) {
          throw new Error(`Invalid type for ${key}: expected ${rules.type}`);
        }
        if (obj[key] && rules.validation && !rules.validation(obj[key])) {
          throw new Error(`Validation failed for ${key}`);
        }
      }

      return true;
    } catch (e) {
      console.error("JSON validation error:", e.message);
      return false;
    }
  }
}

// API Client
class MindsDBClient {
  static async request(messages, options = {}) {
    const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";
    const apiKey = process.env.MINDSDB_API_KEY;

    if (!apiKey) throw new Error("API key not configured");

    try {
      const res = await axios.post(
        apiUrl,
        {
          model: "chat",
          messages,
          temperature: options.temperature || 0.3,
          response_format: options.response_format || { type: "text" }
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          timeout: options.timeout || 30000
        }
      );

      return res.data.choices?.[0]?.message?.content?.trim();
    } catch (error) {
      console.error("API Request Failed:", {
        error: error.message,
        response: error.response?.data,
        stack: error.stack
      });
      throw new Error(`API request failed: ${error.message}`);
    }
  }
}

// Core Functions
async function clarifyPrompt(userPrompt) {
  const systemMessage = `You are a PWA requirements specialist. Transform vague ideas into specific technical requirements.
  
  Output must include:
  1. Core functionality
  2. Data requirements
  3. Offline capabilities
  4. Performance needs
  5. Security considerations
  
  Format as markdown with clear sections.`;

  const response = await MindsDBClient.request([
    { role: "system", content: systemMessage },
    { role: "user", content: `Clarify this app idea: "${userPrompt}"` }
  ]);

  if (!response) throw new Error("Empty clarification response");
  return response;
}

async function generatePWA(prompt) {
  const systemMessage = `You are an expert PWA generator. Return ONLY JSON in this exact format:
  {
    "html": "Complete HTML5 with PWA tags, semantic structure, and app shell",
    "js": "Modern JavaScript with service worker, install handler, and core logic",
    "manifest": "Web App Manifest JSON string with all required fields",
    "sw": "Service worker with precaching and offline support",
    "css": "Responsive, mobile-first CSS with accessibility support"
  }

  Requirements:
  - Pass Lighthouse PWA audit
  - Work offline
  - Be secure (CSP-compatible)
  - Accessible (WCAG AA)
  - No explanations, only valid JSON`;

  const response = await MindsDBClient.request(
    [
      { role: "system", content: systemMessage },
      { role: "user", content: `Generate PWA for: ${prompt}` }
    ],
    {
      temperature: 0.2,
      response_format: { type: "json_object" },
      timeout: 60000
    }
  );

  if (!response) throw new Error("Empty generation response");

  const jsonString = JSONProcessor.extractJSON(response);
  if (!JSONProcessor.isValidJSON(jsonString)) {
    throw new Error("Invalid PWA structure received");
  }

  return JSON.parse(jsonString);
}

// Netlify Handler
exports.handler = async (event, context) => {
  // Initialize configuration
  ConfigValidator.validate();

  // Set headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff'
  };

  // Handle OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Validate method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Only POST requests allowed" })
    };
  }

  try {
    // Parse and validate request
    if (!event.body) throw new Error("Request body required");
    const { action, prompt } = JSON.parse(event.body);
    if (!action || !prompt) throw new Error("Action and prompt required");

    // Process request
    const startTime = Date.now();
    let result;

    switch (action) {
      case 'clarify':
        result = await clarifyPrompt(prompt);
        break;
      case 'generate':
        result = await generatePWA(prompt);
        break;
      default:
        throw new Error("Invalid action - use 'clarify' or 'generate'");
    }

    console.log(`Completed ${action} in ${Date.now() - startTime}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        action,
        timestamp: new Date().toISOString(),
        result
      })
    };

  } catch (error) {
    console.error("Handler Error:", {
      message: error.message,
      stack: error.stack,
      event: {
        method: event.httpMethod,
        path: event.path,
        body: event.body
      }
    });

    return {
      statusCode: error.message.includes("allowed") ? 405 : 
                 error.message.includes("required") ? 400 : 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
        timestamp: new Date().toISOString()
      })
    };
  }
};
