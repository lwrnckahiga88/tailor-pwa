const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

// Optional: for PWA output later
const publicDir = path.join(__dirname, "..", "..", "public");

// === 1. Clarify Prompt using MindsDB ===
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

  return res.data.choices?.[0]?.message?.content?.trim();
}

// === 2. Generate PWA Files ===
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

  return JSON.parse(res.data.choices?.[0]?.message?.content?.trim());
}

// === Netlify Lambda Handler ===
exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, prompt } = body;

    if (!action || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing action or prompt" })
      };
    }

    let content;

    if (action === "clarify") {
      content = await clarifyPrompt(prompt);
    } else if (action === "generate") {
      content = await generatePWA(prompt);
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid action specified" })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ content })
    };
  } catch (err) {
    console.error("❌ Function error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal Server Error" })
    };
  }
};
