const axios = require("axios");
require("dotenv").config();

// Helper function to validate JSON response
function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

// Extract JSON from response that might have markdown formatting
function extractJSON(response) {
  // Remove markdown code blocks if present
  const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
  
  // Try to find JSON object in the response
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return cleanResponse;
}

async function clarifyPrompt(userPrompt) {
  const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";

  try {
    const res = await axios.post(
      apiUrl,
      {
        model: "chat",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that clarifies vague app ideas into specific PWA requirements. 
            Focus on making the requirements clear, specific, and implementable. 
            Consider features like offline functionality, responsive design, and mobile-first approach.`
          },
          {
            role: "user",
            content: `Clarify this prompt so it's specific enough to generate a real Progressive Web App: "${userPrompt}"`
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MINDSDB_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const choices = res.data.choices || [];
    if (!choices[0]?.message?.content) {
      throw new Error("Invalid response from MindsDB during clarification.");
    }

    return choices[0].message.content.trim();
  } catch (error) {
    console.error("Error in clarifyPrompt:", error.message);
    throw new Error(`Failed to clarify prompt: ${error.message}`);
  }
}

async function generatePWA(prompt) {
  const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";

  try {
    const res = await axios.post(
      apiUrl,
      {
        model: "chat",
        messages: [
          {
            role: "system",
            content: `You are a PWA generator that creates complete Progressive Web Apps. 
            Return ONLY valid JSON in this exact format:
            {
              "html": "complete HTML with viewport meta tag and manifest link",
              "js": "JavaScript with service worker registration",
              "manifest": "web app manifest JSON as string",
              "sw": "service worker JavaScript code",
              "css": "responsive CSS with mobile-first design"
            }
            
            Make sure:
            - HTML includes proper PWA meta tags
            - CSS is responsive and mobile-first
            - JS includes service worker registration
            - Manifest includes all required PWA fields
            - Service worker handles offline functionality
            - No markdown formatting in response`
          },
          { 
            role: "user", 
            content: `Generate a complete PWA for: ${prompt}` 
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MINDSDB_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000 // 60 second timeout for generation
      }
    );

    const response = res.data.choices?.[0]?.message?.content;
    if (!response) {
      throw new Error("Invalid response from MindsDB during generation.");
    }

    try {
      const jsonString = extractJSON(response);
      const parsedResponse = JSON.parse(jsonString);
      
      // Validate required fields
      const requiredFields = ['html', 'js', 'manifest', 'sw', 'css'];
      const missingFields = requiredFields.filter(field => !parsedResponse[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      return parsedResponse;
    } catch (parseErr) {
      console.error("JSON Parse Error:", parseErr.message);
      console.error("Response content:", response);
      throw new Error(`Failed to parse JSON from MindsDB response: ${parseErr.message}`);
    }
  } catch (error) {
    console.error("Error in generatePWA:", error.message);
    throw new Error(`Failed to generate PWA: ${error.message}`);
  }
}

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Request body is required" })
      };
    }

    const body = JSON.parse(event.body);
    const { action, prompt } = body;

    if (!action || !prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing action or prompt" })
      };
    }

    // Validate environment variables
    if (!process.env.MINDSDB_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "MindsDB API key not configured" })
      };
    }

    let result;
    
    if (action === "clarify") {
      const content = await clarifyPrompt(prompt);
      result = { content };
    } else if (action === "generate") {
      const content = await generatePWA(prompt);
      result = { content };
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid action. Use 'clarify' or 'generate'" })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error("❌ Error during Netlify function execution:", err);
    
    // Return more specific error information
    const errorResponse = {
      error: err.message || "Internal Server Error",
      timestamp: new Date().toISOString()
    };

    // Only include stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = err.stack;
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(errorResponse)
    };
  }
};
