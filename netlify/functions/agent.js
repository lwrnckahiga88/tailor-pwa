const axios = require("axios");

// Enhanced JSON validation with schema checking
function isValidJSON(str, schema) {
  try {
    const obj = JSON.parse(str);
    if (schema) {
      return validateAgainstSchema(obj, schema);
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Schema validation helper
function validateAgainstSchema(obj, schema) {
  for (const key in schema) {
    if (schema[key].required && !obj[key]) {
      return false;
    }
    if (schema[key].type && typeof obj[key] !== schema[key].type) {
      return false;
    }
  }
  return true;
}

// Enhanced JSON extraction with better error recovery
function extractJSON(response) {
  try {
    // First try parsing directly
    if (isValidJSON(response)) {
      return response;
    }
    
    // Clean markdown code blocks
    const cleanResponse = response
      .replace(/```(json)?\n?|\n?```/g, '')
      .trim();
    
    // Try to find JSON object in the response
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const potentialJSON = jsonMatch[0];
      if (isValidJSON(potentialJSON)) {
        return potentialJSON;
      }
    }
    
    // Fallback to cleaned response
    return cleanResponse;
  } catch (e) {
    console.error("JSON extraction error:", e);
    return response; // Return original if all extraction fails
  }
}

// PWA Component Schema Definition
const PWASchema = {
  html: { required: true, type: 'string' },
  js: { required: true, type: 'string' },
  manifest: { required: true, type: 'string' },
  sw: { required: true, type: 'string' },
  css: { required: true, type: 'string' }
};

async function clarifyPrompt(userPrompt) {
  const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";
  const apiKey = process.env.MINDSDB_API_KEY;

  if (!apiKey) {
    throw new Error("MINDSDB_API_KEY environment variable not set");
  }

  try {
    const res = await axios.post(
      apiUrl,
      {
        model: "chat",
        messages: [
          {
            role: "system",
            content: `You are a PWA requirements specialist. Clarify vague app ideas into specific, implementable PWA requirements.
            
            Your clarifications must include:
            1. Core functionality description
            2. Key user flows
            3. Data requirements
            4. Offline capabilities needed
            5. Device features to access
            6. Performance considerations
            7. Security requirements
            
            Format your response as a Markdown list with clear headings.`
          },
          {
            role: "user",
            content: `Clarify this app idea into specific PWA requirements: "${userPrompt}"`
          }
        ],
        temperature: 0.3 // Lower temperature for more focused responses
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const content = res.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from API during clarification");
    }

    return content.trim();
  } catch (error) {
    console.error("ClarifyPrompt Error:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
    throw new Error(`Clarification failed: ${error.message}`);
  }
}

async function generatePWA(prompt) {
  const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";
  const apiKey = process.env.MINDSDB_API_KEY;

  if (!apiKey) {
    throw new Error("MINDSDB_API_KEY environment variable not set");
  }

  try {
    const res = await axios.post(
      apiUrl,
      {
        model: "chat",
        messages: [
          {
            role: "system",
            content: `You are an expert PWA generator. Create production-ready Progressive Web Apps.
            
            REQUIREMENTS:
            1. Return ONLY valid JSON in this exact format:
            {
              "html": "Complete HTML5 document with:
                - Proper DOCTYPE
                - Viewport meta tag
                - Web App Manifest link
                - Theme-color meta
                - Semantic structure
                - Basic app shell
                - Loading states",
              "js": "Modern JavaScript (ES6+) with:
                - Service worker registration
                - Install prompt handling
                - Cache strategies
                - Error boundaries
                - Accessibility support",
              "manifest": "Web App Manifest (JSON string) with:
                - name, short_name
                - start_url, scope
                - display (standalone)
                - icons (192px, 512px)
                - theme_color, background_color
                - orientation",
              "sw": "Service Worker with:
                - Precaching
                - Runtime caching
                - Offline fallback
                - Versioning
                - Update handling",
              "css": "Responsive CSS with:
                - Mobile-first approach
                - CSS Variables
                - Flexbox/Grid
                - Accessibility
                - Reduced motion support
                - Viewport units"
            }
            
            2. All code must:
               - Pass Lighthouse PWA audit
               - Work offline
               - Be secure (CSP compatible)
               - Be accessible (WCAG AA)
               - Support modern browsers
            3. No explanations, only JSON`
          },
          { 
            role: "user", 
            content: `Generate a complete PWA for: ${prompt}`
          }
        ],
        temperature: 0.2, // Very low temperature for consistent output
        response_format: { type: "json_object" } // Encourage JSON output
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const response = res.data.choices?.[0]?.message?.content;
    if (!response) {
      throw new Error("Empty response from API during generation");
    }

    const jsonString = extractJSON(response);
    if (!isValidJSON(jsonString, PWASchema)) {
      throw new Error("Response does not match required schema");
    }

    const parsedResponse = JSON.parse(jsonString);
    
    // Additional content validation
    if (parsedResponse.html.indexOf('<html') === -1) {
      throw new Error("HTML appears to be incomplete");
    }
    
    if (parsedResponse.js.indexOf('serviceWorker') === -1) {
      throw new Error("JavaScript missing service worker registration");
    }

    return parsedResponse;
  } catch (error) {
    console.error("GeneratePWA Error:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
    throw new Error(`Generation failed: ${error.message}`);
  }
}

exports.handler = async (event, context) => {
  // Enhanced CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: "Method Not Allowed",
        allowedMethods: ["POST", "OPTIONS"]
      })
    };
  }

  try {
    if (!event.body) {
      throw new Error("Request body is required");
    }

    const body = JSON.parse(event.body);
    const { action, prompt } = body;

    if (!action || !prompt) {
      throw new Error("Both action and prompt are required");
    }

    if (!process.env.MINDSDB_API_KEY) {
      throw new Error("Server configuration error");
    }

    let result;
    const startTime = Date.now();
    
    if (action === "clarify") {
      result = { content: await clarifyPrompt(prompt) };
    } else if (action === "generate") {
      result = { content: await generatePWA(prompt) };
    } else {
      throw new Error("Invalid action. Use 'clarify' or 'generate'");
    }

    console.log(`Completed ${action} in ${Date.now() - startTime}ms`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...result,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error("Handler Error:", {
      message: err.message,
      stack: err.stack,
      event: {
        httpMethod: event.httpMethod,
        path: event.path,
        query: event.queryStringParameters
      }
    });

    return {
      statusCode: err.message.includes("Not Allowed") ? 405 : 
                 err.message.includes("required") ? 400 : 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        timestamp: new Date().toISOString()
      })
    };
  }
};
