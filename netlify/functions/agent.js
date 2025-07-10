const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const axios = require("axios");
const { create } = require("ipfs-http-client");
require("dotenv").config();

const publicDir = path.join(__dirname, "..", "..", "public");

// Function to clarify user prompt
async function clarifyPrompt(userPrompt) {
  const apiKey = process.env.CAMEL_API_KEY;
  const baseUrl = process.env.CAMEL_API_BASE_URL || 'https:                        
  const response = await axios.post(`${baseUrl}medical/prompts/validate`, {
    prompt: userPrompt,
  }, {
    headers: {
      '//api.camel.ai/api/v1/';
  const response = await axios.post(`${baseUrl}medical/prompts/validate`, {
    prompt: userPrompt,
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    isValid: response.data.is_valid,
    sanitizedPrompt: response.data.sanitized_prompt,
    warnings: response.data.warnings || [],
  };
}

                           
async function generatePWA(prompt) {
  const apiKey = process.env.CAMEL_API_KEY;
  const baseUrl = process.env.CAMEL_API_BASE_URL || '// Function to generate PWA
async function generatePWA(prompt) {
  const apiKey = process.env.CAMEL_API_KEY;
  const baseUrl = process.env.CAMEL_API_BASE_URL || 'https://api.camel.ai/api/v1/';
  const response = await axios.post(`${baseUrl}medical/pwa/generate`, {
    prompt: prompt,
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, prompt } = body;

    if (!action || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing action or prompt" }),
      };
    }

    if (action === "clarify") {
      const clarification = await clarifyPrompt(prompt);
      return {
        statusCode: 200,
        body: JSON.stringify(clarification),
      };
    }

    if (action === "generate") {
      const pwa = await generatePWA(prompt);
      return {
        statusCode: 200,
        body: JSON.stringify(pwa),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid action provided." }),
    };
  } catch (err) {
    console.error("Error during Netlify function execution:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal Server Error", details: err.stack || null }),
    };
  }
};
