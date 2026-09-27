/**
 * Secure DMS — AI Document Classification Test Suite
 *
 * This suite tests the classification logic in isolation. It does NOT call
 * Gemini (no network, no API key required) and it does NOT touch the
 * database. It imports pure helpers only:
 *
 *   - parseClassificationOutput   (sanitizes/whitelists the model output)
 *   - normalizeCategory           (case-insensitive whitelist match)
 *   - clampConfidence             (0..1 normalization)
 *   - limitReason                 (whitespace collapse + length bound)
 *   - buildClassificationPrompt   (untrusted-data fencing)
 *   - buildClassificationAuditDetails (metadata-only audit payload)
 *   - mapClassificationToVersion  (per-version scoping)
 *   - classifyDocumentText        (empty-text guard only — throws before
 *                                  any network call)
 *
 * Usage:  node tests/aiClassification.test.js   (from backend/)
 */

const {
  parseClassificationOutput,
  buildClassificationPrompt,
  normalizeCategory,
  clampConfidence,
  limitReason,
  buildClassificationAuditDetails,
  classifyDocumentText,
  CLASSIFICATION_CATEGORIES,
  CLASSIFICATION_REASON_MAX_CHARS,
} = require("../src/services/aiService");
const {
  mapClassificationToVersion,
} = require("../src/models/documentClassificationModel");

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

function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function summary() {
  console.log("\n========== RESULTS ==========");
  console.log("PASSED: " + pass);
  console.log("FAILED: " + fail);
  console.log("=============================");
  return fail === 0;
}

async function main() {
  console.log("\n=== AI Document Classification ===");

  // ---- TEST 1: a valid classification output ----
  console.log("\n=== TEST 1: valid category ===");
  let got = parseClassificationOutput(
    JSON.stringify({
      category: "Evidence",
      confidence: 0.94,
      reason: "The document contains records describing collected digital evidence.",
    })
  );
  check(
    "valid output parses to category/confidence/reason",
    deepEqual(got, {
      category: "Evidence",
      confidence: 0.94,
      reason: "The document contains records describing collected digital evidence.",
    }),
    JSON.stringify(got)
  );

  check(
    "confidence 0.94 is preserved",
    got && got.confidence === 0.94,
    String(got && got.confidence)
  );

  // ---- TEST 2: every allowed category ----
  console.log("\n=== TEST 2: every allowed category ===");
  const allowed = [
    "FIR",
    "FIR Report",
    "Investigation Report",
    "Witness Statement",
    "Charge Sheet",
    "Forensic Report",
    "Court Filing",
    "Evidence",
    "Legal Notice",
    "Other",
  ];
  check(
    "CLASSIFICATION_CATEGORIES matches the project document-type vocabulary",
    deepEqual(CLASSIFICATION_CATEGORIES, allowed),
    JSON.stringify(CLASSIFICATION_CATEGORIES)
  );

  let allCatsOk = true;
  for (const category of allowed) {
    const parsed = parseClassificationOutput(
      JSON.stringify({ category, confidence: 0.9, reason: "r" })
    );
    if (!parsed || parsed.category !== category) {
      allCatsOk = false;
      console.error("  bad category: " + category + " -> " + (parsed && parsed.category));
    }
  }
  check("every allowed category round-trips through the parser", allCatsOk);

  let allNormOk = true;
  for (const category of allowed) {
    if (normalizeCategory(category) !== category) {
      allNormOk = false;
      console.error("  normalize failed for: " + category);
    }
  }
  check("normalizeCategory preserves every allowed category", allNormOk);

  // ---- TEST 3: case-insensitive normalization ----
  console.log("\n=== TEST 3: case-insensitive categories ===");
  check(
    "lowercase 'evidence' -> Evidence",
    normalizeCategory("evidence") === "Evidence",
    normalizeCategory("evidence")
  );
  check(
    "uppercase 'EVIDENCE' -> Evidence",
    normalizeCategory("EVIDENCE") === "Evidence",
    normalizeCategory("EVIDENCE")
  );
  check(
    "whitespace padded ' Evidence ' -> Evidence",
    normalizeCategory(" Evidence ") === "Evidence",
    normalizeCategory(" Evidence ")
  );
  check(
    "mixed case 'FIR Report' -> FIR Report",
    normalizeCategory("fIr RePoRt") === "FIR Report",
    normalizeCategory("fIr RePoRt")
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR report", confidence: 0.8, reason: "r" })
  );
  check(
    "parser normalizes 'FIR report' to FIR Report",
    got && got.category === "FIR Report",
    JSON.stringify(got)
  );
  check(
    "parser normalizes 'witness statement' to Witness Statement",
    parseClassificationOutput(
      JSON.stringify({ category: "witness statement", confidence: 0.8, reason: "r" })
    ).category === "Witness Statement"
  );

  // ---- TEST 4: unknown categories become Other ----
  console.log("\n=== TEST 4: unknown category -> Other ===");
  check(
    "fabricated 'Judgment / Court Order' -> Other",
    normalizeCategory("Judgment / Court Order") === "Other"
  );
  check(
    "unknown 'Notary Deed' -> Other",
    normalizeCategory("Notary Deed") === "Other"
  );
  check(
    "non-string category -> Other",
    normalizeCategory(123) === "Other"
  );
  check(
    "null category -> Other",
    normalizeCategory(null) === "Other"
  );
  check(
    "undefined category -> Other",
    normalizeCategory(undefined) === "Other"
  );
  check(
    "empty string category -> Other",
    normalizeCategory("") === "Other"
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "Made-up Category", confidence: 0.99, reason: "r" })
  );
  check(
    "parser maps an unknown model category to Other",
    got && got.category === "Other",
    JSON.stringify(got)
  );

  // ---- TEST 5: malformed Gemini JSON is handled safely ----
  console.log("\n=== TEST 5: malformed JSON ===");
  got = parseClassificationOutput("this is not json at all");
  check(
    "non-JSON answer returns null",
    got === null,
    JSON.stringify(got)
  );
  got = parseClassificationOutput("");
  check(
    "empty answer returns null",
    got === null,
    JSON.stringify(got)
  );
  got = parseClassificationOutput(null);
  check(
    "null answer returns null",
    got === null
  );
  got = parseClassificationOutput("{\"category\":\"Evidence\", broken");
  check(
    "truncated JSON object returns null",
    got === null,
    JSON.stringify(got)
  );
  got = parseClassificationOutput("[]");
  check(
    "array answer returns null (not a classification object)",
    got === null,
    JSON.stringify(got)
  );
  got = parseClassificationOutput("42");
  check(
    "primitive answer returns null",
    got === null,
    JSON.stringify(got)
  );
  got = parseClassificationOutput('Here is the answer: {"category":"FIR","confidence":0.8,"reason":"ok"}');
  check(
    "JSON embedded inside prose is extracted",
    got && got.category === "FIR",
    JSON.stringify(got)
  );
  got = parseClassificationOutput('```json\n{"category":"FIR","confidence":0.8,"reason":"ok"}\n```');
  check(
    "JSON wrapped in markdown fences is parsed",
    got && got.category === "FIR",
    JSON.stringify(got)
  );

  // ---- TEST 6: missing category ----
  console.log("\n=== TEST 6: missing category ===");
  got = parseClassificationOutput(
    JSON.stringify({ confidence: 0.5, reason: "no category here" })
  );
  check(
    "missing category becomes Other",
    got && got.category === "Other",
    JSON.stringify(got)
  );

  // ---- TEST 7: invalid confidence ----
  console.log("\n=== TEST 7: invalid confidence ===");
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: "definitely-not-a-number", reason: "r" })
  );
  check(
    "non-numeric confidence -> 0",
    got && got.confidence === 0,
    JSON.stringify(got)
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: null, reason: "r" })
  );
  check(
    "null confidence -> 0",
    got && got.confidence === 0,
    JSON.stringify(got)
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", reason: "no confidence field" })
  );
  check(
    "missing confidence -> 0",
    got && got.confidence === 0,
    JSON.stringify(got)
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: "0.8", reason: "r" })
  );
  check(
    "numeric string confidence is coerced",
    got && got.confidence === 0.8,
    JSON.stringify(got)
  );

  // ---- TEST 8: confidence normalization / clamping ----
  console.log("\n=== TEST 8: confidence clamping ===");
  check("clampConfidence(0.94) -> 0.94", clampConfidence(0.94) === 0.94);
  check("clampConfidence(1.5) -> 1", clampConfidence(1.5) === 1);
  check("clampConfidence(-0.2) -> 0", clampConfidence(-0.2) === 0);
  check("clampConfidence(1) -> 1", clampConfidence(1) === 1);
  check("clampConfidence(0) -> 0", clampConfidence(0) === 0);
  check("clampConfidence(NaN) -> 0", clampConfidence(NaN) === 0);
  check("clampConfidence('0.8') -> 0.8", clampConfidence("0.8") === 0.8);
  check("clampConfidence(undefined) -> 0", clampConfidence(undefined) === 0);
  check("clampConfidence(null) -> 0", clampConfidence(null) === 0);
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: 4.7, reason: "r" })
  );
  check(
    "parser clamps over-range confidence to 1",
    got && got.confidence === 1,
    JSON.stringify(got)
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: -1.1, reason: "r" })
  );
  check(
    "parser clamps negative confidence to 0",
    got && got.confidence === 0,
    JSON.stringify(got)
  );

  // ---- TEST 9: reason length limiting ----
  console.log("\n=== TEST 9: reason limiting ===");
  const longReason = "x ".repeat(1000);
  const bounded = limitReason(longReason);
  check(
    "reason is bounded to " + CLASSIFICATION_REASON_MAX_CHARS + " chars",
    bounded.length <= CLASSIFICATION_REASON_MAX_CHARS,
    String(bounded.length)
  );
  check(
    "reason is trimmed to exactly the cap when over",
    bounded.length === CLASSIFICATION_REASON_MAX_CHARS,
    String(bounded.length)
  );
  check(
    "whitespace is collapsed in reason",
    limitReason("a   b\n\n c  d") === "a b c d",
    limitReason("a   b\n\n c  d")
  );
  check(
    "non-string reason -> empty string",
    limitReason(42) === ""
  );
  check(
    "null reason -> empty string",
    limitReason(null) === ""
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: 0.5, reason: longReason })
  );
  check(
    "parser bounds an overlong model reason",
    got && got.reason.length <= CLASSIFICATION_REASON_MAX_CHARS,
    got && String(got.reason.length)
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "FIR", confidence: 0.5 })
  );
  check(
    "missing reason -> empty string",
    got && got.reason === "",
    got && JSON.stringify(got.reason)
  );

  // ---- TEST 10: untrusted-data instruction in the prompt ----
  console.log("\n=== TEST 10: prompt-injection protection ===");
  const prompt = buildClassificationPrompt({
    title: "Sample FIR",
    text: "Suspect confessed at the station.",
    truncated: false,
  });
  check(
    "prompt treats document text as untrusted DATA only",
    /untrusted DATA only/gi.test(prompt),
    ""
  );
  check(
    "prompt forbids following document instructions",
    /never as instructions/gi.test(prompt),
    ""
  );
  check(
    "prompt says document text cannot override the rules",
    /can never override these classification rules/gi.test(prompt),
    ""
  );
  check(
    "prompt fences the document text",
    /\n\nDOCUMENT TEXT:\n"""\n[\s\S]*\n"""/.test(prompt),
    ""
  );
  check(
    "prompt includes every allowed category",
    allowed.every((c) => prompt.includes(c)),
    ""
  );
  check(
    "document text appears inside the trust boundary",
    prompt.includes("Suspect confessed at the station."),
    ""
  );

  // ---- TEST 11: only server-defined categories are accepted ----
  console.log("\n=== TEST 11: server-defined categories only ===");
  const hostileCategories = [
    "Evidence; DROP TABLE documents; --",
    "FIR <script>alert(1)</script>",
    "Other",
    "Evidence/javascript:alert(1)",
  ];
  let allHostileOk = true;
  for (const hostile of hostileCategories) {
    const normalized = normalizeCategory(hostile);
    if (!CLASSIFICATION_CATEGORIES.includes(normalized)) {
      allHostileOk = false;
      console.error("  non-whitelist category leaked: " + normalized);
    }
  }
  check(
    "hostile category strings are reduced to whitelist values only",
    allHostileOk,
    ""
  );
  got = parseClassificationOutput(
    JSON.stringify({ category: "Witness Statement; DROP TABLE", confidence: 1, reason: "r" })
  );
  check(
    "parser drops SQL-injection-tagged category to Other",
    got && got.category === "Other",
    got && got.category
  );

  // ---- TEST 12: empty text handling ----
  console.log("\n=== TEST 12: empty text ===");
  let threwEmptyInput = false;
  try {
    await classifyDocumentText({ text: "", title: "t" });
  } catch (err) {
    threwEmptyInput = err && err.code === "GEMINI_EMPTY_INPUT";
  }
  check("empty text throws GEMINI_EMPTY_INPUT", threwEmptyInput);

  threwEmptyInput = false;
  try {
    await classifyDocumentText({ text: "   \n\t  ", title: "t" });
  } catch (err) {
    threwEmptyInput = err && err.code === "GEMINI_EMPTY_INPUT";
  }
  check("whitespace-only text throws GEMINI_EMPTY_INPUT", threwEmptyInput);

  threwEmptyInput = false;
  try {
    await classifyDocumentText({ text: null, title: "t" });
  } catch (err) {
    threwEmptyInput = err && err.code === "GEMINI_EMPTY_INPUT";
  }
  check("null text throws GEMINI_EMPTY_INPUT", threwEmptyInput);

  // ---- TEST 13: truncated flag propagation ----
  console.log("\n=== TEST 13: truncated flag ===");
  check(
    "truncated documents get a truncation note in the prompt",
    buildClassificationPrompt({ title: "t", text: "x", truncated: true }).includes(
      "was truncated because it is long"
    ),
    ""
  );
  check(
    "non-truncated documents get no truncation note",
    !buildClassificationPrompt({ title: "t", text: "x", truncated: false }).includes(
      "was truncated because it is long"
    ),
    ""
  );
  // The truncation flag is a plain boolean that must survive for the audit
  // event so the reader knows the classification was based on a capped excerpt.
  const auditTruncated = buildClassificationAuditDetails({
    versionNumber: 2,
    category: "FIR",
    confidence: 0.9,
    model: "gemini-3.6-flash",
    truncated: true,
  });
  check(
    "audit details preserve the truncation flag",
    auditTruncated.truncated === true,
    JSON.stringify(auditTruncated)
  );
  check(
    "audit details record untruncated as false",
    buildClassificationAuditDetails({
      versionNumber: 2,
      category: "FIR",
      confidence: 0.9,
      model: "m",
      truncated: false,
    }).truncated === false
  );

  // ---- TEST 14: audit details never include document text ----
  console.log("\n=== TEST 14: metadata-only audit details ===");
  const secretText = "TOP SECRET DOCUMENT CONTENTS that must never be audited";
  const auditDetails = buildClassificationAuditDetails({
    versionNumber: 2,
    category: "Evidence",
    confidence: 0.94,
    model: "gemini-3.6-flash",
    truncated: true,
    text: secretText,
    prompt: "leak me",
    raw: secretText,
  });
  const auditKeys = Object.keys(auditDetails).sort().join(",");
  check(
    "audit details contain exactly the allowlisted metadata keys",
    auditKeys === "category,confidence,model,truncated,versionNumber",
    auditKeys
  );
  check(
    "audit details never serialize the document text",
    JSON.stringify(auditDetails).includes(secretText) === false,
    JSON.stringify(auditDetails)
  );
  check(
    "audit details never contain the prompt",
    JSON.stringify(auditDetails).includes("leak me") === false
  );
  check(
    "audit details normalize the category",
    auditDetails.category === "Evidence",
    auditDetails.category
  );

  // ---- TEST 15: version-specific classification mapping ----
  console.log("\n=== TEST 15: version-specific mapping ===");
  const classificationRow = mapClassificationToVersion(
    123,
    2,
    { category: "Evidence", confidence: 0.94, reason: "r", model: "gemini-3.6-flash" }
  );
  check(
    "row is pinned to document 123 version 2",
    classificationRow.documentId === 123 && classificationRow.versionNumber === 2,
    JSON.stringify(classificationRow)
  );
  check(
    "row keeps category/confidence/model",
    classificationRow.category === "Evidence" &&
      classificationRow.confidence === 0.94 &&
      classificationRow.model === "gemini-3.6-flash",
    JSON.stringify(classificationRow)
  );
  check(
    "row never encodes a version from the classification payload",
    mapClassificationToVersion(123, 2, { category: "FIR" }).versionNumber === 2
  );
  check(
    "invalid version yields null (never persisted)",
    mapClassificationToVersion(123, 0, { category: "FIR" }).versionNumber === null,
    String(mapClassificationToVersion(123, 0, { category: "FIR" }).versionNumber)
  );
  check(
    "string versions are coerced",
    mapClassificationToVersion(123, "3", { category: "FIR" }).versionNumber === 3,
    String(mapClassificationToVersion(123, "3", { category: "FIR" }).versionNumber)
  );
  check(
    "classification is applied per version (v1 and v2 remain distinct)",
    mapClassificationToVersion(123, 1, { category: "Other" }).versionNumber !==
      mapClassificationToVersion(123, 2, { category: "Other" }).versionNumber
  );

  const ok = summary();
  process.exitCode = ok ? 0 : 1;
}

main();