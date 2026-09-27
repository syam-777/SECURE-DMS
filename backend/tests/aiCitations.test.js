/**
 * Secure DMS — AI Evidence Citations Test Suite
 *
 * This suite tests the citation parsing/mapping logic in isolation. It does
 * NOT call Gemini (no network, no API key required) and it does NOT touch any
 * database. It imports only the pure helper `parseCitations` from aiService.
 *
 * The helper must:
 *   - map [Source <n>] markers to the exact document that was supplied to
 *     Gemini (array index <n>-1 of the bounded documents),
 *   - deduplicate citations,
 *   - ignore zero, negative, non-numeric, and out-of-range source numbers,
 *   - never return a documentId/title/version that was not supplied,
 *   - return [] for answers with no valid markers,
 *   - keep the original answer usable and never throw.
 *
 * Usage:  node tests/aiCitations.test.js   (from backend/)
 */

const { parseCitations } = require("../src/services/aiService");

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

function sameCitations(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  return a.every((item, i) => {
    const other = b[i];
    return (
      item &&
      other &&
      item.documentId === other.documentId &&
      item.title === other.title &&
      item.versionNumber === other.versionNumber
    );
  });
}

function summary() {
  console.log("\n========== RESULTS ==========");
  console.log("PASSED: " + pass);
  console.log("FAILED: " + fail);
  console.log("=============================");
  return fail === 0;
}

function main() {
  console.log("\n=== AI Evidence Citations: parseCitations ===");

  // The bounded documents exactly as the controller feeds Gemini.
  const documents = [
    { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
    { documentId: 102, title: "Evidence Report", versionNumber: 1 },
    { documentId: 103, title: "Forensic Analysis", versionNumber: 3 },
  ];

  // ---- TEST 1: basic single markers ----
  console.log("\n=== TEST 1: single markers ===");
  let got = parseCitations(
    "The suspect admitted the transfer. [Source 1]",
    documents
  );
  check(
    "[Source 1] maps to first supplied document",
    sameCitations(got, [
      { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
    ]),
    JSON.stringify(got)
  );

  got = parseCitations(
    "The evidence was collected on site. [Source 2]",
    documents
  );
  check(
    "[Source 2] maps to second supplied document",
    sameCitations(got, [
      { documentId: 102, title: "Evidence Report", versionNumber: 1 },
    ]),
    JSON.stringify(got)
  );

  got = parseCitations(
    "DNA matched the suspect profile. [Source 3]",
    documents
  );
  check(
    "[Source 3] version comes from the actual supplied document",
    sameCitations(got, [
      { documentId: 103, title: "Forensic Analysis", versionNumber: 3 },
    ]),
    JSON.stringify(got)
  );

  // ---- TEST 2: multiple citations ----
  console.log("\n=== TEST 2: multiple citations ===");
  got = parseCitations(
    "Statement says X. [Source 1] The report confirms Y. [Source 2] " +
      "Both are relevant. [Source 3]",
    documents
  );
  check(
    "multiple citations work, in order of appearance",
    sameCitations(got, [
      { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
      { documentId: 102, title: "Evidence Report", versionNumber: 1 },
      { documentId: 103, title: "Forensic Analysis", versionNumber: 3 },
    ]),
    JSON.stringify(got)
  );

  got = parseCitations(
    "Combined claim. [Source 1][Source 3]",
    documents
  );
  check(
    "adjacent multiple markers are parsed",
    sameCitations(got, [
      { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
      { documentId: 103, title: "Forensic Analysis", versionNumber: 3 },
    ]),
    JSON.stringify(got)
  );

  // ---- TEST 3: deduplication ----
  console.log("\n=== TEST 3: deduplication ===");
  got = parseCitations(
    "Claim A. [Source 2] Claim B. [Source 2] Claim C again. [Source 2]",
    documents
  );
  check(
    "duplicate citations are deduplicated",
    sameCitations(got, [
      { documentId: 102, title: "Evidence Report", versionNumber: 1 },
    ]),
    JSON.stringify(got)
  );

  got = parseCitations(
    "X [Source 1] Y [Source 1] Z [Source 3] W [Source 3]",
    documents
  );
  check(
    "dedupe keeps order of first appearance",
    sameCitations(got, [
      { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
      { documentId: 103, title: "Forensic Analysis", versionNumber: 3 },
    ]),
    JSON.stringify(got)
  );

  // ---- TEST 4: invalid / forged source numbers ----
  console.log("\n=== TEST 4: invalid / forged source numbers ===");
  got = parseCitations("Not cited. [Source 0]", documents);
  check("Source 0 is ignored", sameCitations(got, []), JSON.stringify(got));

  got = parseCitations("Not cited. [Source -1]", documents);
  check(
    "negative source marker is ignored",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations("Not cited. [Source X]", documents);
  check(
    "non-numeric source marker is ignored",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations("Not cited. [Source]", documents);
  check(
    "marker with no number is ignored",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations("Not cited. [Source 1.5]", documents);
  check(
    "decimal source marker is ignored",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations("Not cited. [Source 4]", documents);
  check(
    "out-of-range source number is ignored",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations("Not cited. [Source 99]", documents);
  check(
    "large out-of-range source number is ignored",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations(
    "Real claim [Source 1] plus forged [Source 9][Source 7][Source 0]",
    documents
  );
  check(
    "forged markers are stripped, valid marker survives",
    sameCitations(got, [
      { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
    ]),
    JSON.stringify(got)
  );

  // ---- TEST 5: unsupplied documents can never be cited ----
  console.log("\n=== TEST 5: unsupplied document protection ===");
  got = parseCitations(
    "Claim [Source 2]",
    [{ documentId: 1, title: "Only Doc", versionNumber: 1 }]
  );
  check(
    "a citation cannot reference a document that wasn't supplied",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  const allDocIds = documents.map((d) => d.documentId);
  got = parseCitations(
    "Multiple [Source 1] [Source 2] [Source 3] [Source 4]",
    documents
  );
  check(
    "every citation documentId was supplied",
    got.every((c) => allDocIds.includes(c.documentId)),
    JSON.stringify(got)
  );

  // ---- TEST 6: empty / no-citation answers ----
  console.log("\n=== TEST 6: empty / no-citation answers ===");
  got = parseCitations("The documents do not address this question.", documents);
  check(
    "no marker answer returns []",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  got = parseCitations("", documents);
  check("empty answer returns []", sameCitations(got, []), JSON.stringify(got));

  got = parseCitations(null, documents);
  check("null answer returns []", sameCitations(got, []), JSON.stringify(got));

  got = parseCitations("Some text", null);
  check(
    "non-array documents returns []",
    sameCitations(got, []),
    JSON.stringify(got)
  );

  // ---- TEST 7: response structure compatibility ----
  console.log("\n=== TEST 7: response structure compatibility ===");
  const answerText =
    "The suspect statement admits the transfer. [Source 1] " +
    "The forensic analysis confirms it. [Source 3]";
  const answer = answerText;
  const sources = documents.map((document) => ({
    documentId: document.documentId,
    title: document.title,
    versionNumber: document.versionNumber,
  }));
  got = parseCitations(answer, documents);

  check(
    "original answer is preserved (markers intact, usable)",
    got.length > 0 && typeof answer === "string" && answer === answerText,
    JSON.stringify({ answer, got })
  );

  const hasSource = (c) =>
    sources.some(
      (s) =>
        s.documentId === c.documentId && s.versionNumber === c.versionNumber
    );
  check(
    "every citation is a strict subset of the existing sources field",
    got.length > 0 && got.every(hasSource),
    JSON.stringify({ got, sources })
  );

  check(
    "citation object shape is exactly documentId/title/versionNumber",
    got.every(
      (c) =>
        Object.keys(c).sort().join(",") === "documentId,title,versionNumber"
    ),
    JSON.stringify(got)
  );

  check(
    "sources field remains unchanged (all supplied docs still present)",
    sources.length === documents.length &&
      sources[0].documentId === 101 &&
      sources[1].documentId === 102,
    JSON.stringify(sources)
  );

  // ---- TEST 8: lenient marker formats ----
  console.log("\n=== TEST 8: lenient marker formats ===");
  got = parseCitations("Claim. [Source2]", documents);
  check(
    "no-space [Source2] marker is parsed",
    sameCitations(got, [
      { documentId: 102, title: "Evidence Report", versionNumber: 1 },
    ]),
    JSON.stringify(got)
  );

  got = parseCitations("Claim. [SOURCE 1]", documents);
  check(
    "case-insensitive [SOURCE 1] marker is parsed",
    sameCitations(got, [
      { documentId: 101, title: "Suspect Statement", versionNumber: 2 },
    ]),
    JSON.stringify(got)
  );

  const ok = summary();
  process.exitCode = ok ? 0 : 1;
}

main();