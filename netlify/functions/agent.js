const fs = require("fs"); const path = require("path"); const archiver = require("archiver"); const axios = require("axios"); const { create } = require("ipfs-http-client"); require("dotenv").config();

const publicDir = path.join(__dirname, "../../public");

const clarifyPrompt = async (userPrompt) => { const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";

const res = await axios.post( apiUrl, { model: "chat", messages: [ { role: "system", content: "You help clarify vague app ideas into specific PWA requirements." }, { role: "user", content: Clarify this prompt so it's specific enough to generate a real PWA: "${userPrompt}" } ] }, { headers: { "Authorization": Bearer ${process.env.MINDSDB_API_KEY}, "Content-Type": "application/json" } } );

return res.data.choices[0].message.content.trim(); };

const generatePWA = async (prompt) => { const apiUrl = process.env.MINDSDB_API_URL || "https://llm.mdb.ai";

const res = await axios.post( apiUrl, { model: "chat", messages: [ { role: "system", content: You're a PWA generator. Return JSON:\n{\n  "html": "...",\n  "js": "...",\n  "manifest": "...",\n  "sw": "...",\n  "css": "..."\n} }, { role: "user", content: prompt } ] }, { headers: { "Authorization": Bearer ${process.env.MINDSDB_API_KEY}, "Content-Type": "application/json" } } );

return JSON.parse(res.data.choices[0].message.content.trim()); };

const writeFiles = (files) => { if (fs.existsSync(publicDir)) fs.rmSync(publicDir, { recursive: true }); fs.mkdirSync(publicDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, "index.html"), files.html); fs.writeFileSync(path.join(publicDir, "app.js"), files.js); fs.writeFileSync(path.join(publicDir, "manifest.json"), files.manifest); fs.writeFileSync(path.join(publicDir, "service-worker.js"), files.sw); fs.writeFileSync(path.join(publicDir, "style.css"), files.css || ""); };

const zipFiles = () => { return new Promise((resolve, reject) => { const output = fs.createWriteStream("output.zip"); const archive = archiver("zip", { zlib: { level: 9 } });

archive.pipe(output);
archive.directory(publicDir, false);
archive.finalize();

output.on("close", () => resolve());
archive.on("error", reject);

}); };

const deployToNetlify = async () => { const formData = new FormData(); const files = fs.readdirSync(publicDir);

for (const file of files) { formData.append(file, fs.createReadStream(path.join(publicDir, file))); }

const headers = { Authorization: Bearer ${process.env.NETLIFY_AUTH_TOKEN}, ...formData.getHeaders?.() };

const res = await axios.post( https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/deploys, formData, { headers } );

return res.data.deploy_ssl_url; };

const uploadToIPFS = async () => { const ipfs = create({ url: "https://ipfs.infura.io:5001" }); const files = fs.readdirSync(publicDir).map((file) => ({ path: file, content: fs.readFileSync(path.join(publicDir, file)) }));

const { cid } = await ipfs.addAll(files, { wrapWithDirectory: true }).next(); return https://ipfs.io/ipfs/${cid.value.toString()}; };

exports.handler = async function (event) { try { if (event.httpMethod !== "POST") { return { statusCode: 405, body: "Method Not Allowed" }; }

const { action, prompt } = JSON.parse(event.body);

if (action === "clarify") {
  const content = await clarifyPrompt(prompt);
  return { statusCode: 200, body: JSON.stringify({ content }) };
}

if (action === "generate") {
  const content = await generatePWA(prompt);
  return { statusCode: 200, body: JSON.stringify({ content }) };
}

if (action === "write") {
  writeFiles(prompt); // prompt is assumed to be the files object
  return { statusCode: 200, body: JSON.stringify({ status: "Files written" }) };
}

if (action === "zip") {
  await zipFiles();
  return { statusCode: 200, body: JSON.stringify({ status: "Project zipped" }) };
}

if (action === "deploy") {
  const url = await deployToNetlify();
  return { statusCode: 200, body: JSON.stringify({ url }) };
}

if (action === "ipfs") {
  const url = await uploadToIPFS();
  return { statusCode: 200, body: JSON.stringify({ url }) };
}

return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };

} catch (err) { return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; } };

