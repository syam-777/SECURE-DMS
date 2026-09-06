import { useState, useEffect, useCallback } from "react";
import { NavLink, Link, useNavigate, useParams } from "react-router-dom";
import "./DocumentDetailsPage.css";
import { apiFetch, API_BASE_URL } from "../api/api";

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
function statusText(value) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "-";
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
  const navigate = useNavigate();
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

  useEffect(() => { loadDocument(); loadVersions(); }, [loadDocument, loadVersions]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const caseNumber = cases.find(c => String(c.id) === String(doc?.case_id))?.case_number || doc?.case_number || "-";
  const uploader = doc?.uploader_name || doc?.uploader_username || doc?.uploaded_by || "-";
  const versionNumber = doc?.current_version ?? currentVersion?.version_number ?? "-";
  const selected = versions.find(v => Number(v.version_number) === Number(selectedVersion)) || currentVersion;

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
      alert("New document version uploaded successfully.");
      await loadDocument(); await loadVersions();
    } catch (err) { alert(err.message || "Upload failed"); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login");
  };

  if (loading) return <div className="document-details-page"><header className="topbar"><div className="brand">🔒 Secure DMS</div></header><main className="details-container"><p>Loading document...</p></main></div>;
  if (error && !doc) return <div className="document-details-page"><header className="topbar"><div className="brand">🔒 Secure DMS</div></header><main className="details-container"><div className="error-message">{error}</div><Link to="/documents">← Back to Documents</Link></main></div>;

  return (
    <div className="document-details-page">
      <header className="topbar">
        <div className="brand">🔒 Secure DMS</div>
        <nav>
          <NavLink to="/dashboard">Dashboard</NavLink><NavLink to="/cases">Cases</NavLink><NavLink to="/documents">Documents</NavLink>
          <NavLink to="/ai-assistant">AI Assistant</NavLink><NavLink to="/search">Search</NavLink><NavLink to="/audit-logs">Audit Logs</NavLink>{JSON.parse(localStorage.getItem("user") || "{}").role === "ADMIN" && <NavLink to="/users">User Management</NavLink>}<NavLink to="/passkey">Passkey</NavLink>
          <button onClick={logout}>Logout</button>
        </nav>
      </header>

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

        <section className="integrity-card">
          <h2>🛡 Security / Integrity</h2>
          <p><strong>SHA-256 Hash:</strong> {currentVersion?.checksum || "No checksum available"}</p>
          <p><strong>Current Version:</strong> {versionNumber}</p>
          {verify && !verify.loading && <div className={verify.success ? "success-message" : "error-message"}>{verify.message || (verify.verified ? "Integrity verified successfully." : "Integrity verification completed.")}</div>}
        </section>

        <section className="tabs-section">
          <div className="tabs">
            <button className={tab === "versions" ? "active" : ""} onClick={() => setTab("versions")}>Version History</button>
            <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity History</button>
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
        </section>
      </main>

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
    </div>
  );
}

export default DocumentDetailsPage;
