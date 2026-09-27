/**
 * Secure DMS — Gemini Transient-Failure Retry Test Suite
 *
 * This suite tests the reusable retry mechanism (withGeminiRetry) in
 * isolation. It does NOT call Gemini (no network, no API key required)
 * and it does NOT touch the database. A fake call function is injected
 * so the retry logic is exercised deterministically.
 *
 * Covered behaviors:
 *   - transient 503 / UNAVAILABLE (and 429 / other 5xx) are retried
 *   - a successful retry stops further attempts
 *   - non-transient 4xx / app-level errors are never retried
 *   - when every attempt fails, the final error is propagated unchanged
 *   - Google's JSON error body shape is detected (the exact shape seen
 *     in the live "[doc-classify] diagnostics" log)
 *
 * Usage:  node tests/aiRetry.test.js   (from backend/)
 */

const aiService = require("../src/services/aiService");

const {
  withGeminiRetry,
  isRetryableGeminiError,
  extractErrorStatus,
  GEMINI_RETRY_MAX_ATTEMPTS,
  GEMINI_RETRY_BASE_DELAY_MS,
} = aiService;

// Fast tests: zero the exponential backoff base delay. The mechanism
// reads the exported value at call time, so this keeps the suite quick
// while the production default (300ms) is untouched.
aiService.GEMINI_RETRY_BASE_DELAY_MS = 0;

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log("  PASS " + name);
    pass++;
  } else {
    console.error("  FAIL " + name + (detail ? " -> " + detail : ""));
    fail++;
  }
}

function makeApiError(status, message, extra) {
  const err = new Error(
    message ||
      `{"error":{"code":${status},"message":"boom ${status}","status":"HTTP"}}`
  );
  err.name = "ApiError";
  err.statusCode = status;
  if (extra) {
    Object.assign(err, extra);
  }
  return err;
}

function makeGoogleErrorBody(code, status, message) {
  return new Error(
    JSON.stringify({
      error: {
        code: code,
        message:
          message ||
          "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
        status: status,
      },
    })
  );
}

function summary() {
  console.log("\n========== RESULTS ==========");
  console.log("PASSED: " + pass);
  console.log("FAILED: " + fail);
  console.log("=============================");
  if (fail > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  // --- isRetryableGeminiError: classification of errors -------------
  check(
    "503 (statusCode) is transient",
    isRetryableGeminiError(makeApiError(503)),
    "expected retryable"
  );
  check(
    "429 (rate limit) is transient",
    isRetryableGeminiError(makeApiError(429)),
    "expected retryable"
  );
  check(
    "500 is transient",
    isRetryableGeminiError(makeApiError(500)),
    "expected retryable"
  );
  check(
    "504 is transient",
    isRetryableGeminiError(makeApiError(504)),
    "expected retryable"
  );
  check(
    "Google JSON body (503 UNAVAILABLE) is transient",
    isRetryableGeminiError(makeGoogleErrorBody(503, "UNAVAILABLE")),
    "expected retryable"
  );
  check(
    "Google status string UNAVAILABLE is transient",
    isRetryableGeminiError(
      Object.assign(new Error("uh"), { status: "UNAVAILABLE" })
    ),
    "expected retryable"
  );
  check(
    "RESOURCE_EXHAUSTED status string is transient",
    isRetryableGeminiError(
      Object.assign(new Error("uh"), { status: "RESOURCE_EXHAUSTED" })
    ),
    "expected retryable"
  );

  check(
    "400 (validation) is NOT transient",
    !isRetryableGeminiError(makeApiError(400)),
    "expected non-retryable"
  );
  check(
    "401 (auth) is NOT transient",
    !isRetryableGeminiError(makeApiError(401)),
    "expected non-retryable"
  );
  check(
    "404 is NOT transient",
    !isRetryableGeminiError(makeApiError(404)),
    "expected non-retryable"
  );
  check(
    "422 is NOT transient",
    !isRetryableGeminiError(makeApiError(422)),
    "expected non-retryable"
  );
  check(
    "Google JSON body (400) is NOT transient",
    !isRetryableGeminiError(makeGoogleErrorBody(400, "INVALID_ARGUMENT")),
    "expected non-retryable"
  );
  check(
    "app-level GEMINI_NOT_CONFIGURED is NOT transient",
    !isRetryableGeminiError(
      Object.assign(new Error("Gemini API key is not configured"), {
        code: "GEMINI_NOT_CONFIGURED",
      })
    ),
    "expected non-retryable"
  );
  check(
    "null / undefined errors are NOT transient",
    !isRetryableGeminiError(null) && !isRetryableGeminiError(undefined),
    "expected non-retryable"
  );

  check(
    "extractErrorStatus reads statusCode",
    extractErrorStatus(makeApiError(503)) === 503,
    "expected 503"
  );
  check(
    "extractErrorStatus reads Google JSON body code",
    extractErrorStatus(makeGoogleErrorBody(429, "RESOURCE_EXHAUSTED")) === 429,
    "expected 429"
  );
  check(
    "extractErrorStatus reads response wrapper",
    extractErrorStatus(
      Object.assign(new Error("uh"), { response: { status: 502 } })
    ) === 502,
    "expected 502"
  );
  check(
    "extractErrorStatus reads statusNumber",
    extractErrorStatus(Object.assign(new Error("uh"), { statusNumber: 503 })) ===
      503,
    "expected 503"
  );
  check(
    "extractErrorStatus is undefined for plain errors",
    extractErrorStatus(new Error("plain")) === undefined,
    "expected undefined"
  );

  // --- withGeminiRetry: behavior -----------------------------------
  {
    let attempts = 0;
    const result = await withGeminiRetry(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(makeApiError(503));
      }
      return Promise.resolve("classified!");
    });
    check(
      "503 is retried and eventually succeeds",
      result === "classified!",
      "expected resolved value"
    );
    check(
      "503 retried exactly twice before success (3 total attempts)",
      attempts === 3,
      "attempts=" + attempts
    );
  }

  {
    let attempts = 0;
    const result = await withGeminiRetry(() => {
      attempts++;
      if (attempts < 2) {
        return Promise.reject(makeApiError(503));
      }
      return Promise.resolve("ok");
    });
    check(
      "successful retry stops further attempts",
      result === "ok" && attempts === 2,
      "attempts=" + attempts
    );
  }

  {
    let attempts = 0;
    try {
      await withGeminiRetry(() => {
        attempts++;
        return Promise.reject(makeApiError(400));
      });
      check("client result: 400 is not retried", false, "expected rejection");
    } catch (err) {
      check(
        "client result: 400 is not retried (single attempt)",
        attempts === 1 && err.statusCode === 400,
        "attempts=" + attempts + " status=" + err.statusCode
      );
    }
  }

  {
    let attempts = 0;
    const markerError = makeApiError(503, "final 503 still thrown");
    let caught = null;
    try {
      await withGeminiRetry(() => {
        attempts++;
        return Promise.reject(markerError);
      });
    } catch (err) {
      caught = err;
    }
    check(
      "all retries failing propagates the final error object",
      caught === markerError,
      "expected same error instance"
    );
    check(
      "all retries failing makes max attempts (" +
        GEMINI_RETRY_MAX_ATTEMPTS +
        ")",
      attempts === GEMINI_RETRY_MAX_ATTEMPTS,
      "attempts=" + attempts
    );
  }

  {
    const googleError = makeGoogleErrorBody(503, "UNAVAILABLE");
    googleError.name = "ApiError";
    let attempts = 0;
    const result = await withGeminiRetry(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.reject(googleError);
      }
      return Promise.resolve("recovered");
    });
    check(
      "live diagnostics shape (JSON body 503 UNAVAILABLE) is retried",
      result === "recovered" && attempts === 2,
      "attempts=" + attempts
    );
  }

  {
    let attempts = 0;
    try {
      await withGeminiRetry(() => {
        attempts++;
        return Promise.reject(
          Object.assign(new Error("Gemini API key is not configured"), {
            code: "GEMINI_NOT_CONFIGURED",
          })
        );
      });
    } catch (err) {
      check(
        "GEMINI_NOT_CONFIGURED is not retried",
        attempts === 1 && err.code === "GEMINI_NOT_CONFIGURED",
        "attempts=" + attempts
      );
    }
  }

  check(
    "GEMINI_RETRY_MAX_ATTEMPTS = 3 (1 + 2 retries)",
    GEMINI_RETRY_MAX_ATTEMPTS === 3,
    "value=" + GEMINI_RETRY_MAX_ATTEMPTS
  );
  check(
    "production base delay default is 300ms",
    GEMINI_RETRY_BASE_DELAY_MS === 300,
    "value=" + GEMINI_RETRY_BASE_DELAY_MS
  );

  summary();
}

main();