const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

// Model configuration lives in one place so it can be swapped easily.
// Override via GEMINI_MODEL env if needed for a hackathon prototype.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

let aiClient = null;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const err = new Error("Gemini API key is not configured");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }

  return aiClient;
}

/**
 * Generate text from a prompt using Gemini.
 * The API key is only ever read from process.env and is never
 * returned or logged. The client is created lazily so the server
 * can start even if the key is temporarily missing.
 *
 * @param {string} prompt
 * @returns {Promise<string>} the generated text
 */
async function generateText(prompt) {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text =
    response && typeof response.text === "string" ? response.text.trim() : "";

  if (!text) {
    const err = new Error("Gemini returned an empty response");
    err.code = "GEMINI_EMPTY_RESPONSE";
    throw err;
  }

  return text;
}

module.exports = {
  generateText,
  GEMINI_MODEL,
  getAiClient,
};