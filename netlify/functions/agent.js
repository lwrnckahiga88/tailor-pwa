const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const axios = require("axios");
const { create } = require("ipfs-http-client");
require("dotenv").config();

const publicDir = path.join(__dirname, "..", "..", "public");
const endlessAPI = "https://api.endlessmedical.com/v1/dx";

async function runDiagnosis(symptoms) {
  // Step 1: Start Session
  const sessionRes = await axios.post(`${endlessAPI}/StartSession`);
  const sessionId = sessionRes.data.SessionID;

  // Step 2: Add symptoms
  for (const s of symptoms) {
    await axios.post(`${endlessAPI}/AddSymptom`, {
      SessionID: sessionId,
      SymptomName: s.name,
      SymptomValue: s.value
    });
  }

  // Step 3: Analyze
  const analyzeRes = await axios.post(`${endlessAPI}/Analyze`, {
    SessionID: sessionId
  });

  const diseases = analyzeRes.data.Diseases;
  return { sessionId, diseases };
}

async function getLLMExplanation(symptoms, diseases) {
  const formattedDiseases = Object.entries(diseases)
    .map(([name, prob]) => `- ${name}: ${prob.toFixed(2)}`)
    .join("\n");

  const prompt = `
You are a clinical assistant. Below is a diagnostic engine's output based on symptoms provided by a clinician. Interpret the findings and recommend next steps.

[Symptom Input]
${symptoms.map(s => "- " + s.name).join("\n")}

[Diagnostic Output]
${formattedDiseases}

[Instruction]
Summarize key risks, recommend urgent steps if needed.
`;

  const hfRes = await axios.post(
    "https://api-inference.huggingface.co/models/starmpcc/Asclepius-Llama3-8B",
    { inputs: prompt },
    {
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`
      }
    }
  );

  return hfRes.data?.[0]?.generated_text?.trim() || "No output";
}

async function createPWAArchive(content, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outputPath));
    archive.on("error", reject);
    archive.pipe(output);

    archive.append(content, { name: "diagnosis.txt" });
    archive.finalize();
  });
}

async function uploadToIPFS(filePath) {
  const ipfs = create({
    host: "ipfs.infura.io",
    port: 5001,
    protocol: "https"
  });

  const fileBuffer = fs.readFileSync(filePath);
  const result = await ipfs.add(fileBuffer);
  return {
    hash: result.cid.toString(),
    url: `https://ipfs.io/ipfs/${result.cid.toString()}`
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { symptoms, options = {} } = body;

    if (!symptoms || !Array.isArray(symptoms)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid symptoms array" })
      };
    }

    // Step 1: Diagnose
    const { sessionId, diseases } = await runDiagnosis(symptoms);

    // Step 2: Ask LLM
    const explanation = await getLLMExplanation(symptoms, diseases);

    const resultContent = `
Session ID: ${sessionId}

[DISEASE PROBABILITIES]
${Object.entries(diseases).map(([d, p]) => `- ${d}: ${p.toFixed(2)}`).join("\n")}

[LLM INTERPRETATION]
${explanation}
`;

    let archiveInfo = null;

    if (options.createArchive) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archivePath = path.join(publicDir, `clinical-pwa-${timestamp}.zip`);
      await createPWAArchive(resultContent, archivePath);

      if (options.uploadToIPFS) {
        const ipfsResult = await uploadToIPFS(archivePath);
        archiveInfo = { localPath: archivePath, ipfs: ipfsResult };
      } else {
        archiveInfo = { localPath: archivePath };
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        sessionId,
        diseases,
        explanation,
        archive: archiveInfo,
        timestamp: new Date().toISOString()
      })
    };
  } catch (err) {
    console.error("Clinical PWA Generation Error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : null,
        timestamp: new Date().toISOString()
      })
    };
  }
};
