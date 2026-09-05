const { generateText } = require("../services/aiService");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * POST /api/ai/test
 * Protected (JWT). Generates a short text response from a user prompt
 * via Gemini. The client may not select the model or supply an API key.
 */
async function aiTest(req, res, next) {
  try {
    const prompt = req.body.prompt.trim();

    const answer = await generateText(prompt);

    return res.json({
      success: true,
      answer,
    });
  } catch (err) {
    if (err.code === "GEMINI_NOT_CONFIGURED") {
      return next(httpError(500, "AI service is not configured"));
    }

    // Never leak SDK internals, the API key, or stack traces to the client.
    // Log only a fixed, safe diagnostic line.
    console.error("AI text generation failed");
    return next(httpError(502, "AI service is temporarily unavailable"));
  }
}

module.exports = {
  aiTest,
};