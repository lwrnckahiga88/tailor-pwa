const express = require("express");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { create } = require("ipfs-http-client");
const archiver = require("archiver");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const PORT = 5000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const publicDir = path.join(__dirname, "public");

app.use(cors());
app.use(express.json());

// === Core agent logic ===
async function clarifyPrompt(prompt) {
  const chat = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You clarify vague PWA ideas into concrete app specs." },
      { role: "user", content: `Clarify this: ${prompt}` }
    ]
  });
  return chat.choices[0].message.content.trim();
}

async function generatePWA(prompt) {
  const chat = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Return JSON: {"html":"...", "js":"...", "manifest":"...", "sw":"...", "css":"..."}`
      },
      { role: "user", content: prompt }
    ]
  });
  return JSON.parse(chat.choices[0].message.content.trim());
}

function writeFiles({ html, js, manifest, sw, css }) {
  if (fs.existsSync(publicDir)) fs.rmSync(publicDir, { recursive: true });
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, "index.html"), html);
  fs.writeFileSync(path.join(publicDir, "app.js"), js);
  fs.writeFileSync(path.join(publicDir, "manifest.json"), manifest);
  fs.writeFileSync(path.join(publicDir, "service-worker.js"), sw);
  fs.writeFileSync(path.join(publicDir, "style.css"), css);
}

async function zipFiles() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream("output.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);
    archive.directory("public/", false);
    archive.finalize();
    output.on("close", () => resolve());
    archive.on("error", reject);
  });
}

async function deployToNetlify() {
  const form = new FormData();
  fs.readdirSync(publicDir).forEach((file) => {
    form.append(file, fs.createReadStream(path.join(publicDir, file)));
  });

  const res = await axios.post(
    `https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/deploys`,
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`,
        ...form.getHeaders()
      }
    }
  );

  return res.data.deploy_ssl_url;
}

async function uploadToIPFS() {
  const ipfs = create({ url: "https://ipfs.infura.io:5001" });
  const files = fs.readdirSync(publicDir).map((file) => ({
    path: file,
    content: fs.readFileSync(path.join(publicDir, file)),
  }));

  const { cid } = await ipfs.addAll(files, { wrapWithDirectory: true }).next();
  return `https://ipfs.io/ipfs/${cid.value.toString()}`;
}

// === API Route ===
app.post("/api/pwa-agent", async (req, res) => {
  try {
    const { prompt } = req.body;
    const clarified = await clarifyPrompt(prompt);
    const files = await generatePWA(clarified);
    writeFiles(files);
    await zipFiles();
    const netlifyUrl = await deployToNetlify();
    const ipfsUrl = await uploadToIPFS();
    res.json({ netlifyUrl, ipfsUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔌 Server running on http://localhost:${PORT}`);
});
