const axios = require("axios");
require("dotenv").config();

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Only POST method allowed" })
    };
  }

  try {
    const { note, question } = JSON.parse(event.body);

    if (!note || !question) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'note' or 'question' in request body" })
      };
    }

    const prompt = `
You are an intelligent clinical language model. Below is a snippet of patient's discharge summary and a following instruction from healthcare professional. Write a response that appropriately completes the instruction. The response should provide the accurate answer to the instruction, while being concise.

[Discharge Summary Begin]
${note}
[Discharge Summary End]

[Instruction Begin]
${question}
[Instruction End]
`;

    const response = await axios.post(
      "https://api-inference.huggingface.co/models/starmpcc/Asclepius-Llama3-8B",
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`
        }
      }
    );

    const result = response.data?.[0]?.generated_text || "No response from model.";
    return {
      statusCode: 200,
      body: JSON.stringify({ response: result.trim() })
    };
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process request",
        detail: err.response?.data || err.message
      })
    };
  }
};
