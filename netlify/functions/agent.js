// netlify/functions/generatePWA.js
const axios = require("axios");

// 1. ENVIRONMENT VALIDATION ====================================
function validateEnvironment() {
  const requiredVars = {
    MINDSDB_API_KEY: {
      description: "MindsDB API Key",
      minLength: 30
    }
  };

  const errors = [];
  
  for (const [varName, config] of Object.entries(requiredVars)) {
    if (!process.env[varName]) {
      errors.push(`Missing: ${varName} (${config.description})`);
    } else if (process.env[varName].length < config.minLength) {
      errors.push(`Invalid: ${varName} must be at least ${config.minLength} chars`);
    }
  }

  if (errors.length > 0) {
    console.error("Environment Configuration Errors:", {
      availableVariables: Object.keys(process.env),
      errors,
      requiredVariables: Object.keys(requiredVars)
    });
    throw new Error("Server configuration error");
  }
}

// 2. API CLIENT ================================================
async function callMindsDBAPI(messages, isJSON = false) {
  validateEnvironment();

  try {
    const response = await axios.post(
      process.env.MINDSDB_API_URL || "https://llm.mdb.ai",
      {
        model: "chat",
        messages,
        response_format: isJSON ? { type: "json_object" } : undefined,
        temperature: isJSON ? 0.2 : 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MINDSDB_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    return response.data.choices?.[0]?.message?.content?.trim();
  } catch (error) {
    console.error("API Call Failed:", {
      error: error.message,
      response: error.response?.data,
      config: error.config
    });
    throw new Error(`API request failed: ${error.message}`);
  }
}

// 3. CORE FUNCTIONALITY ========================================
async function clarifyPrompt(prompt) {
  const systemMessage = `You are a PWA requirements specialist. Provide detailed technical specifications for the app idea.`;
  
  const response = await callMindsDBAPI([
    { role: "system", content: systemMessage },
    { role: "user", content: `Clarify this app idea: "${prompt}"` }
  ]);

  if (!response) throw new Error("Empty clarification response");
  return response;
}

async function generatePWA(prompt) {
  const systemMessage = `You are a PWA generator. Return ONLY JSON in this exact format:
  {
    "html": "Complete HTML document",
    "js": "JavaScript code",
    "manifest": "Web App Manifest JSON string",
    "sw": "Service Worker code",
    "css": "CSS styles"
  }`;

  const response = await callMindsDBAPI([
    { role: "system", content: systemMessage },
    { role: "user", content: `Generate PWA for: ${prompt}` }
  ], true);

  if (!response) throw new Error("Empty generation response");

  try {
    const jsonString = response.replace(/```json|```/g, '').trim();
    const result = JSON.parse(jsonString);
    
    // Validate required fields
    const requiredFields = ['html', 'js', 'manifest', 'sw', 'css'];
    const missingFields = requiredFields.filter(field => !result[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing fields: ${missingFields.join(', ')}`);
    }
    
    return result;
  } catch (e) {
    console.error("JSON Parsing Error:", {
      error: e.message,
      response: response
    });
    throw new Error("Invalid PWA structure received");
  }
}

// 4. NETLIFY HANDLER ===========================================
exports.handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    // Validate request
    if (!event.body) throw new Error("Request body required");
    const { action, prompt } = JSON.parse(event.body);
    if (!action || !prompt) throw new Error("Action and prompt required");

    // Process request
    const startTime = Date.now();
    const result = await (action === 'clarify' 
      ? clarifyPrompt(prompt) 
      : generatePWA(prompt));

    console.log(`Action ${action} completed in ${Date.now() - startTime}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, result })
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
      statusCode: error.message.includes("Not Allowed") ? 405 : 
                 error.message.includes("required") ? 400 : 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      })
    };
  }
};
