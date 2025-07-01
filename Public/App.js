// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(() => {
        console.log("✅ Service worker registered");
      })
      .catch((err) => {
        console.error("❌ Service worker registration failed:", err);
      });
  });
}

// DOM Elements
const promptInput = document.getElementById("prompt");
const generateBtn = document.getElementById("generateBtn");
const log = document.getElementById("log");

// Handle Generate Button Click
generateBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    log.textContent = "⚠️ Please enter a prompt.";
    return;
  }

  log.textContent = "🤖 Generating your PWA...";
  generateBtn.disabled = true;

  try {
    const response = await fetch("/netlify/functions/pwa-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    log.textContent = `✅ Generated PWA files:\n\n${Object.keys(result)
      .map((key) => `${key.toUpperCase()}:\n${result[key].slice(0, 200)}...\n`)
      .join("\n")}`;
  } catch (error) {
    console.error("❌ Error:", error);
    log.textContent = `❌ ${error.message}`;
  } finally {
    generateBtn.disabled = false;
  }
});
