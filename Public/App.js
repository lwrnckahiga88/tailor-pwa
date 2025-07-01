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

// === Utility: Animate dots while loading ===
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

// === Handle Generate Button Click ===
generateBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    log.textContent = "⚠️ Please enter a prompt.";
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

  } catch (error) {
    stopLoadingAnimation();
    console.error("❌ Error:", error);
    log.textContent = `❌ ${error.message}`;
  } finally {
    generateBtn.disabled = false;
  }
  pre.flash {
  animation: flashGreen 0.4s ease-in-out;
}

@keyframes flashGreen {
  0% { background-color: #0f0; color: black; }
  100% { background-color: black; color: #0f0; }
}
});
