function addSymptomField() {
  const container = document.getElementById("symptom-list");
  const div = document.createElement("div");
  div.className = "flex space-x-2 mb-2";
  div.innerHTML = `
    <input type="text" placeholder="Symptom name" class="symptom-name border p-2 w-1/2" />
    <input type="text" placeholder="Symptom value (Yes/No)" class="symptom-value border p-2 w-1/2" />
  `;
  container.appendChild(div);
}

async function submitSymptoms() {
  const names = document.querySelectorAll(".symptom-name");
  const values = document.querySelectorAll(".symptom-value");

  const symptoms = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i].value.trim();
    const value = values[i].value.trim();
    if (name && value) {
      symptoms.push({ name, value });
    }
  }

  const resultBox = document.getElementById("result");
  resultBox.innerText = "Analyzing symptoms...";

  try {
    const res = await fetch("/.netlify/functions/generateClinicalPWA", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symptoms,
        options: {
          createArchive: true,
          uploadToIPFS: true
        }
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    resultBox.innerText = `
Session: ${data.sessionId}

🔍 Diagnosed Conditions:
${Object.entries(data.diseases).map(([d, p]) => `- ${d}: ${p.toFixed(2)}`).join("\n")}

📘 Summary:
${data.explanation}

📦 Archive: ${data.archive?.ipfs?.url || data.archive?.localPath}
    `;
  } catch (err) {
    resultBox.innerText = `Error: ${err.message}`;
  }
}
