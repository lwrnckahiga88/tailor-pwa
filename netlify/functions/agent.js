const fs = require("fs");
const path = require("path");
const express = require("express");
const archiver = require("archiver");
const axios = require("axios");
const readline = require("readline");
const { create } = require("ipfs-http-client");
const { execSync } = require("child_process");
require("dotenv").config();

// Auto-install required packages
const requiredPackages = [
  "express", "archiver", "dotenv", "ipfs-http-client", "axios"
];

requiredPackages.forEach(pkg => {
  try {
    require.resolve(pkg);
  } catch (e) {
    console.log(`📦 Installing ${pkg}...`);
    execSync(`npm install ${pkg}`, { stdio: "inherit" });
  }
});

const publicDir = path.join(__dirname, "public");

// Setup public folder and .env.example
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
  console.log("📁 Created public/ folder.");
}

if (!fs.existsSync(".env.example")) {
  fs.writeFileSync(".env.example", `# Rename this file to .env and fill in the keys
MINDSDB_API_KEY=your_mindsdb_api_key
MINDSDB_API_URL=https://llm.mdb.ai
NETLIFY_AUTH_TOKEN=your_netlify_token
NETLIFY_SITE_ID=your_netlify_site_id
`);
  console.log("🔐 Created .env.example");
}

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
        "Authorization": `Bearer ${process.env.MINDSDB_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content.trim();
}

// === 2. Generate PWA Files using MindsDB ===
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
        "Authorization": `Bearer ${process.env.MINDSDB_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return JSON.parse(res.data.choices[0].message.content.trim());
}

// === 3. Write Files ===
function writeFiles(files) {
  if (fs.existsSync(publicDir)) fs.rmSync(publicDir, { recursive: true });
  fs.mkdirSync(publicDir);

  fs.writeFileSync(path.join(publicDir, "index.html"), files.html);
  fs.writeFileSync(path.join(publicDir, "app.js"), files.js);
  fs.writeFileSync(path.join(publicDir, "manifest.json"), files.manifest);
  fs.writeFileSync(path.join(publicDir, "service-worker.js"), files.sw);
  fs.writeFileSync(path.join(publicDir, "style.css"), files.css || "");
  console.log("📁 Files written to public/");
}

// === 4. Serve Locally ===
function servePWA() {
  const app = express();
  app.use(express.static("public"));
  app.listen(3000, () =>
    console.log("🌐 Local PWA running at: http://localhost:3000")
  );
}

// === 5. Zip Project ===
function zipFiles() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream("output.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory("public/", false);
    archive.finalize();

    output.on("close", () => {
      console.log("📦 Project zipped as output.zip");
      resolve();
    });

    archive.on("error", reject);
  });
}

// === 6. Deploy to Netlify ===
async function deployToNetlify() {
  const formData = new FormData();
  const files = fs.readdirSync(publicDir);
  for (const file of files) {
    formData.append(file, fs.createReadStream(path.join(publicDir, file)));
  }

  const headers = {
    Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`,
    ...formData.getHeaders?.()
  };

  try {
    const res = await axios.post(
      `https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/deploys`,
      formData,
      { headers }
    );

    console.log("🚀 Netlify deployed:", res.data.deploy_ssl_url);
    return res.data.deploy_ssl_url;
  } catch (err) {
    console.error("❌ Netlify deployment failed:", err.message);
    return null;
  }
}

// === 7. Upload to IPFS ===
async function uploadToIPFS() {
  const ipfs = create({ url: "https://ipfs.infura.io:5001" });
  const files = fs.readdirSync(publicDir).map((file) => ({
    path: file,
    content: fs.readFileSync(path.join(publicDir, file)),
  }));

  const { cid } = await ipfs.addAll(files, { wrapWithDirectory: true }).next();
  const ipfsUrl = `https://ipfs.io/ipfs/${cid.value.toString()}`;
  console.log("📡 IPFS uploaded:", ipfsUrl);
  return ipfsUrl;
}

// === Main Agent ===
async function runAgent() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question("🤖 Describe your PWA app: ", async (userPrompt) => {
    rl.close();

    try {
      console.log("\n🧠 Clarifying prompt...");
      const refinedPrompt = await clarifyPrompt(userPrompt);
      console.log("✏️ Refined:", refinedPrompt);

      console.log("\n🛠 Generating PWA files...");
      const files = await generatePWA(refinedPrompt);

      writeFiles(files);
      servePWA();
      await zipFiles();

      console.log("\n🌍 Deploying to Netlify...");
      await deployToNetlify();

      console.log("\n📡 Uploading to IPFS...");
      await uploadToIPFS();

      console.log("\n✅ All done! Your AI-generated PWA is ready.");
    } catch (err) {
      console.error("❌ Error occurred:", err.message);
    }
  });
}

runAgent();
