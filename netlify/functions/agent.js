const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const axios = require("axios");
const { create } = require("ipfs-http-client");
require("dotenv").config();

const publicDir = path.join(__dirname, "..", "..", "public");

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

  return res.data.choices[0].message.content.trim();
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

  return JSON.parse(res.data.choices[0].message.content.trim());
}

// Netlify handler
exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
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

    if (action === "clarify") {
      const content = await clarifyPrompt(prompt);
      return {
        statusCode: 200,
        body: JSON.stringify({ content })
      };
    }

    if (action === "generate") {
      const content = await generatePWA(prompt);
      return {
        statusCode: 200,
        body: JSON.stringify({ content })
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid action" })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal Server Error" })
    };
  }
};
