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
  const baseUrl = process.env.CAMEL_API_BASE_URL || 'https://api.camel.ai/api/v1/';
  
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

// Function to generate PWA
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

// Function to create ZIP archive of PWA files
async function createPWAArchive(pwaData, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      console.log(`Archive created: ${archive.pointer()} total bytes`);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add PWA files to archive
    if (pwaData.files) {
      pwaData.files.forEach(file => {
        archive.append(file.content, { name: file.name });
      });
    }

    archive.finalize();
  });
}

// Function to upload to IPFS (optional)
async function uploadToIPFS(filePath) {
  try {
    const ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https'
    });

    const fileBuffer = fs.readFileSync(filePath);
    const result = await ipfs.add(fileBuffer);
    
    return {
      hash: result.cid.toString(),
      url: `https://ipfs.io/ipfs/${result.cid.toString()}`
    };
  } catch (error) {
    console.error('IPFS upload failed:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, prompt, options = {} } = body;

    if (!action || !prompt) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: "Missing action or prompt" }),
      };
    }

    let result;

    switch (action) {
      case "clarify":
        result = await clarifyPrompt(prompt);
        break;

      case "generate":
        const pwaData = await generatePWA(prompt);
        
        // Optionally create archive and upload to IPFS
        if (options.createArchive) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const archivePath = path.join(publicDir, `pwa-${timestamp}.zip`);
          
          await createPWAArchive(pwaData, archivePath);
          
          if (options.uploadToIPFS) {
            const ipfsResult = await uploadToIPFS(archivePath);
            pwaData.archive = {
              localPath: archivePath,
              ipfs: ipfsResult
            };
          } else {
            pwaData.archive = {
              localPath: archivePath
            };
          }
        }
        
        result = pwaData;
        break;

      default:
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: "Invalid action provided. Use 'clarify' or 'generate'" }),
        };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        action,
        data: result,
        timestamp: new Date().toISOString()
      }),
    };

  } catch (err) {
    console.error("Error during Netlify function execution:", err);
    
    // Handle specific error types
    let errorMessage = "Internal Server Error";
    let statusCode = 500;

    if (err.response) {
      // API error
      statusCode = err.response.status;
      errorMessage = err.response.data?.message || err.message;
    } else if (err.code === 'ENOENT') {
      // File system error
      errorMessage = "File system error";
    } else if (err.code === 'ECONNREFUSED') {
      // Connection error
      errorMessage = "Unable to connect to external service";
    }

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? err.stack : null,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
