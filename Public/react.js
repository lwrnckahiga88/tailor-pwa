import React, { useState } from "react"; import axios from "axios"; import { Button } from "@/components/ui/button"; import { Card, CardContent } from "@/components/ui/card"; import { Input } from "@/components/ui/input"; import { Textarea } from "@/components/ui/textarea";

export default function PwaAgentUI() { const [prompt, setPrompt] = useState(""); const [loading, setLoading] = useState(false); const [log, setLog] = useState([]);

const handleRunAgent = async () => { setLoading(true); setLog(["🤖 Clarifying prompt..."]);

try {
  const response = await axios.post("/api/pwa-agent", { prompt });
  const { netlifyUrl, ipfsUrl } = response.data;

  setLog((prev) => [
    ...prev,
    "✅ Files generated and served locally at http://localhost:3000",
    `🚀 Netlify deployed: ${netlifyUrl}`,
    `📡 IPFS uploaded: ${ipfsUrl}`,
    "🎉 Done!"
  ]);
} catch (error) {
  setLog((prev) => [...prev, "❌ Error running agent", error.message]);
} finally {
  setLoading(false);
}

};

return ( <div className="p-6 max-w-3xl mx-auto space-y-4"> <Card className="shadow-xl"> <CardContent className="space-y-4"> <h2 className="text-xl font-bold">AI PWA Agent</h2> <Textarea placeholder="Describe your PWA app (e.g. Weather app with offline support)" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} /> <Button onClick={handleRunAgent} disabled={loading}> {loading ? "Running..." : "Generate & Deploy PWA"} </Button> </CardContent> </Card>

{log.length > 0 && (
    <Card className="shadow-md">
      <CardContent>
        <h3 className="font-semibold mb-2">Agent Log</h3>
        <ul className="text-sm space-y-1">
          {log.map((entry, idx) => (
            <li key={idx}>{entry}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )}
</div>

); }
