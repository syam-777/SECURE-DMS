import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import "./DocumentDetailsPage.css";
import { apiFetch, API_BASE_URL } from "../api/api";
import AppLayout from "../components/AppLayout";

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "-";
}
function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";
}
function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}
function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}%`;
}
function statusText(value) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "-";
}

const integrityBadge = {
  verified: { label: "✓ Integrity verified", className: "coc-integrity-verified" },
  integrity_failure: { label: "✕ Integrity failure", className: "coc-integrity-failed" },
  verification_error: { label: "! Verification error", className: "coc-integrity-error" },
  not_verified: { label: "Not verified", className: "coc-integrity-pending" },
};

const CASE_REVIEW_AUDIT_ACTIONS = new Set([
  "CASE_REVIEW_APPROVED",
  "CASE_REVIEW_REJECTED",
  "CASE_REVIEW_RETURNED",
]);

const auditActionLabels = {
  DOCUMENT_CREATED: "Document created / uploaded",
  DOCUMENT_UPLOADED: "Document uploaded",
  VERSION_CREATED: "New version created",
  DOCUMENT_DOWNLOADED: "Document downloaded",
  VERSION_DOWNLOADED: "Version downloaded",
  DOCUMENT_SUMMARIZED: "Document summarized",
  DOCUMENT_DELETED: "Document deleted",
  DOCUMENT_SUBMITTED_FOR_REVIEW: "Submitted for review",
  DOCUMENT_REVIEW_APPROVED: "Review approved",
  DOCUMENT_REVIEW_REJECTED: "Review rejected",
  DOCUMENT_REVIEW_RETURNED: "Review returned",
  VERSION_INTEGRITY_VERIFIED: "Integrity verification",
  DOCUMENT_CHAIN_VIEWED: "Chain of custody viewed",
  CASE_CREATED: "Case created",
  CASE_UPDATED: "Case updated",
  CASE_STATUS_CHANGED: "Status changed",
  CASE_SUBMITTED_FOR_REVIEW: "Submitted for review",
  CASE_REVIEW_APPROVED: "Review approved",
  CASE_REVIEW_REJECTED: "Review rejected",
  CASE_REVIEW_RETURNED: "Review returned",
  CASE_ASSIGNED: "Officer assigned",
  CASE_REASSIGNED: "Case reassigned",
  CASE_UNASSIGNED: "Officer unassigned",
  CASE_DELETED: "Case deleted",
};

function auditActionText(action) {
  return auditActionLabels[action] || (action ? action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "-");
}

function ScopeTag({ scope }) {
  const isCase = scope === "case";
  return (
    <span className={`coc-scopeTag ${isCase ? "coc-scopeTag-case" : "coc-scopeTag-document"}`}>
      {isCase ? "CASE" : "DOCUMENT"}
    </span>
  );
}

function integrityState(version, result) {
  if (result && result.status) return result.status;
  return (version && version.integrity && version.integrity.status) || "not_verified";
}

function formatChecksum(value) {
  if (!value) return "No checksum available";
  if (value.length <= 24) return value;
  return `${value.slice(0, 16)}…${value.slice(-8)}`;
}

async function fileRequest(path, options = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    let message = "Request failed";
    try { message = (await response.json()).message || message; } catch {}
    throw new Error(message);
  }
  return response;
}

function DocumentDetailsPage() {
  const { documentId } = useParams();

  const [doc, setDoc] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [versions, setVersions] = useState([]);
  const [cases, setCases] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [tab, setTab] = useState("versions");
  const [loading, setLoading] = useState(true);
  const [versionLoading, setVersionLoading] = useState(true);
  const [error, setError] = useState("");
  const [verify, setVerify] = useState(null);
 const [previewUrl, setPreviewUrl] = useState("");
const [previewText, setPreviewText] = useState("");
const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const [coc, setCoc] = useState(null);
  const [cocLoading, setCocLoading] = useState(false);
  const [cocError, setCocError] = useState("");
  const [verifyResults, setVerifyResults] = useState({});
  const [verifyingVersion, setVerifyingVersion] = useState(null);
  const [classification, setClassification] = useState(null);
  const [classificationLoading, setClassificationLoading] = useState(false);
  const [classificationError, setClassificationError] = useState("");
  const [entities, setEntities] = useState(null);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError] = useState("");

  const loadDocument = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [d, c] = await Promise.all([
        apiFetch(`/documents/${documentId}`),
        apiFetch("/cases?limit=100")
      ]);
      setDoc(d.document);
      setCurrentVersion(d.currentVersion || null);
      setCases(c.cases || []);
    } catch (e) {
      setError(e.message || "Failed to load document");
    } finally { setLoading(false); }
  }, [documentId]);

  const loadVersions = useCallback(async () => {
    setVersionLoading(true);
    try {
      const data = await apiFetch(`/documents/${documentId}/versions`);
      const list = data.versions || [];
      setVersions(list);
      setSelectedVersion(v => v ?? list[0]?.version_number ?? null);
    } catch (e) {
      setError(e.message || "Failed to load versions");
    } finally { setVersionLoading(false); }
  }, [documentId]);

  const loadChainOfCustody = useCallback(async () => {
    setCocLoading(true);
    setCocError("");
    try {
      const data = await apiFetch(`/documents/${documentId}/chain-of-custody`);
      setCoc(data.chain);
    } catch (e) {
      setCocError(e.message || "Failed to load chain of custody");
    } finally {
      setCocLoading(false);
    }
  }, [documentId]);

  const verifyChainVersion = async (versionNumber) => {
    setVerifyingVersion(versionNumber);
    setVerifyResults(prev => ({ ...prev, [versionNumber]: { loading: true } }));
    try {
      const data = await apiFetch(`/documents/${documentId}/versions/${versionNumber}/verify`);
      const status = data.integrityValid ? "verified" : "integrity_failure";
      setVerifyResults(prev => ({
        ...prev,
        [versionNumber]: { loading: false, status, storedChecksum: data.storedChecksum, calculatedChecksum: data.calculatedChecksum }
      }));
      await loadChainOfCustody();
    } catch (e) {
      setVerifyResults(prev => ({
        ...prev,
        [versionNumber]: { loading: false, status: "verification_error", message: e.message || "Verification failed" }
      }));
    } finally {
      setVerifyingVersion(null);
    }
  };

  useEffect(() => { loadDocument(); loadVersions(); }, [loadDocument, loadVersions]);
  useEffect(() => {
    if (tab === "chain" && !coc && !cocLoading) {
      loadChainOfCustody();
    }
  }, [tab, coc, cocLoading, loadChainOfCustody]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const caseNumber = cases.find(c => String(c.id) === String(doc?.case_id))?.case_number || doc?.case_number || "-";
  const uploader = doc?.uploader_name || doc?.uploader_username || doc?.uploaded_by || "-";
  const versionNumber = doc?.current_version ?? currentVersion?.version_number ?? "-";
  const selected = versions.find(v => Number(v.version_number) === Number(selectedVersion)) || currentVersion;

  const storedClassification = selected?.classification
    ? {
        category: selected.classification.category,
        confidence: selected.classification.confidence,
        reason: selected.classification.reason,
        model: selected.classification.model,
        versionNumber: selected.classification.version_number,
      }
    : null;
  const liveClassification =
    classification && Number(classification.versionNumber) === Number(selected?.version_number)
      ? classification
      : null;
  const shownClassification = liveClassification || storedClassification;

  const storedEntities = selected?.entities?.entities &&
      typeof selected.entities.entities === "object"
    ? {
        entities: selected.entities.entities,
        model: selected.entities.model,
        versionNumber: selected.entities.version_number,
      }
    : null;
  const liveEntities =
    entities && Number(entities.versionNumber) === Number(selected?.version_number)
      ? entities
      : null;
  const shownEntities = liveEntities || storedEntities;
  const entityGroups = Object.keys(shownEntities?.entities || {})
    .filter((group) => (shownEntities.entities[group] || []).length > 0);
  const entitiesGroupLabels = {
    people: "People",
    organizations: "Organizations",
    locations: "Locations",
    dates: "Dates",
    caseReferenceNumbers: "Case / Reference Numbers",
  };

  const download = async (version = null) => {
    try {
      setBusy(true);
      const path = version
        ? `/documents/${documentId}/versions/${version}/download`
        : `/documents/${documentId}/download`;
      const response = await fileRequest(path);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = version
        ? versions.find(v => Number(v.version_number) === Number(version))?.original_file_name || `document-v${version}`
        : currentVersion?.original_file_name || doc?.title || "document";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { alert(e.message || "Download failed"); }
    finally { setBusy(false); }
  };

 const preview = async () => {
  try {
    setBusy(true);

    const response = await fileRequest(`/documents/${documentId}/download`);
    const blob = await response.blob();

    const fileName =
      currentVersion?.original_file_name ||
      doc?.title ||
      "";

    if (fileName.toLowerCase().endsWith(".txt")) {
      const text = await blob.text();
      setPreviewText(text);
      setPreviewUrl("");
    } else {
      const url = URL.createObjectURL(blob);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewUrl(url);
      setPreviewText("");
    }

    setShowPreview(true);
  } catch (e) {
    alert(e.message || "Preview failed");
  } finally {
    setBusy(false);
  }
};
  const verifyVersion = async (version = versionNumber) => {
    try {
      setVerify({ loading: true });
      const data = await apiFetch(`/documents/${documentId}/versions/${version}/verify`);
      setVerify(data);
      await loadDocument(); await loadVersions();
    } catch (e) { setVerify({ success: false, message: e.message || "Verification failed" }); }
  };

  const uploadVersion = async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      setBusy(true);
      const form = new FormData(); form.append("file", file);
      const response = await fileRequest(`/documents/${documentId}/versions`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Upload failed");
      showToast("New document version uploaded successfully.");
      await loadDocument(); await loadVersions();
    } catch (err) { alert(err.message || "Upload failed"); }
    finally { setBusy(false); }
  };

  const runClassification = async () => {
    const targetVersion = selected?.version_number ?? currentVersion?.version_number;
    if (!targetVersion) return;
    setClassificationLoading(true);
    setClassificationError("");
    try {
      const data = await apiFetch(`/documents/${documentId}/classify`, {
        method: "POST",
        body: JSON.stringify({ versionNumber: targetVersion }),
      });
      setClassification(data);
      await loadVersions();
    } catch (e) {
      setClassificationError(e.message || "Classification failed");
    } finally {
      setClassificationLoading(false);
    }
  };

  const runEntityExtraction = async () => {
    const targetVersion = selected?.version_number ?? currentVersion?.version_number;
    if (!targetVersion) return;
    setEntitiesLoading(true);
    setEntitiesError("");
    try {
      const data = await apiFetch(`/documents/${documentId}/entities`, {
        method: "POST",
        body: JSON.stringify({ versionNumber: targetVersion }),
      });
      setEntities(data);
      await loadVersions();
    } catch (e) {
      setEntitiesError(e.message || "Entity extraction failed");
    } finally {
      setEntitiesLoading(false);
    }
  };

  if (loading) return <div className="document-details-page"><AppLayout><main className="details-container"><p>Loading document...</p></main></AppLayout></div>;
  if (error && !doc) return <div className="document-details-page"><AppLayout><main className="details-container"><div className="error-message">{error}</div><Link to="/documents">← Back to Documents</Link></main></AppLayout></div>;

  return (
    <div className="document-details-page">
      <AppLayout>
      <main className="details-container">
        <Link to="/documents" className="back-link">← Back to Documents</Link>
        <h1>Document Details</h1>
        <p>Viewing details for document {doc.id}.</p>

        <section className="document-header-card">
          <div>
            <h2>{currentVersion?.original_file_name || doc.title}</h2>
            <p>{doc.description || "No description provided."}</p>
          </div>
          <div className="document-actions">
            <button onClick={() => verifyVersion()} disabled={verify?.loading}>{verify?.loading ? "Verifying..." : "✓ Verify Integrity"}</button>
            <button onClick={preview} disabled={busy}>🔍 Preview</button>
            <button onClick={() => download()} disabled={busy}>Download</button>
          </div>
        </section>

        <section className="document-info-grid">
          <div><strong>Document ID</strong><span>{doc.id}</span></div>
          <div><strong>Document Type</strong><span>{doc.document_type || "-"}</span></div>
          <div><strong>Case ID</strong><span>{caseNumber}</span></div>
          <div><strong>Uploaded By</strong><span>{uploader}</span></div>
          <div><strong>Uploaded Date</strong><span>{formatDate(doc.created_at)}</span></div>
          <div><strong>Last Updated</strong><span>{formatDate(doc.updated_at)}</span></div>
          <div><strong>Status</strong><span>{statusText(doc.status)}</span></div>
          <div><strong>Current Version</strong><span>{versionNumber}</span></div>
        </section>

        <section className="integrity-card classification-card">
          <h2>🤖 AI Classification</h2>
          <p>Classify the currently selected version with Gemini using the project's
            document-type categories. This does not change the manually assigned
            Document Type.</p>
          <button className="classification-action" onClick={runClassification} disabled={classificationLoading}>
            {classificationLoading ? "Classifying..." : "Classify with AI"}
          </button>
          {classificationError && <div className="error-message">{classificationError}</div>}
          {shownClassification ? (
            <div className="classification-result">
              <div className="classification-line"><strong>Category</strong><span>{shownClassification.category || "-"}</span></div>
              <div className="classification-line"><strong>Confidence</strong><span>{formatPercent(shownClassification.confidence)}</span></div>
              <div className="classification-line"><strong>Reason</strong><span>{shownClassification.reason || "-"}</span></div>
              <div className="classification-line"><strong>Version</strong><span>Version {shownClassification.versionNumber}</span></div>
              {shownClassification.model && <div className="classification-line"><strong>Model</strong><span>{shownClassification.model}</span></div>}
              <p className="classification-note">AI-generated — review before relying on it.</p>
            </div>
          ) : (
            !classificationLoading && <p className="classification-empty">No AI classification stored for the selected version yet.</p>
          )}
        </section>

        <section className="integrity-card entities-card">
          <h2>🧠 AI Entity Extraction</h2>
          <p>Extract people, organizations, locations, dates, and case/reference
            numbers from the currently selected version with Gemini. This does not
            modify the manually assigned Document Type or the document contents.</p>
          <button className="entities-action" onClick={runEntityExtraction} disabled={entitiesLoading}>
            {entitiesLoading ? "Extracting..." : "Extract Entities with AI"}
          </button>
          {entitiesError && <div className="error-message">{entitiesError}</div>}
          {shownEntities ? (
            <div className="entities-result">
              {entityGroups.length > 0 ? (
                entityGroups.map((group) => (
                  <div className="entities-group" key={group}>
                    <strong>{entitiesGroupLabels[group] || group}</strong>
                    <ul className="entities-values">
                      {(shownEntities.entities[group] || []).map((value, i) => (
                        <li key={i}>{value}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="entities-note">No entities found in the selected version.</p>
              )}
              <div className="entities-line"><strong>Version</strong><span>Version {shownEntities.versionNumber}</span></div>
              {shownEntities.model && <div className="entities-line"><strong>Model</strong><span>{shownEntities.model}</span></div>}
              <p className="entities-note">AI-generated information — not authoritative legal fact.</p>
            </div>
          ) : (
            !entitiesLoading && <p className="entities-empty">No AI entity extraction stored for the selected version yet.</p>
          )}
        </section>

        <section className="integrity-card security-card">
          <h2>
            <span className="security-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L20 5V11C20 16.5 16.6 20.4 12 22C7.4 20.4 4 16.5 4 11V5L12 2Z"
                />
              </svg>
            </span>
            Security / Integrity
          </h2>
          <p><strong>SHA-256 Hash:</strong> {currentVersion?.checksum || "No checksum available"}</p>
          <p><strong>Current Version:</strong> {versionNumber}</p>
          {verify && !verify.loading && <div className={verify.success ? "success-message" : "error-message"}>{verify.message || (verify.verified ? "Integrity verified successfully." : "Integrity verification completed.")}</div>}
        </section>

        <section className="tabs-section">
          <div className="tabs">
            <button className={tab === "versions" ? "active" : ""} onClick={() => setTab("versions")}>Version History</button>
            <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity History</button>
            <button className={tab === "chain" ? "active" : ""} onClick={() => setTab("chain")}>Chain of Custody</button>
          </div>

          {tab === "versions" && (
            <div className="versions-panel">
              <label className="version-upload">
                {busy ? "Uploading..." : "+ Upload New Version"}
                <input type="file" hidden disabled={busy} onChange={uploadVersion} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png" />
              </label>
              {versionLoading ? <p>Loading versions...</p> : versions.length === 0 ? <p>No version history found.</p> : (
                <div className="version-list">
                  {versions.map(v => (
                    <button type="button" className={`version-item ${Number(selectedVersion) === Number(v.version_number) ? "selected" : ""}`} key={v.id} onClick={() => setSelectedVersion(v.version_number)}>
                      <strong>Version {v.version_number}{Number(v.version_number) === Number(versionNumber) ? " — Latest" : ""}</strong>
                      <div>{v.original_file_name}</div>
                      <div>{v.uploader_name || v.uploader_username || v.uploaded_by || "-"} · {formatDateTime(v.created_at)}</div>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <div className="version-details">
                  <h3>Version {selected.version_number} Details</h3>
                  <p><strong>File:</strong> {selected.original_file_name}</p>
                  <p><strong>MIME Type:</strong> {selected.mime_type || "-"}</p>
                  <p><strong>Size:</strong> {formatBytes(selected.file_size)}</p>
                  <p><strong>Uploaded By:</strong> {selected.uploader_name || selected.uploader_username || selected.uploaded_by || "-"}</p>
                  <p><strong>Created:</strong> {formatDateTime(selected.created_at)}</p>
                  <p><strong>SHA-256:</strong> {selected.checksum || "-"}</p>
                  <button onClick={() => download(selected.version_number)} disabled={busy}>Download This Version</button>
                  <button onClick={() => verifyVersion(selected.version_number)}>Verify This Version</button>
                </div>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="activity-panel">
              <p>Activity shown here is derived from backend document and version records.</p>
              <div className="activity-item"><strong>Document created</strong><span>{formatDateTime(doc.created_at)}</span><span>{uploader}</span></div>
              {versions.map(v => <div className="activity-item" key={v.id}><strong>Version {v.version_number} recorded</strong><span>{formatDateTime(v.created_at)}</span><span>{v.uploader_name || v.uploader_username || v.uploaded_by || "-"}</span></div>)}
            </div>
          )}

          {tab === "chain" && (
            <div className="coc-panel">
              {cocLoading ? (
                <p>Loading chain of custody...</p>
              ) : cocError && !coc ? (
                <div className="error-message">{cocError}</div>
              ) : !coc ? null : (
                <>
                  <div className="coc-header">
                    <div><strong>Document:</strong> {coc.document.title}</div>
                    {coc.case && <div><strong>Case:</strong> {coc.case.caseNumber}</div>}
                    <div><strong>Current Version:</strong> {coc.summary.currentVersion}</div>
                    <div><strong>Uploaded by:</strong> {coc.document.uploaderName || coc.document.uploaderUsername || coc.document.uploadedBy || "-"}</div>
                    <div><strong>Uploaded on:</strong> {formatDateTime(coc.document.createdAt)}</div>
                  </div>

                  {(() => {
                    const timeline = [
                      ...(coc.versions || []).map(v => ({ type: "version", ...v, ts: v.createdAt })),
                      ...(coc.reviews || []).map(r => ({ type: "review", ...r, ts: r.createdAt })),
                      ...(coc.caseReviews || []).map(r => ({ type: "caseReview", ...r, ts: r.createdAt })),
                      ...(coc.auditEvents || [])
                        .filter(e => e.scope === "case" && !CASE_REVIEW_AUDIT_ACTIONS.has(e.action))
                        .map(e => ({ type: "caseEvent", ...e, ts: e.createdAt })),
                    ].sort((a, b) => new Date(a.ts) - new Date(b.ts));

                    if (timeline.length === 0) {
                      return <p className="coc-empty">No custody history recorded for this document.</p>;
                    }

                    return (
                      <div className="coc-timeline">
                        {timeline.map(item => {
                          if (item.type === "version") {
                            return (
                              <div className="coc-card coc-card-version" key={`v-${item.id}`}>
                                <div className="coc-card-head">
                                  <span className="coc-card-title">
                                    <ScopeTag scope="document" />
                                    <strong>Version {item.versionNumber}{Number(item.versionNumber) === Number(coc.summary.currentVersion) ? " — Current" : ""}</strong>
                                  </span>
                                  <span className="coc-date">{formatDateTime(item.createdAt)}</span>
                                </div>
                                <div className="coc-row"><span>Created by</span><span>{item.uploaderName || item.uploaderUsername || item.uploadedBy || "-"}</span></div>
                                <div className="coc-row"><span>File</span><span>{item.originalFileName}</span></div>
                                <div className="coc-row"><span>MIME type</span><span>{item.mimeType || "-"}</span></div>
                                <div className="coc-row"><span>Size</span><span>{formatBytes(item.fileSize)}</span></div>
                                <div className="coc-row coc-row-hash"><span>SHA-256</span><span className="coc-hash" title={item.checksum || ""}>{formatChecksum(item.checksum)}</span></div>
                                <div className="coc-row"><span>Status</span><span>{Number(item.versionNumber) === Number(coc.summary.currentVersion) ? "Current version" : "Superseded (preserved)"}</span></div>
                                {(() => {
                                  const st = integrityState(item, verifyResults[item.versionNumber]);
                                  const badge = integrityBadge[st] || integrityBadge.not_verified;
                                  const live = verifyResults[item.versionNumber];
                                  return (
                                    <div className="coc-integrity-row">
                                      <span className={`coc-badge ${badge.className}`}>{badge.label}</span>
                                      {live && !live.loading && st === "verified" && <span className="coc-note">Calculated hash matches stored checksum</span>}
                                      {live && !live.loading && st === "integrity_failure" && <span className="coc-note">Calculated hash differs from stored checksum</span>}
                                      {live && !live.loading && st === "verification_error" && <span className="coc-note">{live.message}</span>}
                                      <button
                                        className="coc-verify-btn"
                                        disabled={verifyingVersion === item.versionNumber}
                                        onClick={() => verifyChainVersion(item.versionNumber)}
                                      >
                                        {verifyingVersion === item.versionNumber ? "Verifying..." : "Verify this version"}
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          }

                          if (item.type === "review") {
                            return (
                              <div className="coc-card coc-card-review" key={`r-${item.id}`}>
                                <div className="coc-card-head">
                                  <span className="coc-card-title">
                                    <ScopeTag scope="document" />
                                    <strong>Review — {statusText(item.action)}</strong>
                                  </span>
                                  <span className="coc-date">{formatDateTime(item.createdAt)}</span>
                                </div>
                                <div className="coc-row"><span>Reviewed by</span><span>{item.reviewerName || item.reviewerUsername || item.reviewerId || "-"}</span></div>
                                <div className="coc-row"><span>Decision</span><span>{statusText(item.action)}</span></div>
                                <div className="coc-row"><span>Comment</span><span>{item.reviewNote || "—"}</span></div>
                              </div>
                            );
                          }

                          if (item.type === "caseReview") {
                            return (
                              <div className="coc-card coc-card-case" key={`cr-${item.id}`}>
                                <div className="coc-card-head">
                                  <span className="coc-card-title">
                                    <ScopeTag scope="case" />
                                    <strong>Case review — {statusText(item.action)}</strong>
                                  </span>
                                  <span className="coc-date">{formatDateTime(item.createdAt)}</span>
                                </div>
                                <div className="coc-row"><span>Reviewed by</span><span>{item.reviewerName || item.reviewerUsername || item.reviewerId || "-"}</span></div>
                                <div className="coc-row"><span>Decision</span><span>{statusText(item.action)}</span></div>
                                <div className="coc-row"><span>Comment</span><span>{item.reviewNote || "—"}</span></div>
                                {item.signature != null && (
                                  <div className="coc-signature">
                                    <div className="coc-signature-title">Digital Approval Signature</div>
                                    {item.signature.exists === true && item.signature.valid === true ? (
                                      <>
                                        <div className="coc-signature-status coc-signature-valid">✓ Signature Valid</div>
                                        <div className="coc-row"><span>Algorithm</span><span>{item.signature.algorithm || "-"}</span></div>
                                        <div className="coc-row"><span>Key ID</span><span>{item.signature.keyId || "-"}</span></div>
                                        <div className="coc-row"><span>Signed At</span><span>{formatDateTime(item.signature.signedAt)}</span></div>
                                      </>
                                    ) : item.signature.exists === true ? (
                                      <div className="coc-signature-status coc-signature-invalid">✕ Signature Invalid</div>
                                    ) : (
                                      <div className="coc-signature-status coc-signature-pending">Not Digitally Signed</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="coc-card coc-card-case" key={`ce-${item.id}`}>
                              <div className="coc-card-head">
                                <span className="coc-card-title">
                                  <ScopeTag scope="case" />
                                  <strong>{auditActionText(item.action)}</strong>
                                </span>
                                <span className="coc-date">{formatDateTime(item.createdAt)}</span>
                              </div>
                              <div className="coc-row"><span>By</span><span>{item.userName || item.userUsername || item.userId || "System"}</span></div>
                              {item.details && Object.keys(item.details).length > 0 && (
                                <div className="coc-row"><span>Details</span><span>{JSON.stringify(item.details)}</span></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div className="coc-section">
                    <h3>Audit Events</h3>
                    {coc.auditEvents.length === 0
                      ? <p className="coc-empty">No audit events recorded for this document.</p>
                      : (
                        <div className="coc-audit-list">
                          {coc.auditEvents.map(ev => (
                            <div className="coc-audit-item" key={ev.id}>
                              <div className="coc-audit-main">
                                <span className="coc-card-title">
                                  <ScopeTag scope={ev.scope || "document"} />
                                  <strong>{auditActionText(ev.action)}</strong>
                                </span>
                                <span className="coc-date">{formatDateTime(ev.createdAt)}</span>
                              </div>
                              <div className="coc-row"><span>By</span><span>{ev.userName || ev.userUsername || ev.userId || "System"}</span></div>
                              {ev.details && Object.keys(ev.details).length > 0 && (
                                <div className="coc-audit-details">{JSON.stringify(ev.details)}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>

                  <div className="coc-section">
                    <h3>Integrity Summary</h3>
                    <div className="coc-summary-grid">
                      <div><strong>Versions:</strong> {coc.summary.totalVersions}</div>
                      <div><strong>Verified:</strong> {coc.summary.integrity.verified}</div>
                      <div><strong>Failed checks:</strong> {coc.summary.integrity.failed}</div>
                      <div><strong>Not verified:</strong> {coc.summary.integrity.notVerified}</div>
                    </div>
                    <p className="coc-note">Integrity status reflects the last recorded verification per version. Use "Verify this version" to re-check the stored file against its recorded SHA-256 checksum.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </main>
      </AppLayout>

      {showPreview && (
        <div className="preview-modal" onClick={() => setShowPreview(false)}>
          <div className="preview-content" onClick={e => e.stopPropagation()}>
            <div className="preview-header"><strong>{currentVersion?.original_file_name || doc.title}</strong><button onClick={() => setShowPreview(false)}>✕</button></div>
           {previewText ? (
  <pre
    style={{
      flex: 1,
      margin: 0,
      padding: "20px",
      overflow: "auto",
      background: "#ffffff",
      color: "#111827",
      fontFamily: "monospace",
      fontSize: "15px",
      lineHeight: "1.6",
      whiteSpace: "pre-wrap",
      textAlign: "left",
    }}
  >
    {previewText}
  </pre>
) : (
  <iframe
    title="Document preview"
    src={previewUrl}
    style={{
      flex: 1,
      width: "100%",
      border: 0,
      background: "#ffffff",
    }}
  />
)}
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DocumentDetailsPage;
