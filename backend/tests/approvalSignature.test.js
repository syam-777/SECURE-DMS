/**
 * Secure DMS — Digital Approval Signature Test Suite
 *
 * Pure/local tests. No Gemini, no B2, no external services, no database.
 * A fresh ECDSA P-256 key pair is generated INSIDE this test process and
 * injected via the approvalKeys environment contract; no private key is
 * ever written to the repository.
 *
 * Usage:  node tests/approvalSignature.test.js   (from backend/)
 */

const crypto = require("crypto");
const {
  canonicalizeApprovalPayload,
  signApprovalPayload,
  verifyApprovalSignature,
  getApprovalSigningMetadata,
  ALGORITHM,
  SCHEMA_VERSION,
  ACTION,
  DECISION,
} = require("../src/services/approvalSignatureService");

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
  if (fail > 0) {
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------
// Test-only key material (never persisted).
// ------------------------------------------------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const privateB64 = Buffer.from(privatePem, "utf8").toString("base64");
const publicB64 = Buffer.from(publicPem, "utf8").toString("base64");

// A second, unrelated key pair used to prove a wrong key can't verify.
const wrong = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

const SAVED_ENV = {
  key: process.env.APPROVAL_SIGNING_KEY_ID,
  priv: process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64,
  pub: process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64,
};

process.env.APPROVAL_SIGNING_KEY_ID = "test-key-001";
process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = privateB64;
process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64 = publicB64;

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);

const SAMPLE = {
  reviewId: 42,
  caseId: 7,
  caseNumber: "CASE-2026-007",
  reviewerId: 3,
  reviewerUsername: "reviewer_one",
  reviewNote: "Approved after verification",
  approvedAt: "2026-09-22T10:00:00.000Z",
  artifacts: [
    { documentId: 10, documentTitle: "FIR Report.pdf", versionNumber: 1, checksum: CHECKSUM_A },
    { documentId: 11, documentTitle: "Scene Photos.zip", versionNumber: 2, checksum: CHECKSUM_B },
  ],
};

function makePayload(overrides) {
  return { ...SAMPLE, ...overrides };
}

async function main() {
  // --- 1/2. Deterministic canonicalization -------------------------
  const canonA = canonicalizeApprovalPayload(makePayload({}));
  const canonB = canonicalizeApprovalPayload(makePayload({}));
  check(
    "canonicalization is deterministic (same input -> same payload)",
    canonA === canonB,
    "payloads differ"
  );
  check(
    "same input produces exactly the same payload",
    canonA === JSON.stringify(JSON.parse(canonA)),
    "payload not stable"
  );

  // --- 3/22. Artifact ordering --------------------------------------
  const reversed = [SAMPLE.artifacts[1], SAMPLE.artifacts[0]];
  const canonSorted = canonicalizeApprovalPayload(makePayload({ artifacts: SAMPLE.artifacts }));
  const canonReversed = canonicalizeApprovalPayload(makePayload({ artifacts: reversed }));
  check(
    "artifact ordering is deterministic",
    canonSorted === canonReversed,
    "reordering changed payload"
  );
  const parsed = JSON.parse(canonSorted);
  check(
    "artifacts are sorted by documentId",
    parsed.artifacts[0].documentId === 10 && parsed.artifacts[1].documentId === 11,
    "not sorted"
  );

  // --- 4/5. Signature generation + verification ---------------------
  const signature = signApprovalPayload(canonA);
  check(
    "P-256 signature generation returns a non-empty base64 signature",
    typeof signature === "string" && signature.length > 0 &&
      /^[A-Za-z0-9+/]+=*$/.test(signature),
    "signature=" + (signature || "").slice(0, 12)
  );
  check(
    "valid signature verifies successfully",
    verifyApprovalSignature(canonA, signature) === true,
    "verification failed"
  );

  // --- 6. Modified payload fails ------------------------------------
  const tamperedPayload = canonicalizeApprovalPayload(makePayload({ caseId: 999 }));
  check(
    "modified payload fails verification",
    tamperedPayload !== canonA && verifyApprovalSignature(tamperedPayload, signature) === false,
    "tampered payload verified"
  );

  // --- 7. Modified signature fails ----------------------------------
  const flip = signature[0] === "A" ? "B" : "A";
  const badSignature = flip + signature.slice(1);
  check(
    "modified signature fails verification",
    verifyApprovalSignature(canonA, badSignature) === false,
    "bad signature verified"
  );
  check(
    "empty signature fails verification",
    verifyApprovalSignature(canonA, "") === false,
    "empty signature verified"
  );

  // --- 8. Wrong key fails -------------------------------------------
  check(
    "wrong public key fails verification",
    verifyApprovalSignature(canonA, signature, wrong.publicKey) === false,
    "wrong key verified"
  );

  // --- 9/10. Metadata -----------------------------------------------
  const metadata = getApprovalSigningMetadata();
  check(
    "key id is preserved",
    metadata.keyId === "test-key-001",
    "keyId=" + metadata.keyId
  );
  check(
    "algorithm is ECDSA-P256-SHA256",
    metadata.algorithm === "ECDSA-P256-SHA256",
    "algorithm=" + metadata.algorithm
  );
  check(
    "exported ALGORITHM constant is ECDSA-P256-SHA256",
    ALGORITHM === "ECDSA-P256-SHA256",
    "ALGORITHM=" + ALGORITHM
  );

  // --- 11-15. Payload fields -----------------------------------------
  check(
    "payload contains schemaVersion",
    parsed.schemaVersion === SCHEMA_VERSION && parsed.schemaVersion === 1,
    "schemaVersion=" + parsed.schemaVersion
  );
  check(
    "payload contains reviewId",
    parsed.reviewId === 42,
    "reviewId=" + parsed.reviewId
  );
  check(
    "payload contains caseId",
    parsed.caseId === 7,
    "caseId=" + parsed.caseId
  );
  check(
    "payload contains reviewer identity",
    parsed.reviewerId === 3 && parsed.reviewerUsername === "reviewer_one",
    JSON.stringify(parsed.reviewerId)
  );
  check(
    "payload contains approval decision",
    parsed.decision === "approved" && parsed.decision === DECISION,
    "decision=" + parsed.decision
  );
  check(
    "payload action is CASE_REVIEW_APPROVED",
    parsed.action === "CASE_REVIEW_APPROVED" && parsed.action === ACTION,
    "action=" + parsed.action
  );

  // --- 16. Document version/checksum snapshot -------------------------
  check(
    "payload contains document version/checksum snapshot",
    parsed.artifacts.length === 2 &&
      parsed.artifacts[0].checksum === CHECKSUM_A &&
      parsed.artifacts[1].versionNumber === 2 &&
      parsed.artifacts[1].checksum === CHECKSUM_B,
    "artifacts=" + JSON.stringify(parsed.artifacts)
  );

  // --- 17. Empty artifacts -------------------------------------------
  const emptyCanon = canonicalizeApprovalPayload(makePayload({ artifacts: [] }));
  const emptyParsed = JSON.parse(emptyCanon);
  check(
    "empty artifacts array is supported",
    Array.isArray(emptyParsed.artifacts) && emptyParsed.artifacts.length === 0,
    "artifacts=" + JSON.stringify(emptyParsed.artifacts)
  );

  // --- 18-20. No contents / paths / secrets in payload ----------------
  const dirty = makePayload({
    contents: "CONFIDENTIAL DOCUMENT BODY TEXT",
    filePath: "C:/secure-dms/secret/FIR REPORT FINAL.pdf",
    storedFileName: "b2-object-key-12345",
    password: "hunter2x",
    apiKey: "sk-test-secret",
  });
  const cleanCanon = canonicalizeApprovalPayload(dirty);
  const cleanParsed = JSON.parse(cleanCanon);
  check(
    "payload does not contain document contents",
    !cleanCanon.includes("CONFIDENTIAL DOCUMENT BODY TEXT") &&
      !Object.prototype.hasOwnProperty.call(cleanParsed, "contents"),
    "contents leaked"
  );
  check(
    "payload does not contain file paths or stored file names",
    !cleanCanon.includes("filePath") &&
      !cleanCanon.includes("storedFileName") &&
      !cleanCanon.includes("C:/secure-dms") &&
      !cleanCanon.includes("b2-object-key-12345"),
    "file path leaked"
  );
  check(
    "payload does not contain secrets",
    !cleanCanon.includes("password") &&
      !cleanCanon.includes("apiKey") &&
      !cleanCanon.includes("hunter2x") &&
      !cleanCanon.includes("sk-test-secret"),
    "secret leaked"
  );
  check(
    "payload does not contain any signing key material",
    !cleanCanon.includes(privateB64) && !cleanCanon.includes(publicB64),
    "key material leaked"
  );
  const expectedKeySet = [
    "schemaVersion",
    "action",
    "reviewId",
    "caseId",
    "caseNumber",
    "reviewerId",
    "reviewerUsername",
    "decision",
    "reviewNote",
    "approvedAt",
    "artifacts",
  ];
  check(
    "payload has exactly the allowed fixed key set",
    deepEqual(Object.keys(cleanParsed).sort(), expectedKeySet.slice().sort()),
    "keys=" + JSON.stringify(Object.keys(cleanParsed))
  );

  // --- 21. Different review ids ---------------------------------------
  const canonR1 = canonicalizeApprovalPayload(makePayload({ reviewId: 1 }));
  const canonR2 = canonicalizeApprovalPayload(makePayload({ reviewId: 2 }));
  check(
    "different review IDs produce different signed payloads",
    canonR1 !== canonR2 &&
      signApprovalPayload(canonR1) !== signApprovalPayload(canonR2),
    "payloads/signatures identical"
  );

  // --- 23. Tampered checksum fails ------------------------------------
  const tamperedChecksum = canonicalizeApprovalPayload(
    makePayload({
      artifacts: [
        { ...SAMPLE.artifacts[0], checksum: "c".repeat(64) },
        SAMPLE.artifacts[1],
      ],
    })
  );
  check(
    "tampering with a checksum causes verification failure",
    tamperedChecksum !== canonA &&
      verifyApprovalSignature(tamperedChecksum, signature) === false,
    "tampered checksum verified"
  );

  // --- Config fail-closed behavior ------------------------------------
  process.env.APPROVAL_SIGNING_KEY_ID = "replace-with-signing-key-id";
  let threw = false;
  let errName = "";
  try {
    getApprovalSigningMetadata();
  } catch (err) {
    threw = true;
    errName = err.name;
  }
  process.env.APPROVAL_SIGNING_KEY_ID = "test-key-001";
  check(
    "missing/placeholder key id throws a configuration error",
    threw && errName === "ApprovalKeyConfigurationError",
    "errName=" + errName
  );

  process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = "replace-with-private-key-base64";
  let threwPriv = false;
  let errPrivName = "";
  try {
    signApprovalPayload(canonA);
  } catch (err) {
    threwPriv = true;
    errPrivName = err.name;
  }
  process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = privateB64;
  check(
    "missing/placeholder private key throws a configuration error",
    threwPriv && errPrivName === "ApprovalKeyConfigurationError",
    "errName=" + errPrivName
  );

  // Restore the original environment.
  process.env.APPROVAL_SIGNING_KEY_ID = SAVED_ENV.key;
  process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = SAVED_ENV.priv;
  process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64 = SAVED_ENV.pub;

  summary();
}

main();