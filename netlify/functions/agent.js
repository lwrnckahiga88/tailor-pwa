const axios = require("axios");
require("dotenv").config();

async function clarifyPrompt(userPrompt) {
  const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";

  const res = await axios.post(
    apiUrl,
    {
      model: "chat",
      messages: [
        {
          role: "system",
          content: "You help clarify vague app ideas into specific PWA requirements."
        },
        {
          role: "user",
          content: `Clarify this prompt so it's specific enough to generate a real PWA: "${userPrompt}"`
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MINDSDB_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const choices = res.data.choices || [];
  if (!choices[0]?.message?.content) {
    throw new Error("Invalid response from MindsDB during clarification.");
  }

  return choices[0].message.content.trim();
}

async function generatePWA(prompt) {
  const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";

  const res = await axios.post(
    apiUrl,
    {
      model: "chat",
      messages: [
        {
          role: "system",
          content: `You're a PWA generator. Return JSON:
{
  "html": "...",
  "js": "...",
  "manifest": "...",
  "sw": "...",
  "css": "..."
}`
        },
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MINDSDB_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const response = res.data.choices?.[0]?.message?.content;
  if (!response) {
    throw new Error("Invalid response from MindsDB during generation.");
  }

  try {
    return JSON.parse(response.trim());
  } catch (parseErr) {
    throw new Error("Failed to parse JSON from MindsDB response: " + parseErr.message);
  }
}

exports.handler = async (event, context) => {
  // Add CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
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
    const body = JSON.parse(event.body);
    const { action, prompt } = body;

    if (!action || !prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing action or prompt" })
      };
    }

    if (action === "clarify") {
      const content = await clarifyPrompt(prompt);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ content })
      };
    }

    if (action === "generate") {
      const content = await generatePWA(prompt);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ content })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid action provided." })
    };
  } catch (err) {
    console.error("❌ Error during Netlify function execution:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message || "Internal Server Error",
        details: err.stack || null
      })
    };
  }
};
