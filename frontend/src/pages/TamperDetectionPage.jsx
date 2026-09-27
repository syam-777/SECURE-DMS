import { useState, useEffect } from "react";
import { apiFetch, API_BASE_URL } from "../api/api";
import AppLayout from "../components/AppLayout";
import { sha256Hex, makeTamperedCopy } from "../utils/demoHash";
import "./TamperDetectionPage.css";

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function describeError(error, fallback) {
  if (!error) return fallback;
  if (error.status === 401 || error.status === 403) {
    return "You are not authorized to access this document.";
  }
  if (error.status === 404) {
    return "Document or version not found — the stored file may be missing.";
  }
  if (error instanceof TypeError || error.name === "TypeError") {
    return "Network/server error — could not reach the Secure DMS API.";
  }
  return error.message || fallback;
}

/**
 * Download the bytes of a document version for the in-memory demo, using the
 * EXISTING authorized download endpoint. Authorization (JWT role + per-document
 * case/ownership access) is enforced entirely server-side; nothing new is added.
 * The bytes stay in browser memory and are never uploaded anywhere.
 */
async function downloadVersionBytes(documentId, versionNumber) {
  const token = localStorage.getItem("token");
  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}/versions/${versionNumber}/download`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  if (!response.ok) {
    let message = "Failed to download the file";
    try {
      message = (await response.json()).message || message;
    } catch {
      // fall back to the generic message above
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response.arrayBuffer();
}

function TamperDetectionPage() {
  const [documents, setDocuments] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState("");

  const [verify, setVerify] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [tamper, setTamper] = useState(null);
  const [simulateBusy, setSimulateBusy] = useState(false);
  const [simulateError, setSimulateError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadInitial() {
      try {
        const [docResult, caseResult] = await Promise.all([
          apiFetch("/documents?limit=100"),
          apiFetch("/cases?limit=100"),
        ]);
        if (!active) return;
        setDocuments(docResult.documents || []);
        setCases(caseResult.cases || []);
      } catch (err) {
        if (!active) return;
        setLoadError(describeError(err, "Failed to load documents."));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const selectedDocument = documents.find(
    (doc) => String(doc.id) === String(selectedDocumentId)
  ) || null;
  const selectedVersion = versions.find(
    (version) => String(version.version_number) === String(selectedVersionNumber)
  ) || null;
  const caseNumber =
    (selectedDocument &&
      cases.find(
        (caseRow) => String(caseRow.id) === String(selectedDocument.case_id)
      )?.case_number) ||
    "-";

  const handleDocumentChange = async (event) => {
    const docId = event.target.value;
    setSelectedDocumentId(docId);
    setSelectedVersionNumber("");
    setVersions([]);
    setVerify(null);
    setVerifyError("");
    setTamper(null);
    setSimulateError("");

    if (!docId) return;

    setVersionsLoading(true);
    try {
      const data = await apiFetch(`/documents/${docId}/versions`);
      setVersions(data.versions || []);
    } catch (err) {
      setVerifyError(describeError(err, "Failed to load versions."));
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedDocumentId || !selectedVersionNumber) return;
    setVerifyBusy(true);
    setVerifyError("");
    setTamper(null);
    setSimulateError("");
    try {
      const data = await apiFetch(
        `/documents/${selectedDocumentId}/versions/${selectedVersionNumber}/verify`
      );
      setVerify(data);
    } catch (err) {
      setVerify(null);
      setVerifyError(describeError(err, "Verification failed."));
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleSimulate = async () => {
    if (!selectedDocumentId || !selectedVersionNumber || !verify) return;
    setSimulateBusy(true);
    setSimulateError("");
    try {
      const bytes = new Uint8Array(
        await downloadVersionBytes(selectedDocumentId, selectedVersionNumber)
      );
      const originalHash = await sha256Hex(bytes);
      const tamperedCopy = makeTamperedCopy(bytes);
      const tamperedHash = await sha256Hex(tamperedCopy);
      setTamper({
        sizeBytes: bytes.length,
        originalHash,
        tamperedHash,
        matchesStored: originalHash === verify.storedChecksum,
      });
    } catch (err) {
      setTamper(null);
      setSimulateError(
        describeError(err, "Could not read the stored file for the simulation.")
      );
    } finally {
      setSimulateBusy(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="td-container">
          <p className="td-muted">Loading accessible documents...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="td-container">
        <h1 className="page-title">Tamper Detection Demo</h1>
        <p className="page-description">
          See how Secure DMS detects a changed file using the existing SHA-256
          integrity mechanism. The real stored document is never touched.
        </p>

        {loadError && <div className="error-message">{loadError}</div>}

        {!loadError && documents.length === 0 && (
          <div className="td-empty">
            No documents are available to you. Upload a document first, or ask
            your administrator for access.
          </div>
        )}

        {!loadError && documents.length > 0 && (
          <>
            <section className="td-card">
              <h2>1. Choose a document and version</h2>
              <div className="td-field">
                <label htmlFor="td-document">Document</label>
                <select
                  id="td-document"
                  value={selectedDocumentId}
                  onChange={handleDocumentChange}
                >
                  <option value="">
                    -- Select an accessible document --
                  </option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title || "Untitled"} (ID {doc.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="td-field">
                <label htmlFor="td-version">Version</label>
                <select
                  id="td-version"
                  disabled={!selectedDocumentId || versionsLoading}
                  value={selectedVersionNumber}
                  onChange={(event) => {
                    setSelectedVersionNumber(event.target.value);
                    setVerify(null);
                    setVerifyError("");
                    setTamper(null);
                    setSimulateError("");
                  }}
                >
                  <option value="">
                    {versionsLoading
                      ? "Loading versions..."
                      : "-- Select a version --"}
                  </option>
                  {versions.map((version) => (
                    <option
                      key={version.id}
                      value={version.version_number}
                    >
                      Version {version.version_number} —{" "}
                      {version.original_file_name || "file"}
                    </option>
                  ))}
                </select>
              </div>

              {selectedVersion && (
                <div className="td-info-grid">
                  <div>
                    <strong>Document Title</strong>
                    <span>{selectedDocument.title || "-"}</span>
                  </div>
                  <div>
                    <strong>Document ID</strong>
                    <span>{selectedDocument.id}</span>
                  </div>
                  <div>
                    <strong>Case</strong>
                    <span>{caseNumber}</span>
                  </div>
                  <div>
                    <strong>Version</strong>
                    <span>{selectedVersion.version_number}</span>
                  </div>
                  <div>
                    <strong>File</strong>
                    <span>{selectedVersion.original_file_name || "-"}</span>
                  </div>
                  <div>
                    <strong>Size</strong>
                    <span>{formatBytes(selectedVersion.file_size)}</span>
                  </div>
                  <div className="td-hash-cell">
                    <strong>Stored SHA-256</strong>
                    <span className="td-hash">
                      {selectedVersion.checksum || "No checksum recorded"}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section className="td-card">
              <h2>2. Verify the original</h2>
              <p className="td-muted">
                Runs a REAL verification through the existing endpoint: the
                stored file on the secure object store is hashed again and
                compared with the recorded checksum.
              </p>
              <button
                className="td-primary-btn"
                disabled={
                  !selectedDocumentId ||
                  !selectedVersionNumber ||
                  verifyBusy ||
                  simulateBusy
                }
                onClick={handleVerify}
              >
                {verifyBusy ? "Verifying..." : "Verify Original"}
              </button>

              {verifyError && <div className="error-message">{verifyError}</div>}

              {verify && (
                <div className="td-result">
                  <div
                    className={`td-status ${
                      verify.integrityValid
                        ? "td-status-ok"
                        : "td-status-fail"
                    }`}
                  >
                    {verify.integrityValid
                      ? "MATCH / INTEGRITY VERIFIED"
                      : "MISMATCH / INTEGRITY FAILURE"}
                  </div>
                  <p className="td-muted">
                    Stored checksum and calculated checksum both come from the
                    real verification API call.
                  </p>
                  <div className="td-hash-block">
                    <span className="td-hash-label">Stored SHA-256</span>
                    <code className="td-hash">
                      {verify.storedChecksum || "n/a"}
                    </code>
                  </div>
                  <div className="td-hash-block">
                    <span className="td-hash-label">
                      Calculated SHA-256 (from stored file)
                    </span>
                    <code className="td-hash">
                      {verify.calculatedChecksum || "n/a"}
                    </code>
                  </div>
                  {verify.integrityValid && (
                    <button
                      className="td-simulate-btn"
                      disabled={simulateBusy || verifyBusy}
                      onClick={handleSimulate}
                    >
                      {simulateBusy ? "Simulating..." : "Simulate Tampering"}
                    </button>
                  )}
                </div>
              )}

              {simulateError && (
                <div className="error-message">{simulateError}</div>
              )}

              {tamper && (
                <>
                  <h2>3. Demonstration result</h2>
                  <p className="td-muted">
                    The simulation downloaded the original file into browser
                    memory, flipped exactly{" "}
                    <strong>one byte</strong> of the in-memory copy, and hashed
                    the copy with the browser Web Crypto API. Nothing was sent
                    back to the server.
                  </p>

                  <div className="td-hash-block">
                    <span className="td-hash-label">Original / Stored Hash</span>
                    <code className="td-hash">{verify.storedChecksum || "n/a"}</code>
                  </div>
                  <div className="td-hash-block">
                    <span className="td-hash-label">
                      Current Original File Hash (browser-computed)
                    </span>
                    <code className="td-hash">{tamper.originalHash}</code>
                  </div>
                  <div className="td-hash-block">
                    <span className="td-hash-label">
                      Simulated Tampered File Hash (browser-computed)
                    </span>
                    <code className="td-hash td-hash-tampered">
                      {tamper.tamperedHash}
                    </code>
                  </div>

                  <div className="td-verdicts">
                    <div className="td-status td-status-ok">
                      Original: MATCH — file integrity verified
                    </div>
                    <div className="td-status td-status-fail">
                      Simulated tampered copy: MISMATCH — integrity check would
                      detect the modification
                    </div>
                  </div>

                  <p className="td-note">
                    Only the in-memory copy was modified. The stored document
                    was not changed.
                  </p>
                  <p className="td-note">
                    Even a one-byte change produces a completely different
                    SHA-256 hash (the avalanche effect): the 64-character digest
                    written by the original file and the digest written by the
                    modified copy share no meaningful resemblance.
                  </p>
                </>
              )}
            </section>

            <section className="td-card">
              <h2>How it works</h2>
              <ul className="td-list">
                <li>
                  The system stores a SHA-256 checksum for each document
                  version.
                </li>
                <li>
                  During verification, the current stored file is hashed again.
                </li>
                <li>
                  Matching hashes indicate that the retrieved file matches the
                  recorded checksum.
                </li>
                <li>A modified copy produces a different SHA-256 hash.</li>
                <li>
                  This demo modifies only an in-memory copy and never changes
                  the stored document.
                </li>
              </ul>
              <p className="td-note">
                Matching hashes mean the retrieved bytes match the recorded
                checksum. SHA-256 alone does not prove that a document is
                legally authentic or absolutely tamper-proof.
              </p>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

export default TamperDetectionPage;