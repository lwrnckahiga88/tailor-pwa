// === Service Worker Registration ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(() => console.log("✅ Service worker registered"))
      .catch((err) => console.error("❌ Service worker registration failed:", err));
  });
}

// === DOM Elements ===
const promptInput = document.getElementById("prompt");
const generateBtn = document.getElementById("generateBtn");
const log = document.getElementById("log");

// === Flash Log Utility ===
function flashLog(success = true) {
  log.classList.remove("flash-success", "flash-error");
  log.classList.add(success ? "flash-success" : "flash-error");
  setTimeout(() => log.classList.remove("flash-success", "flash-error"), 400);
}

// === Loading Animation ===
let loadingInterval;
function startLoadingAnimation() {
  let dots = 0;
  loadingInterval = setInterval(() => {
    log.textContent = `🤖 Generating your PWA${'.'.repeat(dots % 4)}`;
    dots++;
  }, 400);
}

function stopLoadingAnimation() {
  clearInterval(loadingInterval);
}

// === Main Generate Logic ===
generateBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    log.textContent = "⚠️ Please enter a prompt.";
    flashLog(false);
    return;
  }

  generateBtn.disabled = true;
  startLoadingAnimation();

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
    stopLoadingAnimation();

    log.textContent = `✅ Generated PWA files:\n\n${Object.keys(result)
      .map((key) => `📄 ${key.toUpperCase()}:\n${result[key].slice(0, 200)}...\n`)
      .join("\n")}`;
    
    flashLog(true);
  } catch (error) {
    stopLoadingAnimation();
    log.textContent = `❌ ${error.message}`;
    flashLog(false);
  } finally {
    generateBtn.disabled = false;
  }
});
